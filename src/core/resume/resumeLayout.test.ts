import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CALIBRI_FAMILY, CARLITO_FAMILY } from "./resumeFonts";
import {
  MIN_AVAILABLE_WIDTH_PT,
  SOFT_CHARACTER_CAP_DEFAULT,
  ZERO_PARAGRAPH_INDENT,
  activeRenderFontFamily,
  availableWidthPt,
  availableWidthTwips,
  canvasFontFromStyle,
  characterCount,
  contentHeightPt,
  contentHeightTwips,
  contentWidthPt,
  contentWidthTwips,
  compareSuggestionLineLayout,
  computeLayoutFingerprint,
  createCanvasMeasureTextFn,
  cssPxToPoints,
  DEFAULT_LAYOUT_SECTION,
  estimateLineCount,
  estimateParagraphHeightPt,
  exceedsSoftCharacterCap,
  firstLineAvailableWidthPt,
  isLayoutWidthIndeterminate,
  LAYOUT_LINE_HEIGHT_FACTOR,
  LAYOUT_PARAGRAPH_SPACING_PT,
  layoutFingerprintChanged,
  layoutFontStyle,
  measureTextWidthPt,
  paginateLayoutBlocks,
  paragraphIndent,
  placeBlockOnPages,
  reconcileLayoutReportForFingerprint,
  snapshotBlockLineLayout,
  snapshotDocumentPageLayout,
  suggestionLayoutBlocksAccept,
  suggestionLineLayoutWarning,
  twipsToPoints,
  wrapPlaintextToLines,
  type LayoutDocumentBlock,
  type LayoutFontStyle,
  type MeasureTextFn,
} from "./resumeLayout";
import { readResumeOoxml, type ResumeSectionGeometry } from "./resumeOoxmlRead";
import { CSS_PX_PER_INCH, POINTS_PER_INCH } from "./resumePreviewGeometry";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");

const US_LETTER: ResumeSectionGeometry = {
  pageWidthTwips: 12240,
  pageHeightTwips: 15840,
  marginTopTwips: 720,
  marginRightTwips: 720,
  marginBottomTwips: 720,
  marginLeftTwips: 720,
  headerTwips: null,
  footerTwips: null,
  gutterTwips: null,
};

const BODY_STYLE: LayoutFontStyle = layoutFontStyle({
  fontFamily: CALIBRI_FAMILY,
  fontSizePt: 10,
});

/** Advance = glyphPt per character, plus letter-spacing between glyphs. */
function glyphMeasure(glyphPt: number): MeasureTextFn {
  return (text, style) => {
    if (text.length === 0) return 0;
    return text.length * glyphPt + Math.max(0, text.length - 1) * style.letterSpacingPt;
  };
}

describe("sectPr content width", () => {
  it("is page minus left/right margins (US Letter, 0.5in)", () => {
    // 12240 - 720 - 720 = 10800 twips = 540 pt
    expect(contentWidthTwips(US_LETTER)).toBe(10800);
    expect(contentWidthPt(US_LETTER)).toBe(540);
    expect(twipsToPoints(10800)).toBe(540);
  });

  it("subtracts gutter when present", () => {
    const withGutter: ResumeSectionGeometry = { ...US_LETTER, gutterTwips: 360 };
    expect(contentWidthTwips(withGutter)).toBe(10440);
    expect(contentWidthPt(withGutter)).toBe(522);
  });

  it("subtracts left and right paragraph indents from available width", () => {
    const indent = paragraphIndent({ leftTwips: 720, rightTwips: 360 });
    expect(availableWidthTwips(US_LETTER, indent)).toBe(10800 - 720 - 360);
    expect(availableWidthPt(US_LETTER, indent)).toBe(486);
  });

  it("widens the first line for hanging indent and narrows it for first-line indent", () => {
    const hanging = paragraphIndent({ leftTwips: 720, hangingTwips: 360 });
    expect(availableWidthPt(US_LETTER, hanging)).toBe(504);
    expect(firstLineAvailableWidthPt(US_LETTER, hanging)).toBe(522);

    const firstLine = paragraphIndent({ leftTwips: 720, firstLineTwips: 360 });
    expect(availableWidthPt(US_LETTER, firstLine)).toBe(504);
    expect(firstLineAvailableWidthPt(US_LETTER, firstLine)).toBe(486);
  });

  it("does not use ZERO indent as extra margin", () => {
    expect(availableWidthPt(US_LETTER, ZERO_PARAGRAPH_INDENT)).toBe(540);
    expect(firstLineAvailableWidthPt(US_LETTER)).toBe(540);
  });

  it("floors collapsed geometry to MIN_AVAILABLE_WIDTH_PT", () => {
    const collapsed: ResumeSectionGeometry = {
      ...US_LETTER,
      pageWidthTwips: 100,
      marginLeftTwips: 80,
      marginRightTwips: 80,
    };
    expect(availableWidthPt(collapsed)).toBe(MIN_AVAILABLE_WIDTH_PT);
    expect(firstLineAvailableWidthPt(collapsed, paragraphIndent({ firstLineTwips: 1440 }))).toBe(
      MIN_AVAILABLE_WIDTH_PT
    );
  });

  it("reads the public geometry canary as US Letter with 0.5in margins", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const inventory = await readResumeOoxml(bytes);
    expect(inventory.sections).toHaveLength(1);
    expect(contentWidthPt(inventory.sections[0])).toBe(540);
    expect(availableWidthPt(inventory.sections[0])).toBe(540);
  });
});

