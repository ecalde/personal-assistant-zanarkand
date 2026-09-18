import { describe, expect, it } from "vitest";
import { extractedStructureAfterWorkingEdit } from "./resumeAutosave";
import {
  ResumeDiffError,
  diffResumeBlocksAgainstVersionOne,
  resumeBlockDiffCountLabel,
  versionOnePlaintextByBlockId,
} from "./resumeDiff";
import type {
  ResumeBlockMapEntry,
  ResumeExtractedStructure,
  ResumeStructureBlock,
} from "./resumeModel";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function mapEntry(blockId: string, order: number): ResumeBlockMapEntry {
  return { blockId, bookmarkName: `pa_${blockId}`, order };
}

function block(blockId: string, text: string, order: number): ResumeStructureBlock {
  return {
    order,
    text,
    blockId,
    bookmarkName: `pa_${blockId}`,
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

describe("versionOnePlaintextByBlockId", () => {
  it("aligns original paragraph order to ingest block ids", () => {
    const byId = versionOnePlaintextByBlockId(
      ["Python APIs", "REST APIs"],
      [mapEntry(ID_A, 0), mapEntry(ID_B, 1)]
    );
    expect(byId[ID_A]).toBe("Python APIs");
    expect(byId[ID_B]).toBe("REST APIs");
  });

  it("NFC-normalizes original lines", () => {
    const byId = versionOnePlaintextByBlockId(["Cafe\u0301"], [mapEntry(ID_A, 0)]);
    expect(byId[ID_A]).toBe("Café");
  });

  it("fails closed when paragraph count does not match the block map", () => {
    expect(() =>
      versionOnePlaintextByBlockId(["only one"], [mapEntry(ID_A, 0), mapEntry(ID_B, 1)])
    ).toThrow(ResumeDiffError);
  });
});

describe("diffResumeBlocksAgainstVersionOne", () => {
  const base = {
    [ID_A]: "Python APIs",
    [ID_B]: "REST APIs",
  };

  it("returns empty when current plaintext matches version 1", () => {
    expect(
      diffResumeBlocksAgainstVersionOne(base, [
        block(ID_A, "Python APIs", 0),
        block(ID_B, "REST APIs", 1),
      ])
    ).toEqual([]);
  });

  it("lists only the changed blockId", () => {
    const diffs = diffResumeBlocksAgainstVersionOne(base, [
      block(ID_A, "Python REST APIs", 0),
      block(ID_B, "REST APIs", 1),
    ]);
    expect(diffs).toEqual([
      {
        blockId: ID_A,
        kind: "changed",
        baseText: "Python APIs",
        currentText: "Python REST APIs",
      },
    ]);
  });

  it("treats NFC-equivalent text as unchanged", () => {
    expect(
      diffResumeBlocksAgainstVersionOne({ [ID_A]: "Café" }, [block(ID_A, "Cafe\u0301", 0)])
    ).toEqual([]);
  });

  it("lists a split paragraph as added", () => {
    const diffs = diffResumeBlocksAgainstVersionOne(base, [
      block(ID_A, "Python APIs", 0),
      block(ID_B, "REST APIs", 1),
      block(ID_C, "New bullet", 2),
    ]);
    expect(diffs).toEqual([
      { blockId: ID_C, kind: "added", baseText: "", currentText: "New bullet" },
    ]);
  });

  it("lists a missing version-1 paragraph as removed", () => {
    const diffs = diffResumeBlocksAgainstVersionOne(base, [block(ID_A, "Python APIs", 0)]);
    expect(diffs).toEqual([
      { blockId: ID_B, kind: "removed", baseText: "REST APIs", currentText: "" },
    ]);
  });

  it("skips current paragraphs without a block id", () => {
    expect(
      diffResumeBlocksAgainstVersionOne(base, [
        { ...block(ID_A, "Python APIs", 0), blockId: null, bookmarkName: null },
        block(ID_B, "REST APIs", 1),
      ])
    ).toEqual([
      { blockId: ID_A, kind: "removed", baseText: "Python APIs", currentText: "" },
    ]);
  });
});

describe("autosave graph is not version 1", () => {
  it("still diffs against original paragraphs after extracted_structure.graph is overwritten", () => {
    const blockMap = [mapEntry(ID_A, 0), mapEntry(ID_B, 1)];
    const ingestStructure: ResumeExtractedStructure = {
      mentionIndex: [],
      graph: { blocks: [block(ID_A, "Python APIs", 0), block(ID_B, "REST APIs", 1)] },
      blockMap,
    };
    const afterEdit = extractedStructureAfterWorkingEdit(ingestStructure, {
      blocks: [block(ID_A, "Python REST APIs", 0), block(ID_B, "REST APIs", 1)],
    });
    expect(afterEdit.blockMap).toEqual(blockMap);
    expect(afterEdit.graph?.blocks[0]?.text).toBe("Python REST APIs");

    const versionOne = versionOnePlaintextByBlockId(["Python APIs", "REST APIs"], afterEdit.blockMap ?? []);
    const diffs = diffResumeBlocksAgainstVersionOne(versionOne, afterEdit.graph?.blocks ?? []);
    expect(diffs.map((row) => row.blockId)).toEqual([ID_A]);
    expect(diffs[0]?.kind).toBe("changed");
  });
});

describe("resumeBlockDiffCountLabel", () => {
  it("does not invent an ATS score", () => {
    expect(resumeBlockDiffCountLabel(0)).toBe("No paragraph changes vs version 1.");
    expect(resumeBlockDiffCountLabel(1)).toBe("1 paragraph differs from version 1.");
    expect(resumeBlockDiffCountLabel(2)).toBe("2 paragraphs differ from version 1.");
    expect(resumeBlockDiffCountLabel(2).toLowerCase()).not.toContain("ats");
  });
});
