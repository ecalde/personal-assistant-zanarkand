import { describe, expect, it } from "vitest";
import type { ResumeStructureBlock, ResumeStructureRun } from "./resumeModel";
import {
  CSS_PX_PER_INCH,
  DEFAULT_BODY_FONT_SIZE_PT,
  DEFAULT_US_LETTER_GEOMETRY,
  US_LETTER_HEIGHT_IN,
  US_LETTER_WIDTH_IN,
  blockFontSizePt,
  contentHeightPx,
  contentWidthPx,
  estimateBlockLineCount,
  halfPointsToPoints,
  paginatePreviewBlocks,
  pointsToCssPx,
  twipsToCssPx,
} from "./resumePreviewGeometry";

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

describe("unit conversion", () => {
  it("converts twips to CSS px (1440 twips = 1 inch = 96 px)", () => {
    expect(twipsToCssPx(1440)).toBe(96);
    expect(twipsToCssPx(720)).toBe(48);
    expect(twipsToCssPx(0)).toBe(0);
  });

  it("converts points to CSS px (72 pt = 1 inch = 96 px)", () => {
    expect(pointsToCssPx(72)).toBe(96);
    expect(pointsToCssPx(12)).toBeCloseTo(16, 10);
    expect(pointsToCssPx(0)).toBe(0);
  });

  it("converts OOXML half-points to points", () => {
    expect(halfPointsToPoints(22)).toBe(11);
    expect(halfPointsToPoints(20)).toBe(10);
  });
});

describe("US Letter geometry", () => {
  it("is 8.5in x 11in in CSS px", () => {
    expect(DEFAULT_US_LETTER_GEOMETRY.pageWidthPx).toBe(US_LETTER_WIDTH_IN * CSS_PX_PER_INCH);
    expect(DEFAULT_US_LETTER_GEOMETRY.pageHeightPx).toBe(US_LETTER_HEIGHT_IN * CSS_PX_PER_INCH);
    expect(DEFAULT_US_LETTER_GEOMETRY.pageWidthPx).toBe(816);
    expect(DEFAULT_US_LETTER_GEOMETRY.pageHeightPx).toBe(1056);
  });

  it("subtracts margins for the content box", () => {
    // 816 - 96 - 96 = 624 ; 1056 - 96 - 96 = 864
    expect(contentWidthPx(DEFAULT_US_LETTER_GEOMETRY)).toBe(624);
    expect(contentHeightPx(DEFAULT_US_LETTER_GEOMETRY)).toBe(864);
  });
});

describe("block font size", () => {
  it("uses the largest concrete run size", () => {
    const b = block(0, "Heading", [
      run("Head", { sizePt: 16 }),
      run("ing", { sizePt: 13 }),
    ]);
    expect(blockFontSizePt(b)).toBe(16);
  });

  it("falls back to the body default when all runs inherit", () => {
    const b = block(0, "Body text");
    expect(blockFontSizePt(b)).toBe(DEFAULT_BODY_FONT_SIZE_PT);
  });
});

describe("estimateBlockLineCount", () => {
  it("treats an empty paragraph as one line", () => {
    expect(estimateBlockLineCount(block(0, ""))).toBe(1);
  });

  it("returns one line for short text and more for long text", () => {
    expect(estimateBlockLineCount(block(0, "short line"))).toBe(1);
    const long = "x".repeat(2000);
    expect(estimateBlockLineCount(block(0, long))).toBeGreaterThan(1);
  });
});

describe("paginatePreviewBlocks", () => {
  it("returns a single empty page for no blocks", () => {
    const pages = paginatePreviewBlocks([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toEqual([]);
  });

  it("keeps a short document on one page", () => {
    const blocks = [block(0, "Name"), block(1, "Summary line"), block(2, "One bullet")];
    const pages = paginatePreviewBlocks(blocks);
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toHaveLength(3);
  });

  it("overflows a long document onto multiple pages", () => {
    // ~120 single-line paragraphs far exceeds one US Letter content box.
    const blocks = Array.from({ length: 120 }, (_, i) => block(i, `Bullet number ${i}`));
    const pages = paginatePreviewBlocks(blocks);
    expect(pages.length).toBeGreaterThan(1);
    // Every block is placed exactly once, in order.
    const flat = pages.flatMap((page) => page.blocks);
    expect(flat).toHaveLength(120);
    expect(flat.map((b) => b.order)).toEqual(blocks.map((b) => b.order));
  });

  it("does not loop on a block taller than a whole page", () => {
    const giant = block(0, "y".repeat(50000));
    const pages = paginatePreviewBlocks([giant, block(1, "after")]);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0].blocks).toEqual([giant]);
  });
});
