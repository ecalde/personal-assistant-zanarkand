/**
 * ATS structural (parseability) checks — Phase 3D.
 *
 * These are **warnings only** (architecture §31, RES-ATS-003). They describe
 * documented failure modes of resume parsers as detected in *our* OOXML: a
 * table, a text box, contact details that live only in a header. Nothing here
 * produces a pass/fail verdict, a probability, or a score, and nothing here
 * claims a named vendor would accept or reject the document (RES-ATS-001).
 * Hidden-text tricks are never suggested as a remedy (RES-ATS-002).
 *
 * The report is a pure projection of the package bytes: no mutation, no
 * network, no model. Persisting it on the version row is Phase 3F; rendering
 * it (with the §31 disclosure copy) is Phase 5E.
 */

import { DOCUMENT_XML_PATH, getDocxPart, loadDocxBuffer, type LoadedDocx } from "./resumeZip";
import {
  elementChildren,
  elementTag,
  getAttrs,
  listParagraphXml,
  paragraphPlaintextFromXml,
  parseFragment,
  walkElements,
  type FxpNode,
} from "./resumeOoxmlRead";
import {
  ATS_WARNING_CODES,
  type AtsWarningCode,
  type AtsWarningSeverity,
  type ResumeAtsReport,
  type ResumeAtsWarning,
} from "./resumeModel";

export const DOCUMENT_RELS_PATH = "word/_rels/document.xml.rels";
export const NUMBERING_XML_PATH = "word/numbering.xml";

// The warning vocabulary lives in the domain model so the version-row mappers
// (Phase 3F) can validate persisted codes without importing the OOXML reader.
export { ATS_WARNING_CODES };
export type { AtsWarningCode, AtsWarningSeverity, ResumeAtsReport, ResumeAtsWarning };

/** The package parts these checks read. Only `documentXml` is required. */
export type ResumeAtsPackageParts = {
  documentXml: string;
  /** Plaintext sources for the header/footer contact check. */
  headerFooterXmls?: readonly string[];
  /** `word/_rels/document.xml.rels`; null/absent means the part is missing. */
  documentRelsXml?: string | null;
  numberingXml?: string | null;
};

const SYMBOL_BULLET_FONTS = new Set([
  "wingdings",
  "wingdings 2",
  "wingdings 3",
  "webdings",
  "symbol",
  "marlett",
  "zapfdingbats",
]);

const FONT_NAME_ATTRS = ["@_w:ascii", "@_w:hAnsi", "@_w:cs", "@_w:eastAsia"];

/**
 * Word's own default bullet glyphs. They are drawn from Symbol / Wingdings /
 * Courier New but every mainstream extractor already handles them, so warning
 * about them would fire on essentially every Word resume. Only decorative
 * glyphs beyond this set are worth reporting.
 */
const DEFAULT_BULLET_CODE_POINTS = new Set([
  0x2022, // •
  0x00b7, // ·
  0x25aa, // ▪
  0x25cb, // ○
  0x006f, // o (Courier New second level)
  0xf0b7, // Symbol bullet
  0xf0a7, // Wingdings square
  0xf06f, // Wingdings hollow square
]);

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Ten-digit phone shapes with common separators; deliberately loose.
const PHONE_PATTERN = /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const PROFILE_URL_PATTERN = /(?:linkedin\.com|github\.com)\/[A-Za-z0-9._/-]+/i;

