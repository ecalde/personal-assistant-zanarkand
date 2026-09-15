import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapperError } from "../dbMappers";
import { parseExtractedStructure, parseResumeVersionRow } from "./resumeDbMappers";
import { ResumeIngestError, ingestResumeOriginal } from "./resumeIngest";
import { readResumeBlockGraph } from "./resumeBlocks";
import { RESUME_BOOKMARK_PREFIX } from "./resumeOoxmlWrite";
import { readResumeOoxml } from "./resumeOoxmlRead";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateStructureNotePath = join(
  repoRoot,
  "fixtures/resume/private/extracted-structure.local.json"
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CREATED = "2026-09-15T00:00:00.000Z";
const SHA256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Local zip header, i.e. what a DOCX smuggled into jsonb would look like. */
const ZIP_BASE64_PREFIX = "UEsDB";

function bytesOf(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

/** Deterministic bookmark-name factory so the persisted structure is stable. */
function seqNames(): () => string {
  let i = 0;
  return () => `${RESUME_BOOKMARK_PREFIX}test-${i++}`;
}

function versionRow(extractedStructure: unknown): Record<string, unknown> {
  return {
    id: VERSION_ID,
    user_id: USER_ID,
    resume_id: RESUME_ID,
    parent_version_id: null,
    version_n: 1,
    label: "Base",
    source_kind: "upload",
    original_storage_path: `${USER_ID}/${RESUME_ID}/original/${SHA256}.docx`,
    working_storage_path: `${USER_ID}/${RESUME_ID}/versions/${VERSION_ID}.docx`,
    sha256: SHA256,
    extracted_structure: extractedStructure,
    page_count_estimated: null,
    created_at: CREATED,
  };
}

describe("ingestResumeOriginal", () => {
  it("bookmarks the working copy and leaves the original bytes untouched", async () => {
    const original = bytesOf(geometryCanaryPath);
    const inputCopy = original.slice();
    const inventory = await readResumeOoxml(original);

    const result = await ingestResumeOriginal(original, {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    expect(Buffer.from(original)).toEqual(Buffer.from(inputCopy));
    expect(result.addedBookmarkCount).toBe(inventory.paragraphCount);
    expect(result.reusedBookmarkCount).toBe(0);

    // The immutable original still carries no ids; only the working copy does.
    const originalGraph = await readResumeBlockGraph(original);
    expect(result.extractedStructure.graph?.blocks).toHaveLength(originalGraph.blocks.length);
    expect(result.extractedStructure.graph?.blocks.map((block) => block.text)).toEqual(
      originalGraph.blocks.map((block) => block.text)
    );
  });

  it("persists one identified block per paragraph plus a contiguous block map", async () => {
    const result = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    const blocks = result.extractedStructure.graph?.blocks ?? [];
    const blockMap = result.extractedStructure.blockMap ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    expect(blockMap).toHaveLength(blocks.length);

    blocks.forEach((block, index) => {
      expect(block.order).toBe(index);
      expect(block.blockId).not.toBeNull();
      expect(block.bookmarkName).toBe(`${RESUME_BOOKMARK_PREFIX}${block.blockId}`);
      expect(block.runs.map((run) => run.text).join("")).toBe(block.text);
      expect(blockMap[index]).toEqual({
        blockId: block.blockId,
        bookmarkName: block.bookmarkName,
        order: index,
      });
    });

    // Mentions can only point at blocks that exist in the persisted graph.
    const blockIds = new Set(blocks.map((block) => block.blockId));
    for (const mention of result.extractedStructure.mentionIndex) {
      expect(blockIds.has(mention.blockId)).toBe(true);
    }
  });

  it("freezes an imported_source ledger keyed to the new version", async () => {
    const result = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    const blockIds = new Set(
      (result.extractedStructure.graph?.blocks ?? []).map((block) => block.blockId)
    );
    for (const fact of result.importFactLedger.facts) {
      expect(fact.provenance).toBe("imported_source");
      expect(fact.firstSeenVersionId).toBe(VERSION_ID);
      expect(fact.presentInWorkingDocument).toBe(true);
      expect(fact.sourceBlockIds.length).toBeGreaterThan(0);
      for (const sourceBlockId of fact.sourceBlockIds) {
        // Import facts come from the original text but carry working-copy ids.
        expect(blockIds.has(sourceBlockId)).toBe(true);
      }
    }
  });

  it("records ATS warnings as warnings only, with no score", async () => {
    const result = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    expect(Array.isArray(result.extractedStructure.atsWarnings)).toBe(true);
    for (const item of result.extractedStructure.atsWarnings ?? []) {
      expect(["info", "warning"]).toContain(item.severity);
      expect(item.occurrences).toBeGreaterThanOrEqual(1);
    }
    expect(Object.keys(result.extractedStructure).sort()).toEqual([
      "atsWarnings",
      "blockMap",
      "graph",
      "mentionIndex",
    ]);
  });

  it("keeps distinct bold/italic/hyperlink runs in the persisted graph", async () => {
    const result = await ingestResumeOriginal(bytesOf(mixedCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    const mixed = (result.extractedStructure.graph?.blocks ?? []).find((block) =>
      block.text.startsWith("MIXED_RUN_PARAGRAPH:")
    );
    expect(mixed).toBeDefined();
    if (!mixed) return;

    expect(mixed.runs.length).toBeGreaterThan(1);
    expect(mixed.runs.filter((run) => run.bold).map((run) => run.text)).toEqual(["TeamAlpha"]);
    expect(mixed.runs.filter((run) => run.italic).map((run) => run.text)).toEqual(["APIs"]);
    const linked = mixed.runs.filter((run) => run.hyperlinkRelId !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.text).toBe("ExampleCorp");
  });

  it("is idempotent: re-ingesting the working copy reuses every block id", async () => {
    const first = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });
    const second = await ingestResumeOriginal(first.workingBytes, {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    expect(second.addedBookmarkCount).toBe(0);
    expect(second.reusedBookmarkCount).toBe(first.extractedStructure.blockMap?.length);
    expect(second.extractedStructure.blockMap).toEqual(first.extractedStructure.blockMap);
    expect(second.extractedStructure.mentionIndex).toEqual(first.extractedStructure.mentionIndex);
  });

  it("fails closed without a version id or on bytes that are not a DOCX package", async () => {
    const original = bytesOf(geometryCanaryPath);
    await expect(ingestResumeOriginal(original, { versionId: "  " })).rejects.toThrow(
      ResumeIngestError
    );
    await expect(
      ingestResumeOriginal(new Uint8Array([1, 2, 3, 4]), { versionId: VERSION_ID })
    ).rejects.toThrow();
  });
});

describe("persisted extracted_structure", () => {
  it("round-trips through the version-row mappers", async () => {
    const result = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    // The jsonb the remote layer writes must survive a read back verbatim.
    const asJsonb = JSON.parse(JSON.stringify(result.extractedStructure)) as unknown;
    expect(parseExtractedStructure(asJsonb)).toEqual(result.extractedStructure);

    const version = parseResumeVersionRow(versionRow(asJsonb));
    expect(version.extractedStructure).toEqual(result.extractedStructure);
    expect(version.pageCountEstimated).toBeNull();
  });

  it("carries document structure only — never the DOCX bytes", async () => {
    const result = await ingestResumeOriginal(bytesOf(geometryCanaryPath), {
      versionId: VERSION_ID,
      newBookmarkName: seqNames(),
    });

    const serialized = JSON.stringify(result.extractedStructure);
    expect(serialized).not.toContain(ZIP_BASE64_PREFIX);
    expect(serialized).not.toContain("word/document.xml");
    expect(serialized).not.toContain("<w:p");

    // And the mapper refuses a structure that tries to smuggle them in.
    const docxBase64 = Buffer.from(bytesOf(geometryCanaryPath)).toString("base64");
    expect(() =>
      parseExtractedStructure({ ...result.extractedStructure, docxBase64 })
    ).toThrow(MapperError);
    expect(() => parseExtractedStructure({ mentionIndex: [], graph: docxBase64 })).toThrow(
      MapperError
    );
    expect(() =>
      parseExtractedStructure({
        mentionIndex: [],
        graph: { blocks: [{ order: 0, text: "x", blockId: null, bookmarkName: null, runs: [] }] },
        blockMap: [],
        atsWarnings: [],
        docx: docxBase64,
      })
    ).toThrow(MapperError);
  });
});

describe("private resume ingest (RESUME_PRIVATE_FIXTURE=1)", () => {
  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "produces a persistable structure and a frozen ledger, recording counts only",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const original = bytesOf(privateCanaryPath);
      const result = await ingestResumeOriginal(original, { versionId: VERSION_ID });

      const blocks = result.extractedStructure.graph?.blocks ?? [];
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every((block) => block.blockId !== null)).toBe(true);
      expect(result.extractedStructure.blockMap).toHaveLength(blocks.length);
      expect(result.importFactLedger.facts.length).toBeGreaterThan(0);
      expect(
        result.importFactLedger.facts.every((fact) => fact.provenance === "imported_source")
      ).toBe(true);

      const asJsonb = JSON.parse(JSON.stringify(result.extractedStructure)) as unknown;
      expect(parseExtractedStructure(asJsonb)).toEqual(result.extractedStructure);
      expect(JSON.stringify(result.extractedStructure)).not.toContain(ZIP_BASE64_PREFIX);

      // Aggregate counts only: no resume text ever lands on disk here.
      mkdirSync(dirname(privateStructureNotePath), { recursive: true });
      writeFileSync(
        privateStructureNotePath,
        `${JSON.stringify(
          {
            blockCount: blocks.length,
            blockMapCount: result.extractedStructure.blockMap?.length ?? 0,
            mentionCount: result.extractedStructure.mentionIndex.length,
            importedFactCount: result.importFactLedger.facts.length,
            atsWarningCount: result.extractedStructure.atsWarnings?.length ?? 0,
            structureJsonBytes: JSON.stringify(result.extractedStructure).length,
            workingBytesAdded: result.addedBookmarkCount,
            workingBytesReused: result.reusedBookmarkCount,
          },
          null,
          2
        )}\n`
      );
    }
  );
});
