/**
 * Layout width and page estimator (Phases 8A–8C).
 *
 * Architecture §30 live in-app authority: canvas / OffscreenCanvas
 * `measureText` with the active render font, size, weight, and letter-spacing.
 * Content width is page size − margins − gutter − paragraph indents — never
 * character count. Page estimate is greedy wrap + paragraph spacing vs the
 * current-document snapshot (RES-LAY-001). The default 125-character cap is a
 * **soft UI hint only** (RES-LAY-002) and must not change wrap or page results.
 *
 * Vitest stays node: callers inject `MeasureTextFn`. Do not require a real
 * canvas in tests. Phase 8B compares snapshot vs candidate **line count**.
 * Phase 8C compares estimated **page count** (warn, never block Accept).
 * Phase 8D fingerprints page size, margins, fonts, sizes, and spacing/indents.
 * When that fingerprint changes (MVP: Calibri vs Carlito after fonts load),
 * stored layout reports are marked stale and the live comparison is recomputed.
 * Typing in the editor is never blocked.
 *
 * Microsoft Word remains the true pagination authority (§58).
 */

import { CALIBRI_FAMILY, CARLITO_FAMILY, DEFAULT_BODY_FONT_FAMILY } from "./resumeFonts";
import type { LayoutReport, LayoutStatus } from "./resumeModel";
import type { ResumeSectionGeometry } from "./resumeOoxmlRead";
import {
  CSS_PX_PER_INCH,
  DEFAULT_BODY_FONT_SIZE_PT,
  LINE_HEIGHT_FACTOR,
  PARAGRAPH_SPACING_PT,
  POINTS_PER_INCH,
  TWIPS_PER_POINT,
  pointsToCssPx,
} from "./resumePreviewGeometry";

/** Soft character budget (architecture §30). Warn-only; never used to wrap. */
export const SOFT_CHARACTER_CAP_DEFAULT = 125;

/** Floor so wrap math never divides by zero or goes negative. */
export const MIN_AVAILABLE_WIDTH_PT = 1;

/** Floor so page math never divides by zero or goes negative. */
export const MIN_CONTENT_HEIGHT_PT = 1;

/** Line box as a multiple of the measured face size (architecture §30). */
export const LAYOUT_LINE_HEIGHT_FACTOR = LINE_HEIGHT_FACTOR;

/** Spacing after each paragraph in the greedy page estimate. */
export const LAYOUT_PARAGRAPH_SPACING_PT = PARAGRAPH_SPACING_PT;

/**
 * Last-line fill at or above this ratio is `near_limit` when line count is
 * unchanged. Does not override `wraps`.
 */
export const NEAR_LIMIT_FILL_RATIO = 0.9;

/**
 * Default page box when `extracted_structure` has no `sectPr` (architecture
 * §16 / 4A carry-forward). US Letter, 0.5in margins — same as the public
 * geometry canary / 8A tests. Word remains pagination authority.
 */
