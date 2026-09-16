import { describe, expect, it } from "vitest";
import {
  applyBlockPlaintext,
  applyGraphBlockPlaintext,
  blockEditorAriaLabel,
  editorInputPlaintext,
  reconcileContentEditableChild,
  resumeBlockPaintNodes,
  sectionKindLabel,
  truncateForAriaLabel,
} from "./resumeBlockEdit";
import type { ResumeStructureBlock, ResumeStructureRun } from "./resumeModel";

function run(text: string, overrides: Partial<ResumeStructureRun> = {}): ResumeStructureRun {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    font: null,
    sizePt: null,
    hyperlinkRelId: null,
    ...overrides,
  };
}

function block(order: number, text: string, runs?: ResumeStructureRun[]): ResumeStructureBlock {
  return {
    order,
    text,
    blockId: `id-${order}`,
    bookmarkName: `pa_id-${order}`,
    runs: runs ?? [run(text)],
  };
}

function concat(runs: readonly ResumeStructureRun[]): string {
  return runs.map((item) => item.text).join("");
}

const MIXED_PLAIN =
  "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window.";

function mixedBlock(): ResumeStructureBlock {
  const runs = [
    run("MIXED_RUN_PARAGRAPH: Led ", { font: "Calibri", sizePt: 10 }),
    run("TeamAlpha", { bold: true, font: "Calibri", sizePt: 10 }),
    run(" built ", { font: "Calibri", sizePt: 10 }),
    run("APIs", { italic: true, font: "Calibri", sizePt: 10 }),
    run(" for ", { font: "Calibri", sizePt: 10 }),
    run("ExampleCorp", {
      underline: true,
      hyperlinkRelId: "rId5",
      font: "Calibri",
      sizePt: 10,
    }),
    run(" then shipped the batch window.", { font: "Calibri", sizePt: 10 }),
  ];
  return block(0, concat(runs), runs);
}

describe("editorInputPlaintext", () => {
  it("NFC-normalizes, strips ZWSP, and folds line breaks without collapsing NBSP", () => {
    expect(editorInputPlaintext("Java\u200bScript\nnext")).toBe("JavaScript next");
    expect(editorInputPlaintext("Senior\u00a0Engineer")).toBe("Senior\u00a0Engineer");
  });

  it("treats a lone NBSP placeholder as an empty paragraph", () => {
    expect(editorInputPlaintext("\u00a0")).toBe("");
  });
});

describe("block editor aria-label", () => {
  it("names the section and truncates the paragraph", () => {
    expect(sectionKindLabel("experience")).toBe("Work experience");
    expect(sectionKindLabel(undefined)).toBe("Resume");
    expect(truncateForAriaLabel("")).toBe("empty paragraph");
    expect(blockEditorAriaLabel("Work experience", "Built REST APIs for inventory sync")).toBe(
      "Work experience: Built REST APIs for inventory sync"
    );
    const long = "A".repeat(120);
    const labeled = blockEditorAriaLabel("Skills", long, 20);
    expect(labeled.startsWith("Skills: ")).toBe(true);
    expect(labeled.endsWith("…")).toBe(true);
    expect(labeled.length).toBeLessThan(long.length);
  });
});

