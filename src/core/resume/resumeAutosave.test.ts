import { describe, expect, it } from "vitest";
import { MapperError } from "../dbMappers";
import {
  assertWorkingCopyUploadPath,
  decideWorkingCopyUpload,
  extractedStructureAfterWorkingEdit,
  resumeBytesEqual,
  sha256HexOfBytes,
  workingVersionRowPatch,
} from "./resumeAutosave";
import type { ResumeExtractedStructure, ResumeStructureBlock } from "./resumeModel";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const BLOCK_ID = "44444444-4444-4444-8444-444444444444";
const ORIGINAL_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function block(text: string): ResumeStructureBlock {
  return {
    order: 0,
    text,
    blockId: BLOCK_ID,
    bookmarkName: `pa_${BLOCK_ID}`,
    runs: [
      {
        text,
        bold: false,
        italic: false,
        underline: false,
        font: null,
        sizePt: null,
        hyperlinkRelId: null,
      },
    ],
  };
}

const PREVIOUS: ResumeExtractedStructure = {
  mentionIndex: [],
  graph: { blocks: [block("Built inventory sync.")] },
  blockMap: [{ blockId: BLOCK_ID, bookmarkName: `pa_${BLOCK_ID}`, order: 0 }],
  atsWarnings: [],
};

describe("decideWorkingCopyUpload", () => {
  it("uploads only when last-good bytes differ from the last uploaded copy", () => {
    const lastGood = new Uint8Array([1, 2, 3]);
    const uploaded = new Uint8Array([1, 2, 3]);
    const patched = new Uint8Array([1, 2, 9]);

    expect(decideWorkingCopyUpload({ lastGoodBytes: null, lastUploadedBytes: null })).toBe(
      "skip_missing"
    );
    expect(
      decideWorkingCopyUpload({ lastGoodBytes: lastGood, lastUploadedBytes: uploaded })
    ).toBe("skip_unchanged");
    expect(
      decideWorkingCopyUpload({ lastGoodBytes: patched, lastUploadedBytes: uploaded })
    ).toBe("upload");
  });

  it("skips when a PatchError left last-good equal to the uploaded original", () => {
    const downloaded = new Uint8Array([10, 11, 12]);
    expect(
      decideWorkingCopyUpload({
        lastGoodBytes: downloaded,
        lastUploadedBytes: downloaded,
      })
    ).toBe("skip_unchanged");
  });
});

describe("assertWorkingCopyUploadPath", () => {
  it("accepts the canonical versions/ object and rejects original/", () => {
    expect(() =>
      assertWorkingCopyUploadPath(
        `${USER_ID}/${RESUME_ID}/versions/${VERSION_ID}.docx`,
        USER_ID
      )
    ).not.toThrow();

    expect(() =>
      assertWorkingCopyUploadPath(
        `${USER_ID}/${RESUME_ID}/original/${ORIGINAL_SHA}.docx`,
        USER_ID
      )
    ).toThrow(MapperError);
  });
});

describe("extractedStructureAfterWorkingEdit", () => {
  it("refreshes the mention index from the flushed graph and keeps blockMap", () => {
    const graph = { blocks: [block("Built REST APIs for inventory sync.")] };
    const next = extractedStructureAfterWorkingEdit(PREVIOUS, graph);

    expect(next.graph).toEqual(graph);
    expect(next.blockMap).toEqual(PREVIOUS.blockMap);
    expect(next.atsWarnings).toEqual(PREVIOUS.atsWarnings);
    expect(next.mentionIndex.some((mention) => mention.normalized === "rest api")).toBe(true);
    expect(next).not.toHaveProperty("facts");
    expect(next).not.toHaveProperty("importFactLedger");
    expect(JSON.stringify(next)).not.toMatch(/docxBase64|atsScore|"docx"/);
  });

  it("accepts an emptied paragraph (no runs) after a large deletion", () => {
    const emptied = block("");
    emptied.runs = [];
    const next = extractedStructureAfterWorkingEdit(PREVIOUS, { blocks: [emptied] });
    expect(next.graph?.blocks[0]?.text).toBe("");
    expect(next.graph?.blocks[0]?.runs).toEqual([]);
    expect(next.blockMap).toEqual(PREVIOUS.blockMap);
  });

  it("does not mutate the previous snapshot or the import ledger shape", () => {
    const snapshot = JSON.stringify(PREVIOUS);
    extractedStructureAfterWorkingEdit(PREVIOUS, {
      blocks: [block("Built REST APIs for inventory sync.")],
    });
    expect(JSON.stringify(PREVIOUS)).toBe(snapshot);
  });
});

describe("workingVersionRowPatch", () => {
  it("updates only working sha256 and extracted_structure", () => {
    const structure = extractedStructureAfterWorkingEdit(PREVIOUS, {
      blocks: [block("Built REST APIs for inventory sync.")],
    });
    const patch = workingVersionRowPatch({
      workingSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      extractedStructure: structure,
    });
    expect(Object.keys(patch).sort()).toEqual(["extracted_structure", "sha256"]);
    expect(patch).not.toHaveProperty("original_storage_path");
    expect(patch).not.toHaveProperty("working_storage_path");
    expect(patch).not.toHaveProperty("import_fact_ledger");
  });
});

describe("resumeBytesEqual / sha256HexOfBytes", () => {
  it("compares byte-for-byte and hashes a copy", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    expect(resumeBytesEqual(a, b)).toBe(true);
    expect(resumeBytesEqual(a, c)).toBe(false);
    expect(await sha256HexOfBytes(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toEqual(new Uint8Array([1, 2, 3]));
  });
});
