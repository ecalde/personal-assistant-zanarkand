/**
 * Font preflight for the resume preview (Phase 4B).
 *
 * Architecture §40 / RES-DOC-005 / RES-FID-002:
 * - Calibri is the typical body font and is **not** redistributable.
 * - If Calibri (or another document font) is missing in the browser, the
 *   preview renders with **Carlito** (SIL OFL, metric-aimed Calibri
 *   substitute) and shows an honest warning that wrapping may differ from
 *   Word.
 * - Export keeps the original font **names** in OOXML (this module never
 *   rewrites document bytes).
 *
 * Availability is `document.fonts.check('10pt …')` as specified. Canvas
 * `measureText` width authority is Wave 8, not this phase.
 */

import type { ResumeStructureBlock } from "./resumeModel";

export const CALIBRI_FAMILY = "Calibri";
export const CARLITO_FAMILY = "Carlito";

/**
 * Preferred preview stack: Calibri where installed (Word machines), then
 * bundled Carlito, then generic sans-serif.
 */
export const PREVIEW_FONT_STACK =
  '"Calibri", "Carlito", "Segoe UI", system-ui, sans-serif';

/** Inherited / unspecified run fonts are treated as Calibri (research body). */
export const DEFAULT_BODY_FONT_FAMILY = CALIBRI_FAMILY;

/** Size used for `document.fonts.check`, matching architecture §40. */
export const PREFLIGHT_CHECK_SIZE_PT = 10;

export const CARLITO_FONT_FILES = [
  "Carlito-Regular.ttf",
  "Carlito-Bold.ttf",
  "Carlito-Italic.ttf",
  "Carlito-BoldItalic.ttf",
] as const;

export const CARLITO_LICENSE_FILE = "OFL.txt";

const CSS_GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

export type FontAvailabilityChecker = (cssFont: string) => boolean;

export type FontPreflightResult = {
  requestedFamilies: string[];
  missingFamilies: string[];
  substitutionActive: boolean;
  warning: string | null;
};

/** CSS `font` shorthand for `document.fonts.check` / `document.fonts.load`. */
export function cssFontQuery(family: string, sizePt: number = PREFLIGHT_CHECK_SIZE_PT): string {
  const safe = family.replace(/["\\]/g, "").trim();
  return `${sizePt}pt "${safe}"`;
}

function isNamedDocumentFont(family: string): boolean {
  const trimmed = family.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("+")) return false;
  if (CSS_GENERIC_FAMILIES.has(trimmed.toLowerCase())) return false;
  return true;
}

/**
 * Unique font families the preview must resolve, in locale-sorted order.
 * Null / inherited run fonts count as Calibri (the default body face).
 */
export function documentFontFamilies(blocks: readonly ResumeStructureBlock[]): string[] {
  if (blocks.length === 0) return [];

  const families = new Set<string>();
  let inherited = false;

  for (const block of blocks) {
    if (block.runs.length === 0) {
      inherited = true;
      continue;
    }
    for (const run of block.runs) {
      if (run.font === null || run.font.trim() === "") {
        inherited = true;
        continue;
      }
      if (isNamedDocumentFont(run.font)) families.add(run.font.trim());
    }
  }

  if (inherited || families.size === 0) {
    families.add(DEFAULT_BODY_FONT_FAMILY);
  }

  return [...families].sort((a, b) => a.localeCompare(b));
}

export function fontSubstitutionWarning(missingFamilies: readonly string[]): string {
  const names = missingFamilies.join(", ");
  const verb = missingFamilies.length === 1 ? "is" : "are";
  return (
    `${names} ${verb} not installed in this browser. ` +
    `The on-screen preview uses Carlito, a metric-compatible substitute. ` +
    `Line wrapping and page breaks may differ from Microsoft Word. ` +
    `Exported Word files keep the original font names.`
  );
}

/**
 * Compare requested families against a checker (typically `document.fonts.check`).
 * Does not rewrite OOXML and does not claim the preview matches Word.
 */
export function evaluateFontPreflight(
  families: readonly string[],
  isAvailable: FontAvailabilityChecker
): FontPreflightResult {
  const requestedFamilies = [...families];
  const missingFamilies = requestedFamilies.filter((family) => {
    try {
      return !isAvailable(cssFontQuery(family));
    } catch {
      return true;
    }
  });
  const substitutionActive = missingFamilies.length > 0;
  return {
    requestedFamilies,
    missingFamilies,
    substitutionActive,
    warning: substitutionActive ? fontSubstitutionWarning(missingFamilies) : null,
  };
}

/** True when the named family is available to CSS. Missing API → not available. */
export function checkBrowserFont(cssFont: string): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.fonts?.check(cssFont));
  } catch {
    return false;
  }
}

const CARLITO_LOAD_QUERIES = [
  cssFontQuery(CARLITO_FAMILY),
  `italic ${cssFontQuery(CARLITO_FAMILY)}`,
  `bold ${cssFontQuery(CARLITO_FAMILY)}`,
  `italic bold ${cssFontQuery(CARLITO_FAMILY)}`,
] as const;

/** Load bundled Carlito faces so the preview stack can actually substitute. */
export async function ensureCarlitoLoaded(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.all(CARLITO_LOAD_QUERIES.map((query) => document.fonts.load(query)));
    if (document.fonts.ready) await document.fonts.ready;
  } catch {
    // CSS @font-face may still apply; preflight reports substitution if needed.
  }
}