describe("applyBlockPlaintext", () => {
  it("is a no-op when the plaintext is unchanged (same block identity)", () => {
    const original = block(0, "Hello");
    const result = applyBlockPlaintext(original, "Hello");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.block).toBe(original);
  });

  it("replaces a single-run bullet without inventing formatting", () => {
    const original = block(0, "Built REST APIs", [
      run("Built REST APIs", { font: "Calibri", sizePt: 10 }),
    ]);
    const result = applyBlockPlaintext(original, "Wrote REST APIs");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block).not.toBe(original);
    expect(result.block.text).toBe("Wrote REST APIs");
    expect(result.block.runs).toEqual([run("Wrote REST APIs", { font: "Calibri", sizePt: 10 })]);
    expect(concat(result.block.runs)).toBe(result.block.text);
  });

  it("collapses same-formatting split runs into one run of that formatting", () => {
    const original = block(0, "Hello world", [
      run("Hello ", { bold: true, font: "Calibri" }),
      run("world", { bold: true, font: "Calibri" }),
    ]);
    const result = applyBlockPlaintext(original, "Hello there");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.runs).toEqual([run("Hello there", { bold: true, font: "Calibri" })]);
  });

  it("allows typing into an empty paragraph", () => {
    const original = block(0, "", []);
    const result = applyBlockPlaintext(original, "Name");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.text).toBe("Name");
    expect(result.block.runs).toEqual([run("Name")]);
  });

  it("deletes a whole sentence inside one bullet without flattening the remaining prefix", () => {
    const original = block(
      0,
      "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.",
      [run("TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.", { font: "Calibri", sizePt: 10 })]
    );
    const next = "TARGET_GEOMETRY_BULLET: ";
    const result = applyBlockPlaintext(original, next);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.text).toBe(next);
    expect(result.block.runs).toEqual([run(next, { font: "Calibri", sizePt: 10 })]);
    expect(resumeBlockPaintNodes(result.block)).toEqual([{ kind: "run", run: result.block.runs[0] }]);
  });

  it("allows deleting every character in a paragraph (empty host uses an NBSP placeholder)", () => {
    const original = block(0, "Built REST APIs for inventory sync.", [
      run("Built REST APIs for inventory sync.", { font: "Calibri", sizePt: 10 }),
    ]);
    const result = applyBlockPlaintext(original, "");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.text).toBe("");
    expect(result.block.runs).toEqual([]);
    expect(resumeBlockPaintNodes(result.block)).toEqual([{ kind: "placeholder", text: "\u00a0" }]);
  });

  it("deletes across same-format split runs in one paragraph", () => {
    const original = block(0, "Hello world from the warehouse nodes", [
      run("Hello world ", { font: "Calibri", sizePt: 10 }),
      run("from the warehouse nodes", { font: "Calibri", sizePt: 10 }),
    ]);
    const result = applyBlockPlaintext(original, "Hello nodes");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.text).toBe("Hello nodes");
    expect(concat(result.block.runs)).toBe(result.block.text);
  });

  it("changes an unformatted word in a mixed paragraph without flattening", () => {
    const result = applyBlockPlaintext(
      mixedBlock(),
      "MIXED_RUN_PARAGRAPH: Ran TeamAlpha built APIs for ExampleCorp then shipped the batch window."
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.runs.map((item) => ({ text: item.text, bold: item.bold }))).toEqual([
      { text: "MIXED_RUN_PARAGRAPH: Ran ", bold: false },
      { text: "TeamAlpha", bold: true },
      { text: " built ", bold: false },
      { text: "APIs", bold: false },
      { text: " for ", bold: false },
      { text: "ExampleCorp", bold: false },
      { text: " then shipped the batch window.", bold: false },
    ]);
    expect(result.block.runs[1]?.bold).toBe(true);
    expect(result.block.runs[3]?.italic).toBe(true);
    expect(result.block.runs[5]?.hyperlinkRelId).toBe("rId5");
    expect(concat(result.block.runs)).toBe(result.block.text);
  });

  it("changes text inside the bold run only", () => {
    const result = applyBlockPlaintext(
      mixedBlock(),
      "MIXED_RUN_PARAGRAPH: Led TeamBravo built APIs for ExampleCorp then shipped the batch window."
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bold = result.block.runs.filter((item) => item.bold);
    expect(bold).toHaveLength(1);
    expect(bold[0]?.text).toBe("TeamBravo");
    expect(result.block.runs[5]?.hyperlinkRelId).toBe("rId5");
  });

  it("fail-closes when a replacement would merge mixed rPr regions", () => {
    const original = mixedBlock();
    const result = applyBlockPlaintext(
      original,
      "MIXED_RUN_PARAGRAPH: Directed built APIs for ExampleCorp then shipped the batch window."
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mixed_rpr");
    expect(result.block).toBe(original);
    expect(result.block.text).toBe(MIXED_PLAIN);
    expect(result.block.runs.filter((item) => item.bold)[0]?.text).toBe("TeamAlpha");
  });

  it("deletes an unformatted tail sentence in a mixed paragraph without flattening", () => {
    const result = applyBlockPlaintext(
      mixedBlock(),
      "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.block.runs[1]?.bold).toBe(true);
    expect(result.block.runs[3]?.italic).toBe(true);
    expect(result.block.runs[5]?.hyperlinkRelId).toBe("rId5");
    expect(concat(result.block.runs)).toBe(result.block.text);
  });

  it("fail-closes when an edit would drop a hyperlink run", () => {
    const original = mixedBlock();
    const result = applyBlockPlaintext(
      original,
      "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for  then shipped the batch window."
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("hyperlink");
    expect(result.block).toBe(original);
  });
});

describe("applyGraphBlockPlaintext", () => {
  it("updates one block and keeps the other by identity", () => {
    const first = block(0, "Keep me");
    const second = block(1, "Change me");
    const result = applyGraphBlockPlaintext([first, second], "id-1", "Changed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks[0]).toBe(first);
    expect(result.blocks[1]).not.toBe(second);
    expect(result.blocks[1]?.text).toBe("Changed");
    expect(first.text).toBe("Keep me");
  });

  it("does not mutate neighbors when mixed-run apply fails", () => {
    const mixed = mixedBlock();
    const neighbor = block(1, "Neighbor");
    const result = applyGraphBlockPlaintext(
      [mixed, neighbor],
      "id-0",
      "MIXED_RUN_PARAGRAPH: Directed built APIs for ExampleCorp then shipped the batch window."
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocks[0]).toBe(mixed);
    expect(result.blocks[1]).toBe(neighbor);
  });

  it("returns not_found without inventing a block", () => {
    const original = [block(0, "Hello")];
    const result = applyGraphBlockPlaintext(original, "missing", "x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
    expect(result.blocks).toEqual(original);
  });
});

describe("contentEditable host painting", () => {
  it("throws the removeChild analog when React would reconcile spans the browser already deleted", () => {
    expect(() => reconcileContentEditableChild(false)).toThrow(/removeChild/);
    expect(() => reconcileContentEditableChild(true)).not.toThrow();
  });
});
