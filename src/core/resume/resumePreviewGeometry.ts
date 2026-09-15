/**
 * Paginated preview geometry (Phase 4A).
 *
 * Pure unit math for the read-only CSS document preview. Maps OOXML units
 * (twips / points) to CSS px (1 twip = 1/20 pt; 96 CSS px per inch) and lays
 * the persisted block graph out onto US Letter pages.
 *
 * Scope note (deliberate): pagination here uses a *soft* character-count line
 * estimate — the §30 "authority stack" level 1. The authoritative canvas
 * `measureText` width and page-count warnings are Wave 8 (`resumeLayout.ts`,
 * Phases 8A–8C); Microsoft Word remains the true layout authority (§58). This
 * module only decides how to split blocks across preview pages so the reader
 * sees roughly the right number of pages. It never mutates document bytes.
 */

import type { ResumeStructureBlock } from "./resumeModel";

export const CSS_PX_PER_INCH = 96;
export const TWIPS_PER_INCH = 1440;
export const POINTS_PER_INCH = 72;
export const TWIPS_PER_POINT = 20;

/** Twips (1/1440 inch) → CSS px at 96 dpi. */
export function twipsToCssPx(twips: number): number {
  return (twips / TWIPS_PER_INCH) * CSS_PX_PER_INCH;
}

/** Points (1/72 inch) → CSS px at 96 dpi. */
export function pointsToCssPx(points: number): number {
  return (points / POINTS_PER_INCH) * CSS_PX_PER_INCH;
}

/** OOXML `w:sz` half-points → points. */
export function halfPointsToPoints(halfPoints: number): number {
  return halfPoints / 2;
}

export type PreviewGeometry = {
  pageWidthPx: number;
  pageHeightPx: number;
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
};

export const US_LETTER_WIDTH_IN = 8.5;
export const US_LETTER_HEIGHT_IN = 11;
/**
 * Default margin used by the preview. The persisted `extracted_structure` does
 * not carry `sectPr`, so the preview defaults to US Letter with Word's 1-inch
 * margins (architecture §16 stores structure only). Real page geometry is a
 * later concern; this is an approximation and Word stays authoritative.
 */
export const DEFAULT_MARGIN_IN = 1;

export const DEFAULT_US_LETTER_GEOMETRY: PreviewGeometry = {
  pageWidthPx: US_LETTER_WIDTH_IN * CSS_PX_PER_INCH,
  pageHeightPx: US_LETTER_HEIGHT_IN * CSS_PX_PER_INCH,
  marginTopPx: DEFAULT_MARGIN_IN * CSS_PX_PER_INCH,
  marginRightPx: DEFAULT_MARGIN_IN * CSS_PX_PER_INCH,
  marginBottomPx: DEFAULT_MARGIN_IN * CSS_PX_PER_INCH,
  marginLeftPx: DEFAULT_MARGIN_IN * CSS_PX_PER_INCH,
};

export function contentWidthPx(geometry: PreviewGeometry): number {
  return geometry.pageWidthPx - geometry.marginLeftPx - geometry.marginRightPx;
}

export function contentHeightPx(geometry: PreviewGeometry): number {
  return geometry.pageHeightPx - geometry.marginTopPx - geometry.marginBottomPx;
}

/** Body font size assumed when a paragraph inherits its size (`w:sz` absent). */
export const DEFAULT_BODY_FONT_SIZE_PT = 11;
/** Approximate line box height as a multiple of the font size. */
export const LINE_HEIGHT_FACTOR = 1.15;
/** Approximate spacing after each paragraph, in points. */
export const PARAGRAPH_SPACING_PT = 4;
/**
 * Average glyph advance as a fraction of the font size. A soft heuristic only:
 * canvas `measureText` (Phase 8A) is the real width authority.
 */
export const AVERAGE_CHAR_WIDTH_FACTOR = 0.5;

/** Largest concrete run size in a block, or the body default when all inherit. */
export function blockFontSizePt(block: ResumeStructureBlock): number {
  let max = 0;
  for (const run of block.runs) {
    if (run.sizePt !== null && run.sizePt > max) max = run.sizePt;
  }
  return max > 0 ? max : DEFAULT_BODY_FONT_SIZE_PT;
}

/** Soft estimate of how many wrapped lines a block occupies. */
export function estimateBlockLineCount(
  block: ResumeStructureBlock,
  geometry: PreviewGeometry = DEFAULT_US_LETTER_GEOMETRY
): number {
  const fontSizePt = blockFontSizePt(block);
  const averageCharPx = pointsToCssPx(fontSizePt) * AVERAGE_CHAR_WIDTH_FACTOR;
  const charsPerLine = Math.max(1, Math.floor(contentWidthPx(geometry) / averageCharPx));
  const charCount = block.text.length;
  // An empty paragraph still occupies one line box.
  if (charCount === 0) return 1;
  return Math.max(1, Math.ceil(charCount / charsPerLine));
}

/** Soft estimate of a block's rendered height in CSS px (lines + spacing). */
export function estimateBlockHeightPx(
  block: ResumeStructureBlock,
  geometry: PreviewGeometry = DEFAULT_US_LETTER_GEOMETRY
): number {
  const fontSizePt = blockFontSizePt(block);
  const lineHeightPx = pointsToCssPx(fontSizePt) * LINE_HEIGHT_FACTOR;
  const lines = estimateBlockLineCount(block, geometry);
  return lines * lineHeightPx + pointsToCssPx(PARAGRAPH_SPACING_PT);
}

export type PreviewPage = {
  blocks: ResumeStructureBlock[];
};

/**
 * Greedily assign blocks to US Letter pages using the soft height estimate.
 * A block taller than a whole page is not split — it sits alone on its own
 * page rather than looping forever. Always returns at least one page.
 */
export function paginatePreviewBlocks(
  blocks: ResumeStructureBlock[],
  geometry: PreviewGeometry = DEFAULT_US_LETTER_GEOMETRY
): PreviewPage[] {
  const maxHeightPx = contentHeightPx(geometry);
  const pages: PreviewPage[] = [];
  let current: ResumeStructureBlock[] = [];
  let usedPx = 0;

  for (const block of blocks) {
    const blockHeightPx = estimateBlockHeightPx(block, geometry);
    if (current.length > 0 && usedPx + blockHeightPx > maxHeightPx) {
      pages.push({ blocks: current });
      current = [];
      usedPx = 0;
    }
    current.push(block);
    usedPx += blockHeightPx;
  }

  if (current.length > 0 || pages.length === 0) {
    pages.push({ blocks: current });
  }
  return pages;
}