describe("injected measureText", () => {
  it("returns 0 for empty text and ignores negative measurer output", () => {
    const measure: MeasureTextFn = () => -4;
    expect(measureTextWidthPt("", BODY_STYLE, measure)).toBe(0);
    expect(measureTextWidthPt("Python", BODY_STYLE, measure)).toBe(0);
  });

  it("wraps by measured width, not character count (RES-LAY-001)", () => {
    const text = "xxxx xxxx xxxx xxxx xxxx";
    expect(characterCount(text)).toBe(24);
    const available = 50;
    const narrowLines = wrapPlaintextToLines(text, available, BODY_STYLE, glyphMeasure(1));
    const wideLines = wrapPlaintextToLines(text, available, BODY_STYLE, glyphMeasure(12));
    expect(narrowLines).toHaveLength(1);
    expect(wideLines.length).toBeGreaterThan(narrowLines.length);
    expect(estimateLineCount(text, available, BODY_STYLE, glyphMeasure(12))).toBe(wideLines.length);
  });

  it("does not let the 125-character soft cap override wrap (RES-LAY-002)", () => {
    expect(SOFT_CHARACTER_CAP_DEFAULT).toBe(125);
    const longFits = "xxxx ".repeat(30).trim();
    expect(characterCount(longFits)).toBeGreaterThan(SOFT_CHARACTER_CAP_DEFAULT);
    expect(exceedsSoftCharacterCap(longFits)).toBe(true);
    expect(estimateLineCount(longFits, 400, BODY_STYLE, glyphMeasure(1))).toBe(1);

    const shortWraps = "aa bb cc dd ee ff";
    expect(characterCount(shortWraps)).toBeLessThan(SOFT_CHARACTER_CAP_DEFAULT);
    expect(exceedsSoftCharacterCap(shortWraps)).toBe(false);
    expect(estimateLineCount(shortWraps, 30, BODY_STYLE, glyphMeasure(10))).toBeGreaterThan(1);
  });

  it("keeps an empty paragraph as one line and a too-wide word on its own line", () => {
    expect(wrapPlaintextToLines("", 40, BODY_STYLE, glyphMeasure(10))).toEqual([""]);
    expect(estimateLineCount("", 40, BODY_STYLE, glyphMeasure(10))).toBe(1);
    expect(wrapPlaintextToLines("supercalifragilistic", 10, BODY_STYLE, glyphMeasure(10))).toEqual([
      "supercalifragilistic",
    ]);
  });

  it("honors first-line hanging vs body width when wrapping", () => {
    const text = "aaaa bbbb";
    const measure = glyphMeasure(10);
    // First line 90pt fits "aaaa bbbb" (9 chars * 10 = 90). Body 50pt does not.
    const lines = wrapPlaintextToLines(text, 50, BODY_STYLE, measure, {
      firstLineAvailableWidthPt: 90,
    });
    expect(lines).toEqual(["aaaa bbbb"]);

    const tightFirst = wrapPlaintextToLines(text, 90, BODY_STYLE, measure, {
      firstLineAvailableWidthPt: 50,
    });
    expect(tightFirst).toEqual(["aaaa", "bbbb"]);
  });

  it("treats hard newlines as line breaks before greedy wrap", () => {
    const lines = wrapPlaintextToLines("one\ntwo three", 100, BODY_STYLE, glyphMeasure(10));
    expect(lines[0]).toBe("one");
    expect(lines[1]).toBe("two three");
  });

  it("includes letter-spacing in the injected measurement", () => {
    const spaced = layoutFontStyle({ ...BODY_STYLE, letterSpacingPt: 5 });
    const unspaced = layoutFontStyle({ ...BODY_STYLE, letterSpacingPt: 0 });
    const measure = glyphMeasure(10);
    expect(measureTextWidthPt("ab", unspaced, measure)).toBe(20);
    expect(measureTextWidthPt("ab", spaced, measure)).toBe(25);
  });
});