export const DEFAULT_LAYOUT_SECTION: ResumeSectionGeometry = {
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

/** Q6: warn on cards; never silently shorten; Accept stays enabled. */
export type SuggestionLayoutAcceptPolicy = "warn" | "block";
export const SUGGESTION_LAYOUT_ACCEPT_POLICY_DEFAULT: SuggestionLayoutAcceptPolicy = "warn";

export type LayoutFingerprintFace = {
  fontFamily: string;
  fontSizePt: number;
};

export type LayoutFingerprintInput = {
  section?: ResumeSectionGeometry;
  substitutionActive: boolean;
  paragraphSpacingPt?: number;
  faces?: readonly LayoutFingerprintFace[];
  indents?: readonly ParagraphIndentTwips[];
};

function uniqueLayoutFaces(faces: readonly LayoutFingerprintFace[]): LayoutFingerprintFace[] {
  const seen = new Set<string>();
  const out: LayoutFingerprintFace[] = [];
  for (const face of faces) {
    const family = face.fontFamily.replace(/[|;]/g, "").trim() || DEFAULT_BODY_FONT_FAMILY;
    const sizePt = Number.isFinite(face.fontSizePt) && face.fontSizePt > 0 ? face.fontSizePt : DEFAULT_BODY_FONT_SIZE_PT;
    const key = `${family}@${sizePt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fontFamily: family, fontSizePt: sizePt });
  }
  out.sort((a, b) => {
    const family = a.fontFamily.localeCompare(b.fontFamily);
    if (family !== 0) return family;
    return a.fontSizePt - b.fontSizePt;
  });
  return out;
}

function uniqueIndentKeys(indents: readonly ParagraphIndentTwips[]): string[] {
  const keys = indents.map((indent) => {
    const resolved = paragraphIndent(indent);
    return `${resolved.leftTwips},${resolved.rightTwips},${resolved.hangingTwips},${resolved.firstLineTwips}`;
  });
  return [...new Set(keys)].sort();
}

/**
 * Stable layout fingerprint (architecture §30): page size + margins + fonts +
 * font sizes + paragraph spacing/indents. Substitution is included so Carlito
 * vs Calibri after font load invalidates stored wrap/page reports.
 */
export function computeLayoutFingerprint(input: LayoutFingerprintInput): string {
  const section = input.section ?? DEFAULT_LAYOUT_SECTION;
  const spacing =
    input.paragraphSpacingPt !== undefined && Number.isFinite(input.paragraphSpacingPt)
      ? Math.max(0, input.paragraphSpacingPt)
      : LAYOUT_PARAGRAPH_SPACING_PT;
  const faces = uniqueLayoutFaces(input.faces ?? []);
  const indents = uniqueIndentKeys(input.indents ?? [ZERO_PARAGRAPH_INDENT]);
  return [
    "v1",
    `pw:${section.pageWidthTwips}`,
    `ph:${section.pageHeightTwips}`,
    `mt:${section.marginTopTwips}`,
    `mr:${section.marginRightTwips}`,
    `mb:${section.marginBottomTwips}`,
    `ml:${section.marginLeftTwips}`,
    `g:${nonNegativeTwips(section.gutterTwips)}`,
    `sp:${spacing}`,
    `sub:${input.substitutionActive ? 1 : 0}`,
    `fonts:${faces.map((face) => `${face.fontFamily}@${face.fontSizePt}`).join(";")}`,
    `ind:${indents.join(";")}`,
  ].join("|");
}

export function layoutFingerprintChanged(
  storedFingerprint: string | undefined,
  currentFingerprint: string
): boolean {
  if (!storedFingerprint) return false;
  return storedFingerprint !== currentFingerprint;
}

/** Run hints used only to pick one paragraph face for width wrap. */
export type LayoutRunHint = {
  text: string;
  bold: boolean;
  italic: boolean;
  font: string | null;
  sizePt: number | null;
};

export type LayoutFontStyle = {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: number;
  italic: boolean;
  letterSpacingPt: number;
};

/**
 * Returns the advance width of `text` in **points** for the given style.
 * Injected in tests; the canvas adapter converts CSS px → pt.
 */
export type MeasureTextFn = (text: string, style: LayoutFontStyle) => number;

export type ParagraphIndentTwips = {
  leftTwips: number;
  rightTwips: number;
  hangingTwips: number;
  firstLineTwips: number;
};

export const ZERO_PARAGRAPH_INDENT: ParagraphIndentTwips = {
  leftTwips: 0,
  rightTwips: 0,
  hangingTwips: 0,
  firstLineTwips: 0,
};

export type BlockLayoutSnapshot = {
  blockId: string;
  fontFamily: string;
  fontSizePt: number;
  availableWidthPt: number;
  originalLineCountEstimated: number;
  originalStartPageEstimated: number;
  originalEndPageEstimated: number;
  characterCount: number;
};

/** One document paragraph for greedy page estimates (Phase 8C). */
export type LayoutDocumentBlock = {
  blockId: string;
  text: string;
  runs?: readonly LayoutRunHint[];
  style?: LayoutFontStyle;
  indent?: ParagraphIndentTwips;
};

export type DocumentPageLayout = {
  pageCount: number;
  snapshots: BlockLayoutSnapshot[];
};

export const DEFAULT_LAYOUT_FONT_STYLE: LayoutFontStyle = {
  fontFamily: DEFAULT_BODY_FONT_FAMILY,
  fontSizePt: DEFAULT_BODY_FONT_SIZE_PT,
  fontWeight: 400,
  italic: false,
  letterSpacingPt: 0,
};

export function twipsToPoints(twips: number): number {
  return twips / TWIPS_PER_POINT;
}

export function cssPxToPoints(px: number): number {
  return (px / CSS_PX_PER_INCH) * POINTS_PER_INCH;
}

function nonNegativeTwips(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function paragraphIndent(
  overrides: Partial<ParagraphIndentTwips> = {}
): ParagraphIndentTwips {
  return {
    leftTwips: nonNegativeTwips(overrides.leftTwips),
    rightTwips: nonNegativeTwips(overrides.rightTwips),
    hangingTwips: nonNegativeTwips(overrides.hangingTwips),
    firstLineTwips: nonNegativeTwips(overrides.firstLineTwips),
  };
}

/**
 * Printable body width from `sectPr`: page − left/right margins − gutter.
 * Indents are applied separately (architecture §30).
 */
export function contentWidthTwips(section: ResumeSectionGeometry): number {
  return Math.max(
    0,
    section.pageWidthTwips -
      section.marginLeftTwips -
      section.marginRightTwips -
      nonNegativeTwips(section.gutterTwips)
  );
}

export function contentWidthPt(section: ResumeSectionGeometry): number {
  return twipsToPoints(contentWidthTwips(section));
}

/**
 * Printable body height from `sectPr`: page − top/bottom margins.
 * Header/footer distances are not subtracted (they often sit inside Word's
 * margin). Word remains pagination authority.
 */
export function contentHeightTwips(section: ResumeSectionGeometry): number {
  return Math.max(0, section.pageHeightTwips - section.marginTopTwips - section.marginBottomTwips);
}

export function contentHeightPt(section: ResumeSectionGeometry): number {
  return Math.max(MIN_CONTENT_HEIGHT_PT, twipsToPoints(contentHeightTwips(section)));
}

/**
 * Subsequent-line content width: page − margins − gutter − left/right indent.
 * Hanging indent does not shrink this; first-line indent does not either.
 */
export function availableWidthTwips(
  section: ResumeSectionGeometry,
  indent: ParagraphIndentTwips = ZERO_PARAGRAPH_INDENT
): number {
  const resolved = paragraphIndent(indent);
  return Math.max(0, contentWidthTwips(section) - resolved.leftTwips - resolved.rightTwips);
}

export function availableWidthPt(
  section: ResumeSectionGeometry,
  indent: ParagraphIndentTwips = ZERO_PARAGRAPH_INDENT
): number {
  return Math.max(MIN_AVAILABLE_WIDTH_PT, twipsToPoints(availableWidthTwips(section, indent)));
}

/**
 * First wrapped line: hanging indent is extra left indent on later lines
 * (first line is wider); `w:firstLine` extra-indents only the first line.
 */
export function firstLineAvailableWidthPt(
  section: ResumeSectionGeometry,
  indent: ParagraphIndentTwips = ZERO_PARAGRAPH_INDENT
): number {
  const resolved = paragraphIndent(indent);
  const bodyTwips = availableWidthTwips(section, resolved);
  const firstTwips = bodyTwips - resolved.firstLineTwips + resolved.hangingTwips;
  return Math.max(MIN_AVAILABLE_WIDTH_PT, twipsToPoints(firstTwips));
}

/**
 * Preview face used for measurement. Missing Calibri (or other document
 * fonts) substitutes Carlito — the same policy as Phase 4B. Widths may then
 * differ from Word; callers treat that as `indeterminate` in 8B/8D.
 */
export function activeRenderFontFamily(
  requestedFamily: string | null | undefined,
  substitutionActive: boolean
): string {
  if (substitutionActive) return CARLITO_FAMILY;
  const trimmed = requestedFamily?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return DEFAULT_BODY_FONT_FAMILY;
}

export function layoutFontStyle(
  overrides: Partial<LayoutFontStyle> = {},
  substitutionActive = false
): LayoutFontStyle {
  const requested = overrides.fontFamily ?? DEFAULT_LAYOUT_FONT_STYLE.fontFamily;
  return {
    fontFamily: activeRenderFontFamily(requested, substitutionActive),
    fontSizePt:
      overrides.fontSizePt !== undefined && Number.isFinite(overrides.fontSizePt) && overrides.fontSizePt > 0
        ? overrides.fontSizePt
        : DEFAULT_LAYOUT_FONT_STYLE.fontSizePt,
    fontWeight:
      overrides.fontWeight !== undefined && Number.isFinite(overrides.fontWeight) && overrides.fontWeight > 0
        ? overrides.fontWeight
        : DEFAULT_LAYOUT_FONT_STYLE.fontWeight,
    italic: overrides.italic ?? false,
    letterSpacingPt:
      overrides.letterSpacingPt !== undefined && Number.isFinite(overrides.letterSpacingPt)
        ? overrides.letterSpacingPt
        : 0,
  };
}

/** CSS `font` shorthand for canvas `ctx.font` / `document.fonts`. */
export function canvasFontFromStyle(style: LayoutFontStyle): string {
  const family = style.fontFamily.replace(/["\\]/g, "").trim() || CALIBRI_FAMILY;
  const italic = style.italic ? "italic " : "";
  const weight = Number.isFinite(style.fontWeight) ? style.fontWeight : 400;
  const sizePt = style.fontSizePt > 0 ? style.fontSizePt : DEFAULT_BODY_FONT_SIZE_PT;
  return `${italic}${weight} ${sizePt}pt "${family}"`;
}

export function measureTextWidthPt(
  text: string,
  style: LayoutFontStyle,
  measure: MeasureTextFn
): number {
  if (text.length === 0) return 0;
  const width = measure(text, style);
  if (!Number.isFinite(width) || width < 0) return 0;
  return width;
}

export function characterCount(text: string): number {
  return text.length;
}

export function exceedsSoftCharacterCap(
  text: string,
  cap: number = SOFT_CHARACTER_CAP_DEFAULT
): boolean {
  return characterCount(text) > cap;
}

function lineBudgetPt(lineIndex: number, bodyPt: number, firstLinePt: number): number {
  const budget = lineIndex === 0 ? firstLinePt : bodyPt;
  return Math.max(MIN_AVAILABLE_WIDTH_PT, budget);
}

/**
 * Greedy wrap using measured glyph width. A word wider than the line sits
 * alone (may overflow — 8B reports `wraps`). Soft character cap is ignored.
 */
export function wrapPlaintextToLines(
  text: string,
  availableWidthPt: number,
  style: LayoutFontStyle,
  measure: MeasureTextFn,
  options?: { firstLineAvailableWidthPt?: number }
): string[] {
  const bodyPt = Math.max(MIN_AVAILABLE_WIDTH_PT, availableWidthPt);
  const firstLinePt =
    options?.firstLineAvailableWidthPt !== undefined
      ? Math.max(MIN_AVAILABLE_WIDTH_PT, options.firstLineAvailableWidthPt)
      : bodyPt;

  if (text.length === 0) return [""];

  const hardLines = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];

  for (const hard of hardLines) {
    const words = hard.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length === 0) {
        current = word;
        continue;
      }
      const width = measureTextWidthPt(candidate, style, measure);
      if (width <= lineBudgetPt(lines.length, bodyPt, firstLinePt)) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

export function estimateLineCount(
  text: string,
  availableWidthPt: number,
  style: LayoutFontStyle,
  measure: MeasureTextFn,
  options?: { firstLineAvailableWidthPt?: number }
): number {
  return wrapPlaintextToLines(text, availableWidthPt, style, measure, options).length;
}

export function paragraphLineHeightPt(style: LayoutFontStyle): number {
  const size = style.fontSizePt > 0 ? style.fontSizePt : DEFAULT_BODY_FONT_SIZE_PT;
  return size * LAYOUT_LINE_HEIGHT_FACTOR;
}

export function estimateParagraphHeightPt(
  lineCount: number,
  style: LayoutFontStyle,
  paragraphSpacingPt: number = LAYOUT_PARAGRAPH_SPACING_PT
): number {
  const lines = Math.max(1, lineCount);
  const spacing = Number.isFinite(paragraphSpacingPt) ? Math.max(0, paragraphSpacingPt) : 0;
  return lines * paragraphLineHeightPt(style) + spacing;
}

export type PlaceBlockOnPagesResult = {
  startPage: number;
  endPage: number;
  usedPtOnEndPage: number;
};

/**
 * Greedy page placement for one paragraph. A block taller than one page spans
 * whole pages (Word splits paragraphs; CSS preview does not). If the remainder
 * of the current page is too short and already has content, the block starts
 * on the next page.
 */
export function placeBlockOnPages(input: {
  heightPt: number;
  pageHeightPt: number;
  startPage: number;
  usedPtOnStartPage: number;
}): PlaceBlockOnPagesResult {
  const pageHeightPt = Math.max(MIN_CONTENT_HEIGHT_PT, input.pageHeightPt);
  const heightPt = Math.max(0, input.heightPt);
  let page = Math.max(1, input.startPage);
  let usedPt = Math.max(0, input.usedPtOnStartPage);

  if (heightPt === 0) {
    return { startPage: page, endPage: page, usedPtOnEndPage: usedPt };
  }

  const remainingOnPage = pageHeightPt - usedPt;
  if (heightPt <= remainingOnPage) {
    return {
      startPage: page,
      endPage: page,
      usedPtOnEndPage: usedPt + heightPt,
    };
  }

  if (usedPt > 0) {
    page += 1;
    usedPt = 0;
    if (heightPt <= pageHeightPt) {
      return {
        startPage: page,
        endPage: page,
        usedPtOnEndPage: heightPt,
      };
    }
  }

  let remaining = heightPt;
  const startPage = page;
  while (remaining > pageHeightPt) {
    remaining -= pageHeightPt;
    page += 1;
  }
  return {
    startPage,
    endPage: page,
    usedPtOnEndPage: remaining === 0 ? pageHeightPt : remaining,
  };
}

function styleForLayoutBlock(
  block: LayoutDocumentBlock,
  substitutionActive: boolean
): LayoutFontStyle {
  if (block.style) return layoutFontStyle(block.style, substitutionActive);
  return layoutFontStyleFromRuns(block.runs ?? [], substitutionActive);
}

export function layoutDocumentBlocksFromGraph(
  blocks: readonly {
    blockId: string | null;
    text: string;
    runs: readonly LayoutRunHint[];
  }[],
  substitutionActive = false
): LayoutDocumentBlock[] {
  const out: LayoutDocumentBlock[] = [];
  for (const block of blocks) {
    if (!block.blockId) continue;
    out.push({
      blockId: block.blockId,
      text: block.text,
      runs: block.runs,
      style: layoutFontStyleFromRuns(block.runs, substitutionActive),
    });
  }
  return out;
}

function withTargetBlockText(
  blocks: readonly LayoutDocumentBlock[],
  targetBlockId: string,
  text: string
): LayoutDocumentBlock[] {
  return blocks.map((block) => (block.blockId === targetBlockId ? { ...block, text } : block));
}

/**
 * Greedy document pagination using measureText wrap + paragraph spacing
 * (architecture §30). Empty input is one empty page.
 */
export function paginateLayoutBlocks(input: {
  blocks: readonly LayoutDocumentBlock[];
  measure: MeasureTextFn;
  substitutionActive?: boolean;
  section?: ResumeSectionGeometry;
}): DocumentPageLayout {
  const section = input.section ?? DEFAULT_LAYOUT_SECTION;
  const substitutionActive = input.substitutionActive ?? false;
  const pageHeightPt = contentHeightPt(section);
  const snapshots: BlockLayoutSnapshot[] = [];
  let page = 1;
  let usedPt = 0;

  for (const block of input.blocks) {
    const style = styleForLayoutBlock(block, substitutionActive);
    const indent = block.indent ?? ZERO_PARAGRAPH_INDENT;
    const bodyPt = availableWidthPt(section, indent);
    const firstPt = firstLineAvailableWidthPt(section, indent);
    const lines = wrapPlaintextToLines(block.text, bodyPt, style, input.measure, {
      firstLineAvailableWidthPt: firstPt,
    });
    const heightPt = estimateParagraphHeightPt(lines.length, style);
    const placed = placeBlockOnPages({
      heightPt,
      pageHeightPt,
      startPage: page,
      usedPtOnStartPage: usedPt,
    });
    snapshots.push({
      blockId: block.blockId,
      fontFamily: style.fontFamily,
      fontSizePt: style.fontSizePt,
      availableWidthPt: bodyPt,
      originalLineCountEstimated: lines.length,
      originalStartPageEstimated: placed.startPage,
      originalEndPageEstimated: placed.endPage,
      characterCount: characterCount(block.text),
    });
    page = placed.endPage;
    usedPt = placed.usedPtOnEndPage;
  }

  return {
    pageCount: snapshots.length === 0 ? 1 : page,
    snapshots,
  };
}

export function snapshotDocumentPageLayout(input: {
  blocks: readonly LayoutDocumentBlock[];
  measure: MeasureTextFn;
  substitutionActive?: boolean;
  section?: ResumeSectionGeometry;
}): DocumentPageLayout {
  return paginateLayoutBlocks(input);
}

/**
 * True when in-app width must not be treated as Word-equal: missing document
 * fonts (Carlito substitution) or the measurer itself failed.
 */
export function isLayoutWidthIndeterminate(input: {
  substitutionActive: boolean;
  measureFailed: boolean;
}): boolean {
  return input.substitutionActive || input.measureFailed;
}

/**
 * Representative face for a paragraph: first non-empty run, else inherited
 * body defaults. Mixed-run width is not modeled (one style per wrap).
 */
export function layoutFontStyleFromRuns(
  runs: readonly LayoutRunHint[],
  substitutionActive = false
): LayoutFontStyle {
  const chosen =
    runs.find((run) => run.text.length > 0) ?? (runs.length > 0 ? runs[0] : undefined);
  return layoutFontStyle(
    {
      fontFamily: chosen?.font ?? DEFAULT_LAYOUT_FONT_STYLE.fontFamily,
      fontSizePt: chosen?.sizePt ?? DEFAULT_LAYOUT_FONT_STYLE.fontSizePt,
      fontWeight: chosen?.bold ? 700 : DEFAULT_LAYOUT_FONT_STYLE.fontWeight,
      italic: chosen?.italic ?? false,
    },
    substitutionActive
  );
}

export function snapshotBlockLineLayout(input: {
  blockId: string;
  text: string;
  availableWidthPt: number;
  style: LayoutFontStyle;
  measure: MeasureTextFn;
  firstLineAvailableWidthPt?: number;
}): BlockLayoutSnapshot {
  const lines = wrapPlaintextToLines(
    input.text,
    input.availableWidthPt,
    input.style,
    input.measure,
    { firstLineAvailableWidthPt: input.firstLineAvailableWidthPt }
  );
  return {
    blockId: input.blockId,
    fontFamily: input.style.fontFamily,
    fontSizePt: input.style.fontSizePt,
    availableWidthPt: input.availableWidthPt,
    originalLineCountEstimated: lines.length,
    originalStartPageEstimated: 1,
    originalEndPageEstimated: 1,
    characterCount: characterCount(input.text),
  };
}

export type SuggestionLineLayout = {
  report: LayoutReport;
  originalLineCount: number | null;
  candidateLineCount: number | null;
  originalPageCount: number | null;
  candidatePageCount: number | null;
  exceedsSoftCharacterCap: boolean;
  measureFailed: boolean;
  substitutionActive: boolean;
  fingerprint: string;
};

function layoutFingerprintForMeasure(input: {
  section: ResumeSectionGeometry;
  substitutionActive: boolean;
  style: LayoutFontStyle;
  indent: ParagraphIndentTwips;
  documentBlocks?: readonly LayoutDocumentBlock[];
}): string {
  const faces: LayoutFingerprintFace[] = [
    { fontFamily: input.style.fontFamily, fontSizePt: input.style.fontSizePt },
  ];
  const indents: ParagraphIndentTwips[] = [input.indent];
  for (const block of input.documentBlocks ?? []) {
    const style = styleForLayoutBlock(block, input.substitutionActive);
    faces.push({ fontFamily: style.fontFamily, fontSizePt: style.fontSizePt });
    indents.push(block.indent ?? ZERO_PARAGRAPH_INDENT);
  }
  return computeLayoutFingerprint({
    section: input.section,
    substitutionActive: input.substitutionActive,
    faces,
    indents,
  });
}

/**
 * Live comparison wins when the stored fingerprint no longer matches (fonts
 * loaded, margins later). Does not persist; does not block typing or Accept.
 */
export function reconcileLayoutReportForFingerprint(
  stored: LayoutReport | undefined,
  live: SuggestionLineLayout
): { report: LayoutReport; fingerprintChanged: boolean } {
  const fingerprintChanged = layoutFingerprintChanged(stored?.fingerprint, live.fingerprint);
  return {
    fingerprintChanged,
    report: {
      ...live.report,
      fingerprint: live.fingerprint,
      ...(fingerprintChanged ? { stale: true } : stored?.stale ? { stale: true } : {}),
    },
  };
}

export type CompareSuggestionLineLayoutInput = {
  originalText: string;
  candidateText: string;
  measure: MeasureTextFn | null;
  substitutionActive: boolean;
  section?: ResumeSectionGeometry;
  indent?: ParagraphIndentTwips;
  style?: LayoutFontStyle;
  softCharacterCap?: number;
  /** When set with `targetBlockId`, 8C estimates document page count. */
  documentBlocks?: readonly LayoutDocumentBlock[];
  targetBlockId?: string;
};

function lastLineFillRatio(
  text: string,
  availableWidthPt: number,
  style: LayoutFontStyle,
  measure: MeasureTextFn,
  firstLineAvailableWidthPt: number
): number {
  const lines = wrapPlaintextToLines(text, availableWidthPt, style, measure, {
    firstLineAvailableWidthPt,
  });
  const last = lines[lines.length - 1] ?? "";
  if (last.length === 0) return 0;
  const lineIndex = Math.max(0, lines.length - 1);
  const budget = lineBudgetPt(lineIndex, availableWidthPt, firstLineAvailableWidthPt);
  const width = measureTextWidthPt(last, style, measure);
  if (budget <= 0) return 1;
  return width / budget;
}

function suggestionLayoutStatus(input: {
  originalLineCount: number;
  candidateLineCount: number;
  originalPageCount: number | null;
  candidatePageCount: number | null;
  nearLimit: boolean;
  indeterminate: boolean;
}): LayoutStatus {
  if (input.indeterminate) return "indeterminate";
  if (
    input.originalPageCount !== null &&
    input.candidatePageCount !== null &&
    input.candidatePageCount > input.originalPageCount
  ) {
    return "page_count_changed";
  }
  if (input.candidateLineCount > input.originalLineCount) return "wraps";
  if (input.candidateLineCount !== input.originalLineCount) return "line_count_changed";
  if (input.nearLimit) return "near_limit";
  return "fits";
}

/**
 * Snapshot vs candidate line count (Phase 8B) and optional document page count
 * (Phase 8C). Soft character cap is recorded but never changes wrap or page
 * status (RES-LAY-002).
 */
export function compareSuggestionLineLayoutForBlock(input: {
  originalText: string;
  candidateText: string;
  runs: readonly LayoutRunHint[];
  measure: MeasureTextFn | null;
  substitutionActive: boolean;
  documentBlocks?: readonly LayoutDocumentBlock[];
  targetBlockId?: string;
  section?: ResumeSectionGeometry;
}): SuggestionLineLayout {
  return compareSuggestionLineLayout({
    originalText: input.originalText,
    candidateText: input.candidateText,
    measure: input.measure,
    substitutionActive: input.substitutionActive,
    style: layoutFontStyleFromRuns(input.runs, input.substitutionActive),
    documentBlocks: input.documentBlocks,
    targetBlockId: input.targetBlockId,
    section: input.section,
  });
}

export function compareSuggestionLineLayout(
  input: CompareSuggestionLineLayoutInput
): SuggestionLineLayout {
  const section = input.section ?? DEFAULT_LAYOUT_SECTION;
  const indent = input.indent ?? ZERO_PARAGRAPH_INDENT;
  const style = layoutFontStyle(input.style ?? DEFAULT_LAYOUT_FONT_STYLE, input.substitutionActive);
  const cap = input.softCharacterCap ?? SOFT_CHARACTER_CAP_DEFAULT;
  const candidateChars = characterCount(input.candidateText);
  const overCap = exceedsSoftCharacterCap(input.candidateText, cap);
  const measure = input.measure;
  const measureFailed = measure === null;
  const substitutionActive = input.substitutionActive;
  const indeterminate = isLayoutWidthIndeterminate({
    substitutionActive,
    measureFailed,
  });
  const fingerprint = layoutFingerprintForMeasure({
    section,
    substitutionActive,
    style,
    indent,
    documentBlocks: input.documentBlocks,
  });

  if (measure === null) {
    return {
      report: { status: "indeterminate", characterCount: candidateChars, fingerprint },
      originalLineCount: null,
      candidateLineCount: null,
      originalPageCount: null,
      candidatePageCount: null,
      exceedsSoftCharacterCap: overCap,
      measureFailed: true,
      substitutionActive,
      fingerprint,
    };
  }

  const bodyPt = availableWidthPt(section, indent);
  const firstPt = firstLineAvailableWidthPt(section, indent);
  const originalLineCount = estimateLineCount(input.originalText, bodyPt, style, measure, {
    firstLineAvailableWidthPt: firstPt,
  });
  const candidateLineCount = estimateLineCount(input.candidateText, bodyPt, style, measure, {
    firstLineAvailableWidthPt: firstPt,
  });
  const nearLimit =
    candidateLineCount === originalLineCount &&
    lastLineFillRatio(input.candidateText, bodyPt, style, measure, firstPt) >=
      NEAR_LIMIT_FILL_RATIO;

  let originalPageCount: number | null = null;
  let candidatePageCount: number | null = null;
  const documentBlocks = input.documentBlocks;
  const targetBlockId = input.targetBlockId?.trim() ?? "";
  if (documentBlocks && documentBlocks.length > 0 && targetBlockId.length > 0) {
    const hasTarget = documentBlocks.some((block) => block.blockId === targetBlockId);
    if (hasTarget) {
      originalPageCount = paginateLayoutBlocks({
        blocks: withTargetBlockText(documentBlocks, targetBlockId, input.originalText),
        measure,
        substitutionActive,
        section,
      }).pageCount;
      candidatePageCount = paginateLayoutBlocks({
        blocks: withTargetBlockText(documentBlocks, targetBlockId, input.candidateText),
        measure,
        substitutionActive,
        section,
      }).pageCount;
    }
  }

  const status = suggestionLayoutStatus({
    originalLineCount,
    candidateLineCount,
    originalPageCount,
    candidatePageCount,
    nearLimit,
    indeterminate,
  });

  return {
    report: {
      status,
      estimatedLineCount: candidateLineCount,
      ...(candidatePageCount !== null ? { estimatedPageCount: candidatePageCount } : {}),
      characterCount: candidateChars,
      fingerprint,
    },
    originalLineCount,
    candidateLineCount,
    originalPageCount,
    candidatePageCount,
    exceedsSoftCharacterCap: overCap,
    measureFailed: false,
    substitutionActive,
    fingerprint,
  };
}

/**
 * Default Q6 policy: never disable Accept for wrap / line-count / page-count.
 * `block` is defined for the setting but is not wired in 8B/8C UI.
 */
export function suggestionLayoutBlocksAccept(
  _layout: SuggestionLineLayout,
  policy: SuggestionLayoutAcceptPolicy = SUGGESTION_LAYOUT_ACCEPT_POLICY_DEFAULT
): boolean {
  if (policy === "warn") return false;
  const status = _layout.report.status;
  return status === "wraps" || status === "line_count_changed" || status === "page_count_changed";
}

function wrapWarningSentence(layout: SuggestionLineLayout): string {
  const approximate = layout.substitutionActive || layout.measureFailed;
  if (approximate) {
    return (
      "This wording looks like it would wrap onto extra lines, but the estimate is approximate " +
      "because the preview font or measurement differs from Microsoft Word."
    );
  }
  return "This wording is likely to wrap onto extra lines compared with the current paragraph.";
}

function pageCountWarningSentence(layout: SuggestionLineLayout): string {
  const approximate = layout.substitutionActive || layout.measureFailed;
  if (approximate) {
    return (
      "This wording looks like it would increase the estimated page count, but the estimate is approximate " +
      "because the preview font or measurement differs from Microsoft Word."
    );
  }
  return "This wording is likely to increase the estimated page count compared with the current resume.";
}

function fingerprintStaleSentence(): string {
  return (
    "Layout estimate was refreshed because preview fonts or page geometry changed. " +
    "Typing in the resume is not blocked."
  );
}

/**
 * User-visible card copy. Always says Accept remains available (Q6 default).
 * Color is not the only cue — this string is the warning.
 */
export function suggestionLineLayoutWarning(
  layout: SuggestionLineLayout,
  options?: { storedLayout?: LayoutReport }
): string | null {
  const extraWrap =
    layout.originalLineCount !== null &&
    layout.candidateLineCount !== null &&
    layout.candidateLineCount > layout.originalLineCount;
  const extraPage =
    layout.originalPageCount !== null &&
    layout.candidatePageCount !== null &&
    layout.candidatePageCount > layout.originalPageCount;
  const parts: string[] = [];
  const fingerprintChanged = layoutFingerprintChanged(
    options?.storedLayout?.fingerprint,
    layout.fingerprint
  );

  if (fingerprintChanged) {
    parts.push(fingerprintStaleSentence());
  }
  if (layout.report.status === "page_count_changed" || extraPage) {
    parts.push(pageCountWarningSentence(layout));
  }
  if (layout.report.status === "wraps" || extraWrap) {
    parts.push(wrapWarningSentence(layout));
  } else if (layout.report.status === "line_count_changed") {
    parts.push("Estimated line count changed compared with the current paragraph.");
  } else if (layout.report.status === "near_limit") {
    parts.push("This wording is close to wrapping onto another line.");
  }

  if (layout.exceedsSoftCharacterCap) {
    parts.push(
      `This wording is over the ${SOFT_CHARACTER_CAP_DEFAULT}-character hint. Character count does not override wrap.`
    );
  }

  if (parts.length === 0) return null;
  return `${parts.join(" ")} You can still Accept.`;
}

type Canvas2D = {
  font: string;
  letterSpacing?: string;
  measureText: (text: string) => { width: number };
};

function canvas2dContext(): Canvas2D | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d");
      if (ctx) return ctx;
    }
  } catch {
    // Node / missing OffscreenCanvas — try a DOM canvas next.
  }
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) return ctx;
    }
  } catch {
    // Vitest node has neither surface.
  }
  return null;
}

/**
 * Browser `measureText` adapter. Returns null when no canvas exists (CI / node).
 * Widths are converted from CSS px to points so they match `sectPr` math.
 */
export function createCanvasMeasureTextFn(): MeasureTextFn | null {
  const ctx = canvas2dContext();
  if (!ctx) return null;
  return (text, style) => {
    ctx.font = canvasFontFromStyle(style);
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = `${pointsToCssPx(style.letterSpacingPt)}px`;
    }
    return cssPxToPoints(ctx.measureText(text).width);
  };
}
