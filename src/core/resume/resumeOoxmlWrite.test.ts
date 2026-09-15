import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readResumeBlockGraph, readIdentifiedResumeBlockGraph } from "./resumeBlocks";
import { readResumeOoxml } from "./resumeOoxmlRead";
import {
  RESUME_BOOKMARK_PREFIX,
  ResumeOoxmlWriteError,
  injectBookmarksIntoDocumentXml,
  injectResumeBookmarks,
  readParagraphBookmarkNames,
  readResumeBlockMap,
} from "./resumeOoxmlWrite";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
// Gitignored outputs for the manual Word check (fixtures/resume/public/out/ and private/).
const geometryBookmarkedOut = join(
  repoRoot,
  "fixtures/resume/public/out/geometry-canary.bookmarked.docx"
);
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateBookmarkedOut = join(repoRoot, "fixtures/resume/private/current-resume.bookmarked.docx");
const privateBlockMapPath = join(repoRoot, "fixtures/resume/private/block-map.local.json");

function writeArtifact(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

const MIXED_PARAGRAPH =
  "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window.";

/** Deterministic bookmark-name factory so tests are stable. */
function seqNames(): () => string {
  let i = 0;
  return () => `${RESUME_BOOKMARK_PREFIX}test-${i++}`;
}

/** Every `w:bookmarkStart` id in document order. */
function bookmarkStartIds(xml: string): number[] {
  const re = /<w:bookmarkStart\b[^>]*\bw:id="(-?\d+)"/g;
  const ids: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) ids.push(Number.parseInt(match[1] ?? "", 10));
  return ids;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>`;
}

describe("injectBookmarksIntoDocumentXml", () => {
  it("wraps every paragraph in a pa_ bookmark, honoring pPr order", () => {
    const xml = docXml(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Alpha</w:t></w:r></w:p>' +
        "<w:p><w:r><w:t>Beta</w:t></w:r></w:p>" +
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'
    );

    const result = injectBookmarksIntoDocumentXml(xml, seqNames());

    expect(result.addedCount).toBe(2);
    expect(result.reusedCount).toBe(0);
    expect(result.blockMap).toEqual([
      { blockId: "test-0", bookmarkName: "pa_test-0", order: 0 },
      { blockId: "test-1", bookmarkName: "pa_test-1", order: 1 },
    ]);

    // Re-reading the produced XML yields the same names in order.
    expect(readParagraphBookmarkNames(result.documentXml)).toEqual(["pa_test-0", "pa_test-1"]);

    // The first bookmark start sits after the paragraph's pPr and before its text.
    const pPrEnd = result.documentXml.indexOf("</w:pPr>");
    const firstBookmark = result.documentXml.indexOf('w:name="pa_test-0"');
    const firstText = result.documentXml.indexOf("Alpha");
    expect(pPrEnd).toBeGreaterThanOrEqual(0);
    expect(firstBookmark).toBeGreaterThan(pPrEnd);
    expect(firstText).toBeGreaterThan(firstBookmark);

    // Ids are unique and minted from zero.
    expect(bookmarkStartIds(result.documentXml)).toEqual([0, 1]);
  });

  it("is idempotent: a second pass reuses existing pa_ bookmarks unchanged", () => {
    const xml = docXml("<w:p><w:r><w:t>Alpha</w:t></w:r></w:p><w:p><w:r><w:t>Beta</w:t></w:r></w:p>");
    const first = injectBookmarksIntoDocumentXml(xml, seqNames());
    const second = injectBookmarksIntoDocumentXml(first.documentXml, seqNames());

    expect(second.addedCount).toBe(0);
    expect(second.reusedCount).toBe(2);
    expect(second.blockMap).toEqual(first.blockMap);
    // No new ids were minted on the reuse pass.
    expect(bookmarkStartIds(second.documentXml)).toEqual(bookmarkStartIds(first.documentXml));
  });

  it("mints new ids above the highest existing bookmark id", () => {
    const xml = docXml(
      '<w:p><w:bookmarkStart w:id="7" w:name="Other"/><w:bookmarkEnd w:id="7"/><w:r><w:t>Gamma</w:t></w:r></w:p>'
    );
    const result = injectBookmarksIntoDocumentXml(xml, seqNames());

    expect(result.addedCount).toBe(1);
    const ids = bookmarkStartIds(result.documentXml);
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(ids).toContain(7);
    expect(ids).toContain(8); // new id is max + 1
  });

  it("reuses a pre-existing pa_ bookmark and only adds where missing", () => {
    const xml = docXml(
      '<w:p><w:bookmarkStart w:id="3" w:name="pa_keepme"/><w:r><w:t>One</w:t></w:r><w:bookmarkEnd w:id="3"/></w:p>' +
        "<w:p><w:r><w:t>Two</w:t></w:r></w:p>"
    );
    const result = injectBookmarksIntoDocumentXml(xml, seqNames());

    expect(result.reusedCount).toBe(1);
    expect(result.addedCount).toBe(1);
    expect(result.blockMap[0]).toEqual({ blockId: "keepme", bookmarkName: "pa_keepme", order: 0 });
    expect(result.blockMap[1]?.bookmarkName).toBe("pa_test-0");
  });

  it("rejects a bookmark name that lacks the pa_ prefix", () => {
    const xml = docXml("<w:p><w:r><w:t>Alpha</w:t></w:r></w:p>");
    expect(() => injectBookmarksIntoDocumentXml(xml, () => "nope-1")).toThrow(ResumeOoxmlWriteError);
  });
});

describe("injectResumeBookmarks (working DOCX)", () => {
  it("bookmarks every paragraph without altering text, and does not mutate the input", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const inputCopy = original.slice();
    const inventory = await readResumeOoxml(original);

    const injected = await injectResumeBookmarks(original);

    // Input buffer is untouched (immutable-original guarantee at the API level).
    expect(Buffer.from(original)).toEqual(Buffer.from(inputCopy));

    // The original bytes carried no pa_ bookmarks; the injected copy has one per paragraph.
    expect(await readResumeBlockMap(original)).toEqual([]);
    expect(injected.addedCount).toBe(inventory.paragraphCount);
    expect(injected.reusedCount).toBe(0);
    expect(injected.blockMap).toHaveLength(inventory.paragraphCount);
    expect(new Set(injected.blockMap.map((entry) => entry.bookmarkName)).size).toBe(
      inventory.paragraphCount
    );

    // Bookmarks are invisible to the text projection: block texts are unchanged.
    const before = await readResumeBlockGraph(original);
    const after = await readResumeBlockGraph(injected.bytes);
    expect(after.blocks.map((block) => block.text)).toEqual(before.blocks.map((block) => block.text));

    // The block map round-trips out of the produced bytes.
    expect(await readResumeBlockMap(injected.bytes)).toEqual(injected.blockMap);

    // Emit a bookmarked working copy for the manual Word check (gitignored).
    writeArtifact(geometryBookmarkedOut, injected.bytes);
  });

  it("keeps ids stable across a real zip round-trip (reuse-first)", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const first = await injectResumeBookmarks(original);
    const second = await injectResumeBookmarks(first.bytes);

    expect(second.addedCount).toBe(0);
    expect(second.reusedCount).toBe(first.blockMap.length);
    expect(second.blockMap.map((entry) => entry.bookmarkName)).toEqual(
      first.blockMap.map((entry) => entry.bookmarkName)
    );
  });

  it("preserves mixed bold/italic/hyperlink runs after bookmarking", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const graph = await readIdentifiedResumeBlockGraph(injected.bytes);

    const mixed = graph.blocks.find((block) => block.text === MIXED_PARAGRAPH);
    expect(mixed).toBeDefined();
    if (!mixed) return;

    // The paragraph now has a stable id...
    expect(mixed.bookmarkName).not.toBeNull();
    expect(mixed.blockId).toBe(mixed.bookmarkName?.slice(RESUME_BOOKMARK_PREFIX.length));

    // ...and its distinct runs and hyperlink relationship survived.
    expect(mixed.runs.length).toBeGreaterThan(1);
    expect(mixed.runs.filter((run) => run.bold).map((run) => run.text)).toEqual(["TeamAlpha"]);
    expect(mixed.runs.filter((run) => run.italic).map((run) => run.text)).toEqual(["APIs"]);
    const linked = mixed.runs.filter((run) => run.hyperlinkRelId !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.text).toBe("ExampleCorp");
    expect(linked[0]?.hyperlinkRelId).toBe("rId5");
  });

  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "bookmarks the private resume with stable ids and emits a Word check copy",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const original = new Uint8Array(readFileSync(privateCanaryPath));
      const before = await readResumeBlockGraph(original);

      const first = await injectResumeBookmarks(original);
      expect(first.addedCount).toBe(before.blocks.length);
      expect(first.reusedCount).toBe(0);

      // Text is untouched by bookmarking.
      const after = await readResumeBlockGraph(first.bytes);
      expect(after.blocks.map((block) => block.text)).toEqual(
        before.blocks.map((block) => block.text)
      );

      // Ids survive a second pass (re-open / re-read) unchanged.
      const second = await injectResumeBookmarks(first.bytes);
      expect(second.addedCount).toBe(0);
      expect(second.reusedCount).toBe(first.blockMap.length);
      expect(second.blockMap.map((entry) => entry.bookmarkName)).toEqual(
        first.blockMap.map((entry) => entry.bookmarkName)
      );

      // Working copy for Edwin's Word check + aggregate-only local note (no text).
      writeArtifact(privateBookmarkedOut, first.bytes);
      mkdirSync(dirname(privateBlockMapPath), { recursive: true });
      writeFileSync(
        privateBlockMapPath,
        `${JSON.stringify(
          { paragraphCount: before.blocks.length, bookmarkCount: first.blockMap.length },
          null,
          2
        )}\n`
      );
    }
  );
});