describe("active render font and canvas helper", () => {
  it("substitutes Carlito when the document font is missing", () => {
    expect(activeRenderFontFamily(CALIBRI_FAMILY, false)).toBe(CALIBRI_FAMILY);
    expect(activeRenderFontFamily(CALIBRI_FAMILY, true)).toBe(CARLITO_FAMILY);
    expect(activeRenderFontFamily(null, false)).toBe(CALIBRI_FAMILY);
    expect(layoutFontStyle({ fontFamily: CALIBRI_FAMILY }, true).fontFamily).toBe(CARLITO_FAMILY);
  });

  it("builds a canvas font string with weight, italic, and a safe family", () => {
    expect(canvasFontFromStyle(BODY_STYLE)).toBe('400 10pt "Calibri"');
    expect(
      canvasFontFromStyle(layoutFontStyle({ fontFamily: CALIBRI_FAMILY, fontWeight: 700, italic: true }))
    ).toBe('italic 700 11pt "Calibri"');
    expect(canvasFontFromStyle(layoutFontStyle({ fontFamily: 'Calibri"; evil' }))).toBe(
      '400 11pt "Calibri; evil"'
    );
  });

  it("marks width indeterminate when substitution is on or measure failed", () => {
    expect(isLayoutWidthIndeterminate({ substitutionActive: false, measureFailed: false })).toBe(
      false
    );
    expect(isLayoutWidthIndeterminate({ substitutionActive: true, measureFailed: false })).toBe(true);
    expect(isLayoutWidthIndeterminate({ substitutionActive: false, measureFailed: true })).toBe(true);
  });

  it("does not require a canvas in Vitest node", () => {
    const measure = createCanvasMeasureTextFn();
    expect(measure).toBeNull();
  });

  it("converts CSS px to points at 96 dpi", () => {
    expect(cssPxToPoints(CSS_PX_PER_INCH)).toBe(POINTS_PER_INCH);
    expect(cssPxToPoints(96)).toBe(72);
  });
});

describe("suggestion line-count comparison (8B)", () => {
  const narrow: ResumeSectionGeometry = {
    pageWidthTwips: 2000,
    pageHeightTwips: 15840,
    marginTopTwips: 0,
    marginRightTwips: 0,
    marginBottomTwips: 0,
    marginLeftTwips: 0,
    headerTwips: null,
    footerTwips: null,
    gutterTwips: null,
  };

  it("reports wraps when the candidate needs more lines than the snapshot", () => {
    const layout = compareSuggestionLineLayout({
      originalText: "aaaa",
      candidateText: "aaaa bbbb cccc dddd",
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: narrow,
      style: BODY_STYLE,
    });
    expect(availableWidthPt(narrow)).toBe(100);
    expect(layout.originalLineCount).toBe(1);
    expect(layout.candidateLineCount).toBeGreaterThan(1);
    expect(layout.report.status).toBe("wraps");
    expect(layout.report.estimatedPageCount).toBeUndefined();
    expect(suggestionLayoutBlocksAccept(layout)).toBe(false);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/wrap onto extra lines/i);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/You can still Accept/);
  });

  it("does not let the 125-character cap change wraps to fits", () => {
    const longOneLine = "x".repeat(200);
    const layout = compareSuggestionLineLayout({
      originalText: "short",
      candidateText: longOneLine,
      measure: glyphMeasure(0.1),
      substitutionActive: false,
      section: DEFAULT_LAYOUT_SECTION,
      style: BODY_STYLE,
    });
    expect(layout.exceedsSoftCharacterCap).toBe(true);
    expect(layout.report.status).toBe("fits");
    expect(suggestionLineLayoutWarning(layout)).toMatch(/125-character hint/);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/does not override wrap/);
  });

  it("marks line_count_changed when the candidate is shorter in lines", () => {
    const layout = compareSuggestionLineLayout({
      originalText: "aaaa bbbb cccc dddd",
      candidateText: "aaaa",
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: narrow,
      style: BODY_STYLE,
    });
    expect(layout.report.status).toBe("line_count_changed");
    expect(suggestionLayoutBlocksAccept(layout, "warn")).toBe(false);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/line count changed/i);
  });

  it("returns indeterminate and does not invent wrap when measure is missing", () => {
    const layout = compareSuggestionLineLayout({
      originalText: "aaaa",
      candidateText: "aaaa bbbb cccc dddd eeee",
      measure: null,
      substitutionActive: false,
    });
    expect(layout.report.status).toBe("indeterminate");
    expect(layout.measureFailed).toBe(true);
    expect(suggestionLineLayoutWarning(layout)).toBeNull();
  });

  it("keeps status indeterminate when font substitution is active even if wrap is estimated", () => {
    const layout = compareSuggestionLineLayout({
      originalText: "aaaa",
      candidateText: "aaaa bbbb cccc dddd",
      measure: glyphMeasure(10),
      substitutionActive: true,
      section: narrow,
      style: BODY_STYLE,
    });
    expect(layout.report.status).toBe("indeterminate");
    expect(layout.candidateLineCount).toBeGreaterThan(1);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/approximate/i);
    expect(suggestionLayoutBlocksAccept(layout)).toBe(false);
  });

  it("snapshots original line count without a document page walk (line-only helper)", () => {
    const snap = snapshotBlockLineLayout({
      blockId: "b1",
      text: "aaaa bbbb cccc dddd",
      availableWidthPt: 100,
      style: BODY_STYLE,
      measure: glyphMeasure(10),
    });
    expect(snap.originalLineCountEstimated).toBeGreaterThan(1);
    expect(snap.originalStartPageEstimated).toBe(1);
    expect(snap.originalEndPageEstimated).toBe(1);
  });
});