function attrValue(node: FxpNode, ...keys: string[]): string | undefined {
  const attrs = getAttrs(node);
  for (const key of keys) {
    const value = attrs[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function plaintextOf(partXml: string): string {
  return listParagraphXml(partXml).map(paragraphPlaintextFromXml).join("\n");
}

function hasContactPattern(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || PROFILE_URL_PATTERN.test(text);
}

function isSymbolFont(name: string | undefined): boolean {
  return name !== undefined && SYMBOL_BULLET_FONTS.has(name.trim().toLowerCase());
}

/** A glyph is "decorative" when a symbol font draws something Word would not. */
function isDecorativeGlyph(font: string | undefined, glyph: string): boolean {
  if (!isSymbolFont(font)) return false;
  const codePoints = [...glyph].map((char) => char.codePointAt(0) ?? 0);
  if (codePoints.length === 0) return true;
  return !codePoints.every((point) => DEFAULT_BULLET_CODE_POINTS.has(point));
}

function glyphFromSymChar(hex: string | undefined): string {
  if (hex === undefined) return "";
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? String.fromCodePoint(value) : "";
}

type DocumentStructure = {
  tableCount: number;
  textBoxCount: number;
  /** Sections whose `w:cols` declares more than one column. */
  multiColumnSectionCount: number;
  sectionCount: number;
  drawingsWithoutAltTextCount: number;
  /** Floating (`wp:anchor`) drawings: visual position, ambiguous reading order. */
  floatingDrawingCount: number;
  /** Inline `w:sym` runs drawing a decorative glyph. */
  decorativeSymbolRunCount: number;
  /** `numId|ilvl` pairs that paragraphs actually use. */
  usedNumberingLevels: Set<string>;
  hyperlinkRelIds: string[];
  hyperlinkAnchors: string[];
  /** `w:hyperlink` with neither `r:id` nor `w:anchor`. */
  targetlessHyperlinkCount: number;
  bookmarkNames: Set<string>;
};

function analyzeDocumentStructure(documentNodes: FxpNode[]): DocumentStructure {
  const structure: DocumentStructure = {
    tableCount: 0,
    textBoxCount: 0,
    multiColumnSectionCount: 0,
    sectionCount: 0,
    drawingsWithoutAltTextCount: 0,
    floatingDrawingCount: 0,
    decorativeSymbolRunCount: 0,
    usedNumberingLevels: new Set<string>(),
    hyperlinkRelIds: [],
    hyperlinkAnchors: [],
    targetlessHyperlinkCount: 0,
    bookmarkNames: new Set<string>(),
  };

  const visit = (nodes: FxpNode[]): void => {
    for (const node of nodes) {
      const tag = elementTag(node);
      if (!tag) continue;

      // A text box round-trips as `mc:Choice` (DrawingML) plus `mc:Fallback`
      // (VML) describing the *same* shape. Counting only the choice keeps the
      // occurrence counts equal to what the user sees on the page.
      if (tag === "mc:Fallback") continue;

      switch (tag) {
        case "w:tbl":
          structure.tableCount += 1;
          break;
        case "w:txbxContent":
          structure.textBoxCount += 1;
          break;
        case "w:sectPr":
          structure.sectionCount += 1;
          break;
        case "w:cols": {
          const num = Number.parseInt(attrValue(node, "@_w:num") ?? "1", 10);
          if (Number.isFinite(num) && num > 1) structure.multiColumnSectionCount += 1;
          break;
        }
        case "wp:anchor":
          structure.floatingDrawingCount += 1;
          break;
        case "wp:docPr": {
          const descr = attrValue(node, "@_descr")?.trim() ?? "";
          const title = attrValue(node, "@_title")?.trim() ?? "";
          if (descr.length === 0 && title.length === 0) {
            structure.drawingsWithoutAltTextCount += 1;
          }
          break;
        }
        case "v:shape": {
          // Legacy VML picture: `alt` is the only alt-text carrier.
          if ((attrValue(node, "@_alt")?.trim() ?? "").length === 0) {
            structure.drawingsWithoutAltTextCount += 1;
          }
          break;
        }
        case "w:sym": {
          const font = attrValue(node, "@_w:font");
          const glyph = glyphFromSymChar(attrValue(node, "@_w:char"));
          if (isDecorativeGlyph(font, glyph)) structure.decorativeSymbolRunCount += 1;
          break;
        }
        case "w:numPr": {
          const numId = numPrValue(node, "w:numId");
          if (numId !== undefined) {
            structure.usedNumberingLevels.add(`${numId}|${numPrValue(node, "w:ilvl") ?? "0"}`);
          }
          break;
        }
        case "w:hyperlink": {
          const relId = attrValue(node, "@_r:id");
          const anchor = attrValue(node, "@_w:anchor");
          if (relId !== undefined) structure.hyperlinkRelIds.push(relId);
          else if (anchor !== undefined) structure.hyperlinkAnchors.push(anchor);
          else structure.targetlessHyperlinkCount += 1;
          break;
        }
        case "w:bookmarkStart": {
          const name = attrValue(node, "@_w:name");
          if (name !== undefined) structure.bookmarkNames.add(name);
          break;
        }
        default:
          break;
      }

      visit(elementChildren(node));
    }
  };

  visit(documentNodes);
  return structure;
}

/** Relationship ids that resolve to a non-empty target. */
function usableRelationshipIds(relsXml: string): Set<string> {
  const ids = new Set<string>();
  walkElements(parseFragment(relsXml), (tag, node) => {
    if (tag !== "Relationship") return;
    const id = attrValue(node, "@_Id");
    const target = attrValue(node, "@_Target")?.trim() ?? "";
    if (id !== undefined && target.length > 0) ids.add(id);
  });
  return ids;
}

/** `<w:numId w:val="3"/>` style children of a `w:numPr`. */
function numPrValue(numPr: FxpNode, childTag: string): string | undefined {
  for (const child of elementChildren(numPr)) {
    if (elementTag(child) === childTag) return attrValue(child, "@_w:val");
  }
  return undefined;
}

type NumberingLevel = {
  font: string | undefined;
  glyph: string;
};

type NumberingDefinitions = {
  /** `w:numId` → `w:abstractNumId`. */
  abstractIdByNumId: Map<string, string>;
  /** `abstractNumId|ilvl` → level glyph description. */
  levels: Map<string, NumberingLevel>;
};

function levelFont(lvl: FxpNode): string | undefined {
  for (const child of elementChildren(lvl)) {
    if (elementTag(child) !== "w:rPr") continue;
    for (const rPrChild of elementChildren(child)) {
      if (elementTag(rPrChild) !== "w:rFonts") continue;
      for (const key of FONT_NAME_ATTRS) {
        const font = attrValue(rPrChild, key);
        if (font !== undefined) return font;
      }
    }
  }
  return undefined;
}

function parseNumberingDefinitions(numberingXml: string): NumberingDefinitions {
  const abstractIdByNumId = new Map<string, string>();
  const levels = new Map<string, NumberingLevel>();

  walkElements(parseFragment(numberingXml), (tag, node) => {
    if (tag === "w:num") {
      const numId = attrValue(node, "@_w:numId");
      const abstractId = elementChildren(node)
        .filter((child) => elementTag(child) === "w:abstractNumId")
        .map((child) => attrValue(child, "@_w:val"))
        .find((value) => value !== undefined);
      if (numId !== undefined && abstractId !== undefined) {
        abstractIdByNumId.set(numId, abstractId);
      }
      return;
    }
    if (tag !== "w:abstractNum") return;

    const abstractId = attrValue(node, "@_w:abstractNumId");
    if (abstractId === undefined) return;
    for (const lvl of elementChildren(node)) {
      if (elementTag(lvl) !== "w:lvl") continue;
      const ilvl = attrValue(lvl, "@_w:ilvl") ?? "0";
      const lvlText =
        elementChildren(lvl)
          .filter((child) => elementTag(child) === "w:lvlText")
          .map((child) => attrValue(child, "@_w:val"))
          .find((value) => value !== undefined) ?? "";
      levels.set(`${abstractId}|${ilvl}`, { font: levelFont(lvl), glyph: lvlText });
    }
  });

  return { abstractIdByNumId, levels };
}

/**
 * List levels the document actually uses whose glyph is decorative. Unused
 * `numbering.xml` definitions are ignored: Word ships a dozen of them in every
 * file and none of them reach the page.
 */
function countDecorativeNumberingLevels(
  numberingXml: string,
  usedNumberingLevels: ReadonlySet<string>
): number {
  const definitions = parseNumberingDefinitions(numberingXml);
  let count = 0;
  for (const used of usedNumberingLevels) {
    const [numId, ilvl] = used.split("|");
    const abstractId = definitions.abstractIdByNumId.get(numId);
    if (abstractId === undefined) continue;
    const level = definitions.levels.get(`${abstractId}|${ilvl}`);
    if (level && isDecorativeGlyph(level.font, level.glyph)) count += 1;
  }
  return count;
}

function warning(
  code: AtsWarningCode,
  severity: AtsWarningSeverity,
  occurrences: number,
  message: string
): ResumeAtsWarning {
  return { code, severity, occurrences, message };
}

/**
 * Run the parseability checks over already-decoded package parts.
 *
 * Warnings come back in `ATS_WARNING_CODES` order so the result is stable
 * regardless of where a structure sits in the document.
 */
export function atsChecksFromPackageParts(parts: ResumeAtsPackageParts): ResumeAtsReport {
  const structure = analyzeDocumentStructure(parseFragment(parts.documentXml));
  const bodyText = plaintextOf(parts.documentXml);
  const headerFooterText = (parts.headerFooterXmls ?? []).map(plaintextOf).join("\n");

  const byCode = new Map<AtsWarningCode, ResumeAtsWarning>();
  const add = (item: ResumeAtsWarning): void => {
    byCode.set(item.code, item);
  };

  if (bodyText.trim().length === 0) {
    add(
      warning(
        "no_selectable_text",
        "warning",
        1,
        "The document body has no selectable text. A parser that cannot read text " +
          "extracts nothing, so an image-only or fully text-boxed resume is usually unusable."
      )
    );
  }

  if (structure.tableCount > 0) {
    add(
      warning(
        "table_layout",
        "warning",
        structure.tableCount,
        `Found ${structure.tableCount} table(s). Some parsers read table cells in an ` +
          "order that does not match how the page looks, which can split a role from its dates."
      )
    );
  }

  if (structure.textBoxCount > 0) {
    add(
      warning(
        "text_box_content",
        "warning",
        structure.textBoxCount,
        `Found ${structure.textBoxCount} text box(es). Text inside a text box is often ` +
          "skipped entirely during extraction."
      )
    );
  }

  if (structure.multiColumnSectionCount > 0) {
    add(
      warning(
        "multi_column_section",
        "warning",
        structure.multiColumnSectionCount,
        `Found ${structure.multiColumnSectionCount} multi-column section(s). Columns are a ` +
          "common cause of interleaved text after extraction."
      )
    );
  }

  if (structure.sectionCount > 1) {
    add(
      warning(
        "multiple_sections",
        "info",
        structure.sectionCount,
        `The document has ${structure.sectionCount} section definitions. Mixed page or column ` +
          "geometry makes reading order harder to predict."
      )
    );
  }

  if (!hasContactPattern(bodyText) && hasContactPattern(headerFooterText)) {
    add(
      warning(
        "contact_only_in_header_footer",
        "warning",
        1,
        "Contact details appear only in a header or footer. Headers and footers are " +
          "frequently dropped, which can leave the extracted resume without an email or phone."
      )
    );
  }

  if (structure.drawingsWithoutAltTextCount > 0) {
    add(
      warning(
        "image_without_alt_text",
        "info",
        structure.drawingsWithoutAltTextCount,
        `Found ${structure.drawingsWithoutAltTextCount} image(s) without alt text. Any ` +
          "information carried only by the picture is not in the extracted text."
      )
    );
  }

  const decorativeLevels = parts.numberingXml
    ? countDecorativeNumberingLevels(parts.numberingXml, structure.usedNumberingLevels)
    : 0;
  const decorativeGlyphs = decorativeLevels + structure.decorativeSymbolRunCount;
  if (decorativeGlyphs > 0) {
    add(
      warning(
        "nonstandard_bullet_font",
        "info",
        decorativeGlyphs,
        `Found ${decorativeGlyphs} decorative glyph(s) drawn from a symbol font such as ` +
          "Wingdings. Word's own default bullets are fine; decorative arrows or checkmarks " +
          "can extract as unrelated characters."
      )
    );
  }

  const ambiguous = structure.floatingDrawingCount + structure.textBoxCount;
  if (ambiguous > 0) {
    add(
      warning(
        "reading_order_uncertain",
        "info",
        ambiguous,
        `Found ${ambiguous} floating element(s) positioned visually rather than in the text ` +
          "flow, so the extracted reading order may differ from what the page shows."
      )
    );
  }

  const relsXml = parts.documentRelsXml ?? null;
  const usableIds = relsXml === null ? new Set<string>() : usableRelationshipIds(relsXml);
  const unresolvedRelIds = structure.hyperlinkRelIds.filter((id) => !usableIds.has(id));
  const danglingAnchors = structure.hyperlinkAnchors.filter(
    (anchor) => !structure.bookmarkNames.has(anchor)
  );
  const brokenLinks =
    unresolvedRelIds.length + danglingAnchors.length + structure.targetlessHyperlinkCount;
  if (brokenLinks > 0) {
    add(
      warning(
        "broken_hyperlink",
        "warning",
        brokenLinks,
        `Found ${brokenLinks} hyperlink(s) with no usable destination. The text still shows, ` +
          "but the link goes nowhere for a human reader or a parser following it."
      )
    );
  }

  const warnings = ATS_WARNING_CODES.map((code) => byCode.get(code)).filter(
    (item): item is ResumeAtsWarning => item !== undefined
  );
  return { warnings };
}

const HEADER_FOOTER_PATH = /^word\/(?:header|footer)\d*\.xml$/;

function optionalPartText(loaded: LoadedDocx, path: string): string | null {
  const entry = loaded.entries.find((item) => item.name === path && !item.dir);
  return entry ? new TextDecoder().decode(entry.data) : null;
}

function headerFooterTexts(loaded: LoadedDocx): string[] {
  return loaded.entries
    .filter((entry) => !entry.dir && HEADER_FOOTER_PATH.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => new TextDecoder().decode(entry.data));
}

/** Load a DOCX and report its parseability warnings. Never mutates the bytes. */
export async function analyzeResumeAtsStructure(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<ResumeAtsReport> {
  const loaded = await loadDocxBuffer(docxBytes);
  return atsChecksFromPackageParts({
    documentXml: new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH)),
    headerFooterXmls: headerFooterTexts(loaded),
    documentRelsXml: optionalPartText(loaded, DOCUMENT_RELS_PATH),
    numberingXml: optionalPartText(loaded, NUMBERING_XML_PATH),
  });
}
