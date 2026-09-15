import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ResumeStructureBlock, ResumeStructureRun } from "./resumeModel";
import {
  CALIBRI_FAMILY,
  CARLITO_FAMILY,
  CARLITO_FONT_FILES,
  CARLITO_LICENSE_FILE,
  PREFLIGHT_CHECK_SIZE_PT,
  PREVIEW_FONT_STACK,
  checkBrowserFont,
  cssFontQuery,
  documentFontFamilies,
  evaluateFontPreflight,
  fontSubstitutionWarning,
} from "./resumeFonts";

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

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../public/fonts");

describe("bundled Carlito (legal substitute)", () => {
  it("ships Carlito OFL files under public/fonts and does not ship Calibri", () => {
    expect(existsSync(FONTS_DIR)).toBe(true);
    const names = readdirSync(FONTS_DIR);
    for (const file of CARLITO_FONT_FILES) {
      expect(names).toContain(file);
      const bytes = readFileSync(join(FONTS_DIR, file));
      // TrueType scalar type `00 01 00 00`.
      expect([...bytes.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
      expect(bytes.byteLength).toBeGreaterThan(10_000);
    }
    expect(names).toContain(CARLITO_LICENSE_FILE);
    const ofl = readFileSync(join(FONTS_DIR, CARLITO_LICENSE_FILE), "utf8");
    expect(ofl).toMatch(/SIL Open Font License/i);
    expect(ofl).toMatch(/Carlito/);
    expect(names.some((name) => /calibri/i.test(name))).toBe(false);
  });

  it("names Calibri then Carlito in the preview stack (never ships Calibri bytes)", () => {
    expect(PREVIEW_FONT_STACK).toContain(`"${CALIBRI_FAMILY}"`);
    expect(PREVIEW_FONT_STACK).toContain(`"${CARLITO_FAMILY}"`);
    expect(PREVIEW_FONT_STACK.indexOf(CALIBRI_FAMILY)).toBeLessThan(
      PREVIEW_FONT_STACK.indexOf(CARLITO_FAMILY)
    );
  });
});

describe("cssFontQuery", () => {
  it("matches architecture §40 (`10pt \"Calibri\"`)", () => {
    expect(cssFontQuery(CALIBRI_FAMILY)).toBe(`${PREFLIGHT_CHECK_SIZE_PT}pt "Calibri"`);
    expect(cssFontQuery("Times New Roman")).toBe('10pt "Times New Roman"');
  });

  it("strips quotes and backslashes so a font name cannot break the CSS query", () => {
    expect(cssFontQuery('Calibri"; evil')).toBe('10pt "Calibri; evil"');
    expect(cssFontQuery("Calibri\\Arial")).toBe('10pt "CalibriArial"');
  });
});

describe("documentFontFamilies", () => {
  it("treats inherited (null) run fonts as Calibri", () => {
    expect(documentFontFamilies([block(0, "Hello")])).toEqual([CALIBRI_FAMILY]);
  });

  it("collects unique named run fonts in sorted order", () => {
    const blocks = [
      block(0, "Arial then Calibri", [
        run("Arial ", { font: "Arial" }),
        run("Calibri", { font: "Calibri" }),
      ]),
      block(1, "Arial again", [run("again", { font: "Arial" })]),
    ];
    expect(documentFontFamilies(blocks)).toEqual(["Arial", "Calibri"]);
  });

  it("adds Calibri when any run inherits even if others are named", () => {
    const blocks = [
      block(0, "mixed", [run("named", { font: "Arial" }), run("inherited")]),
    ];
    expect(documentFontFamilies(blocks)).toEqual(["Arial", "Calibri"]);
  });

  it("skips CSS generic families and empty theme slots", () => {
    const blocks = [
      block(0, "skip", [
        run("generic", { font: "sans-serif" }),
        run("theme", { font: "+mj-lt" }),
        run("blank", { font: "  " }),
      ]),
    ];
    expect(documentFontFamilies(blocks)).toEqual([CALIBRI_FAMILY]);
  });

  it("uses Calibri when the graph has blocks but no named fonts", () => {
    expect(documentFontFamilies([block(0, "", [])])).toEqual([CALIBRI_FAMILY]);
  });

  it("returns no families for an empty graph (no preview, no banner)", () => {
    expect(documentFontFamilies([])).toEqual([]);
  });
});

describe("evaluateFontPreflight", () => {
  it("is quiet when every requested family is available", () => {
    const result = evaluateFontPreflight([CALIBRI_FAMILY], () => true);
    expect(result.substitutionActive).toBe(false);
    expect(result.missingFamilies).toEqual([]);
    expect(result.warning).toBeNull();
  });

  it("activates Carlito substitution when Calibri is missing (RES-DOC-005)", () => {
    const result = evaluateFontPreflight([CALIBRI_FAMILY], () => false);
    expect(result.substitutionActive).toBe(true);
    expect(result.missingFamilies).toEqual([CALIBRI_FAMILY]);
    expect(result.warning).toBe(fontSubstitutionWarning([CALIBRI_FAMILY]));
  });

  it("warns for any missing document font, not only Calibri", () => {
    const result = evaluateFontPreflight(["Arial", "Calibri"], (css) => css.includes("Arial"));
    expect(result.missingFamilies).toEqual(["Calibri"]);
    expect(result.substitutionActive).toBe(true);
  });

  it("treats a throwing checker as missing (fail toward the honest warning)", () => {
    const result = evaluateFontPreflight(["Calibri"], () => {
      throw new Error("invalid font");
    });
    expect(result.substitutionActive).toBe(true);
  });
});

describe("font substitution warning copy (RES-FID-002)", () => {
  const copy = fontSubstitutionWarning([CALIBRI_FAMILY]);

  it("says wrapping may differ from Word and that export keeps original names", () => {
    expect(copy).toMatch(/Calibri/);
    expect(copy).toMatch(/Carlito/);
    expect(copy).toMatch(/wrapping/i);
    expect(copy).toMatch(/Microsoft Word/);
    expect(copy).toMatch(/original font names/);
  });

  it("does not claim pixel-perfect identity or invent an ATS score", () => {
    expect(copy).not.toMatch(/pixel[- ]perfect/i);
    expect(copy).not.toMatch(/identical/i);
    expect(copy).not.toMatch(/ATS/i);
    expect(copy).not.toMatch(/score/i);
  });
});

describe("checkBrowserFont", () => {
  it("returns false in node where document.fonts is absent", () => {
    expect(checkBrowserFont(cssFontQuery(CALIBRI_FAMILY))).toBe(false);
  });
});