describe("suggestion page-count comparison (8C)", () => {
  /** 100pt wide × 40pt tall printable area — about two one-line 10pt paras. */
  const shortPage: ResumeSectionGeometry = {
    pageWidthTwips: 2000,
    pageHeightTwips: 800,
    marginTopTwips: 0,
    marginRightTwips: 0,
    marginBottomTwips: 0,
    marginLeftTwips: 0,
    headerTwips: null,
    footerTwips: null,
    gutterTwips: null,
  };

  const oneLine = "aaaa";
  const following: LayoutDocumentBlock[] = [
    { blockId: "b-follow", text: oneLine, style: BODY_STYLE },
  ];

  function documentWithTarget(text: string): LayoutDocumentBlock[] {
    return [{ blockId: "b-target", text, style: BODY_STYLE }, ...following];
  }

  it("uses page height minus top/bottom margins (US Letter 0.5in)", () => {
    expect(contentHeightTwips(US_LETTER)).toBe(14400);
    expect(contentHeightPt(US_LETTER)).toBe(720);
  });

  it("places two one-line paragraphs on page 1 and the third on page 2", () => {
    const blocks: LayoutDocumentBlock[] = [
      { blockId: "p1", text: oneLine, style: BODY_STYLE },
      { blockId: "p2", text: oneLine, style: BODY_STYLE },
      { blockId: "p3", text: oneLine, style: BODY_STYLE },
    ];
    const layout = paginateLayoutBlocks({
      blocks,
      measure: glyphMeasure(10),
      section: shortPage,
    });
    expect(estimateParagraphHeightPt(1, BODY_STYLE)).toBe(
      10 * LAYOUT_LINE_HEIGHT_FACTOR + LAYOUT_PARAGRAPH_SPACING_PT
    );
    expect(layout.pageCount).toBe(2);
    expect(layout.snapshots[0]?.originalStartPageEstimated).toBe(1);
    expect(layout.snapshots[1]?.originalEndPageEstimated).toBe(1);
    expect(layout.snapshots[2]?.originalStartPageEstimated).toBe(2);
  });

  it("lets a paragraph taller than one page span pages", () => {
    const placed = placeBlockOnPages({
      heightPt: 90,
      pageHeightPt: 40,
      startPage: 1,
      usedPtOnStartPage: 0,
    });
    expect(placed.startPage).toBe(1);
    expect(placed.endPage).toBe(3);
    expect(placed.usedPtOnEndPage).toBe(10);
  });

  it("fills originalStartPageEstimated from the document snapshot", () => {
    const snap = snapshotDocumentPageLayout({
      blocks: [
        { blockId: "p1", text: oneLine, style: BODY_STYLE },
        { blockId: "p2", text: oneLine, style: BODY_STYLE },
        { blockId: "skills", text: oneLine, style: BODY_STYLE },
      ],
      measure: glyphMeasure(10),
      section: shortPage,
    });
    expect(snap.pageCount).toBe(2);
    expect(snap.snapshots.find((item) => item.blockId === "skills")?.originalStartPageEstimated).toBe(
      2
    );
  });

  it("reports page_count_changed when a huge bullet increases estimated pages", () => {
    const huge = Array.from({ length: 24 }, () => "xxxx").join(" ");
    const layout = compareSuggestionLineLayout({
      originalText: oneLine,
      candidateText: huge,
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: shortPage,
      style: BODY_STYLE,
      documentBlocks: documentWithTarget(oneLine),
      targetBlockId: "b-target",
    });
    expect(layout.originalPageCount).toBe(1);
    expect(layout.candidatePageCount).toBeGreaterThan(layout.originalPageCount ?? 0);
    expect(layout.report.status).toBe("page_count_changed");
    expect(layout.report.estimatedPageCount).toBe(layout.candidatePageCount);
    expect(suggestionLayoutBlocksAccept(layout)).toBe(false);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/increase the estimated page count/i);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/You can still Accept/);
  });

  it("does not let the 125-character cap override page_count_changed", () => {
    const huge = Array.from({ length: 30 }, () => "xxxx").join(" ");
    expect(huge.length).toBeGreaterThan(SOFT_CHARACTER_CAP_DEFAULT);
    const layout = compareSuggestionLineLayout({
      originalText: oneLine,
      candidateText: huge,
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: shortPage,
      style: BODY_STYLE,
      documentBlocks: documentWithTarget(oneLine),
      targetBlockId: "b-target",
    });
    expect(layout.exceedsSoftCharacterCap).toBe(true);
    expect(layout.report.status).toBe("page_count_changed");
    expect(suggestionLineLayoutWarning(layout)).toMatch(/125-character hint/);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/does not override wrap/);
  });

  it("keeps wraps when extra lines still fit on the same page count", () => {
    const tallNarrow: ResumeSectionGeometry = {
      ...shortPage,
      pageHeightTwips: 15840,
    };
    const layout = compareSuggestionLineLayout({
      originalText: oneLine,
      candidateText: "aaaa bbbb cccc dddd",
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: tallNarrow,
      style: BODY_STYLE,
      documentBlocks: documentWithTarget(oneLine),
      targetBlockId: "b-target",
    });
    expect(layout.candidateLineCount).toBeGreaterThan(1);
    expect(layout.originalPageCount).toBe(1);
    expect(layout.candidatePageCount).toBe(1);
    expect(layout.report.status).toBe("wraps");
    expect(layout.report.estimatedPageCount).toBe(1);
    expect(suggestionLineLayoutWarning(layout)).not.toMatch(/page count/i);
  });

  it("stays indeterminate under font substitution but still warns if extra pages are estimated", () => {
    const huge = Array.from({ length: 24 }, () => "xxxx").join(" ");
    const layout = compareSuggestionLineLayout({
      originalText: oneLine,
      candidateText: huge,
      measure: glyphMeasure(10),
      substitutionActive: true,
      section: shortPage,
      style: BODY_STYLE,
      documentBlocks: documentWithTarget(oneLine),
      targetBlockId: "b-target",
    });
    expect(layout.report.status).toBe("indeterminate");
    expect(layout.candidatePageCount).toBeGreaterThan(layout.originalPageCount ?? 0);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/increase the estimated page count/i);
    expect(suggestionLineLayoutWarning(layout)).toMatch(/approximate/i);
    expect(suggestionLayoutBlocksAccept(layout)).toBe(false);
  });

  it("does not invent a page estimate when the measurer is missing", () => {
    const layout = compareSuggestionLineLayout({
      originalText: oneLine,
      candidateText: Array.from({ length: 24 }, () => "xxxx").join(" "),
      measure: null,
      substitutionActive: false,
      documentBlocks: documentWithTarget(oneLine),
      targetBlockId: "b-target",
    });
    expect(layout.report.status).toBe("indeterminate");
    expect(layout.originalPageCount).toBeNull();
    expect(layout.report.estimatedPageCount).toBeUndefined();
    expect(suggestionLineLayoutWarning(layout)).toBeNull();
  });
});

describe("layout fingerprint invalidation (8D)", () => {
  const calibriFace = { fontFamily: CALIBRI_FAMILY, fontSizePt: 10 };

  it("is stable for the same page size, margins, fonts, sizes, and indents", () => {
    const first = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [calibriFace],
      indents: [ZERO_PARAGRAPH_INDENT],
    });
    const second = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [calibriFace],
      indents: [ZERO_PARAGRAPH_INDENT],
    });
    expect(first).toBe(second);
    expect(first).toContain("sub:0");
    expect(first).toContain(`fonts:${CALIBRI_FAMILY}@10`);
    expect(layoutFingerprintChanged(first, second)).toBe(false);
  });

  it("changes when Calibri substitution to Carlito becomes active (font load)", () => {
    const beforeFonts = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [calibriFace],
    });
    const afterCarlito = computeLayoutFingerprint({
      substitutionActive: true,
      section: US_LETTER,
      faces: [{ fontFamily: CARLITO_FAMILY, fontSizePt: 10 }],
    });
    expect(beforeFonts).not.toBe(afterCarlito);
    expect(afterCarlito).toContain("sub:1");
    expect(layoutFingerprintChanged(beforeFonts, afterCarlito)).toBe(true);
  });

  it("changes when margins or font size change (future page geometry edits)", () => {
    const base = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [calibriFace],
    });
    const widerMargins = computeLayoutFingerprint({
      substitutionActive: false,
      section: { ...US_LETTER, marginLeftTwips: 1440, marginRightTwips: 1440 },
      faces: [calibriFace],
    });
    const largerType = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [{ fontFamily: CALIBRI_FAMILY, fontSizePt: 12 }],
    });
    const hanging = computeLayoutFingerprint({
      substitutionActive: false,
      section: US_LETTER,
      faces: [calibriFace],
      indents: [paragraphIndent({ leftTwips: 720, hangingTwips: 360 })],
    });
    expect(base).not.toBe(widerMargins);
    expect(base).not.toBe(largerType);
    expect(base).not.toBe(hanging);
  });

  it("does not treat a missing stored fingerprint as stale (pre-8D rows recompute silently)", () => {
    expect(layoutFingerprintChanged(undefined, "v1|sub:1")).toBe(false);
  });

  it("marks the stored report stale and uses the live comparison when fonts load", () => {
    const stored = compareSuggestionLineLayout({
      originalText: "aaaa",
      candidateText: "aaaa bbbb cccc dddd",
      measure: glyphMeasure(10),
      substitutionActive: false,
      section: {
        pageWidthTwips: 2000,
        pageHeightTwips: 15840,
        marginTopTwips: 0,
        marginRightTwips: 0,
        marginBottomTwips: 0,
        marginLeftTwips: 0,
        headerTwips: null,
        footerTwips: null,
        gutterTwips: null,
      },
      style: BODY_STYLE,
    });
    const live = compareSuggestionLineLayout({
      originalText: "aaaa",
      candidateText: "aaaa bbbb cccc dddd",
      measure: glyphMeasure(10),
      substitutionActive: true,
      section: {
        pageWidthTwips: 2000,
        pageHeightTwips: 15840,
        marginTopTwips: 0,
        marginRightTwips: 0,
        marginBottomTwips: 0,
        marginLeftTwips: 0,
        headerTwips: null,
        footerTwips: null,
        gutterTwips: null,
      },
      style: BODY_STYLE,
    });
    const reconciled = reconcileLayoutReportForFingerprint(stored.report, live);
    expect(reconciled.fingerprintChanged).toBe(true);
    expect(reconciled.report.stale).toBe(true);
    expect(reconciled.report.fingerprint).toBe(live.fingerprint);
    expect(reconciled.report.status).toBe("indeterminate");
    expect(suggestionLayoutBlocksAccept(live)).toBe(false);
    expect(
      suggestionLineLayoutWarning(live, { storedLayout: stored.report })
    ).toMatch(/preview fonts or page geometry changed/i);
    expect(suggestionLineLayoutWarning(live, { storedLayout: stored.report })).toMatch(
      /Typing in the resume is not blocked/
    );
    expect(suggestionLineLayoutWarning(live, { storedLayout: stored.report })).toMatch(
      /You can still Accept/
    );
  });

  it("does not mark stale when the live fingerprint still matches generate-time", () => {
    const live = compareSuggestionLineLayout({
      originalText: "short",
      candidateText: "short",
      measure: glyphMeasure(10),
      substitutionActive: false,
      style: BODY_STYLE,
    });
    const reconciled = reconcileLayoutReportForFingerprint(live.report, live);
    expect(reconciled.fingerprintChanged).toBe(false);
    expect(reconciled.report.stale).toBeUndefined();
    expect(suggestionLineLayoutWarning(live, { storedLayout: live.report })).toBeNull();
  });
});
