/**
 * Read-only OOXML inventory (Phase 0E).
 *
 * Extracts section geometry, unique font names, and plaintext reading order.
 * Does not rewrite package parts.
 */

import { XMLParser } from "fast-xml-parser";
import { DOCUMENT_XML_PATH, getDocxPart, loadDocxBuffer, type LoadedDocx } from "./resumeZip";

export const STYLES_XML_PATH = "word/styles.xml";
export const FONT_TABLE_XML_PATH = "word/fontTable.xml";
export const THEME_XML_PATH = "word/theme/theme1.xml";

export class ResumeOoxmlReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeOoxmlReadError";
  }
}

export type FxpNode = Record<string, unknown>;

export type ResumeSectionGeometry = {
  pageWidthTwips: number;
  pageHeightTwips: number;
  marginTopTwips: number;
  marginRightTwips: number;
  marginBottomTwips: number;
  marginLeftTwips: number;
  headerTwips: number | null;
  footerTwips: number | null;
  gutterTwips: number | null;
};

export type ResumeOoxmlInventory = {
  paragraphCount: number;
  paragraphs: string[];
  concatenatedPlaintext: string;
  fonts: string[];
  sections: ResumeSectionGeometry[];
};

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: false,
  alwaysCreateTextNode: true,
});

const FONT_NAME_ATTRS = ["@_w:ascii", "@_w:hAnsi", "@_w:eastAsia", "@_w:cs"];

export function isRecord(value: unknown): value is FxpNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function elementTag(node: FxpNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return undefined;
}

export function elementChildren(node: FxpNode): FxpNode[] {
  const tag = elementTag(node);
  if (!tag) return [];
  const children = node[tag];
  if (!Array.isArray(children)) return [];
  return children.filter(isRecord);
}

export function setElementChildren(node: FxpNode, children: FxpNode[]): void {
  const tag = elementTag(node);
  if (!tag) return;
  node[tag] = children;
}

export function getAttrs(node: FxpNode): Record<string, string> {
  const attrs = node[":@"];
  if (!isRecord(attrs)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export function wtText(wtNode: FxpNode): string {
  const children = wtNode["w:t"];
  if (!Array.isArray(children)) return "";
  let out = "";
  for (const child of children) {
    if (isRecord(child) && typeof child["#text"] === "string") {
      out += child["#text"];
    }
  }
  return out;
}

export function parseFragment(xml: string): FxpNode[] {
  const parsed: unknown = xmlParser.parse(xml);
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new ResumeOoxmlReadError("Could not parse OOXML fragment");
  }
  return parsed;
}

/**
 * Document-order `w:p` slices (including table-cell paragraphs). Nested
 * `w:pPr` is not treated as a paragraph start.
 */
export function listParagraphXml(documentXml: string): string[] {
  return paragraphRanges(documentXml).map((range) => documentXml.slice(range.start, range.end));
}

export function paragraphRanges(documentXml: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < documentXml.length) {
    const start = documentXml.indexOf("<w:p", i);
    if (start < 0) break;
    const next = documentXml[start + 4];
    if (next !== " " && next !== ">" && next !== "/") {
      i = start + 4;
      continue;
    }
    const gt = documentXml.indexOf(">", start);
    if (gt < 0) break;
    if (documentXml[gt - 1] === "/") {
      ranges.push({ start, end: gt + 1 });
      i = gt + 1;
      continue;
    }
    let depth = 1;
    let j = gt + 1;
    while (j < documentXml.length && depth > 0) {
      const nextP = documentXml.indexOf("<w:p", j);
      const nextEnd = documentXml.indexOf("</w:p>", j);
      if (nextEnd < 0) break;
      if (nextP >= 0 && nextP < nextEnd) {
        const n = documentXml[nextP + 4];
        if (n === " " || n === ">" || n === "/") {
          const nestedGt = documentXml.indexOf(">", nextP);
          if (nestedGt >= 0 && documentXml[nestedGt - 1] === "/") {
            j = nestedGt + 1;
            continue;
          }
          depth += 1;
          j = (nestedGt >= 0 ? nestedGt : nextP) + 1;
          continue;
        }
        j = nextP + 4;
        continue;
      }
      depth -= 1;
      if (depth === 0) {
        ranges.push({ start, end: nextEnd + 6 });
        j = nextEnd + 6;
        break;
      }
      j = nextEnd + 6;
    }
    i = j;
  }
  return ranges;
}

function paragraphPlaintextFromNode(pNode: FxpNode): string {
  let plain = "";

  const visitNodes = (nodes: FxpNode[]): void => {
    for (const node of nodes) {
      if (typeof node["#text"] === "string" && elementTag(node) === undefined) continue;
      const tag = elementTag(node);
      if (!tag) continue;
      if (tag === "w:pPr") continue;
      if (tag === "w:t") {
        plain += wtText(node);
        continue;
      }
      if (
        tag === "w:r" ||
        tag === "w:hyperlink" ||
        tag === "w:sdt" ||
        tag === "w:sdtContent" ||
        tag === "w:sdtPr" ||
        tag === "w:customXml" ||
        tag === "w:smartTag" ||
        tag === "w:fldSimple" ||
        tag === "w:ins" ||
        tag === "w:del"
      ) {
        visitNodes(elementChildren(node));
      }
    }
  };

  visitNodes(elementChildren(pNode));
  return plain;
}

export function paragraphPlaintextFromXml(paragraphXml: string): string {
  const parsed = parseFragment(paragraphXml);
  const pNode = parsed.find((node) => elementTag(node) === "w:p");
  if (!pNode) return "";
  return paragraphPlaintextFromNode(pNode);
}

export async function listParagraphPlaintexts(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<string[]> {
  const loaded = await loadDocxBuffer(docxBytes);
  const xml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  return listParagraphXml(xml).map(paragraphPlaintextFromXml);
}

function tryGetPart(loaded: LoadedDocx, path: string): Uint8Array | null {
  const entry = loaded.entries.find((item) => item.name === path && !item.dir);
  return entry ? entry.data : null;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function walkElements(
  nodes: FxpNode[],
  visit: (tag: string, node: FxpNode) => void
): void {
  for (const node of nodes) {
    const tag = elementTag(node);
    if (!tag) continue;
    visit(tag, node);
    walkElements(elementChildren(node), visit);
  }
}

function parseTwip(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function attr(node: FxpNode, localName: string): string | undefined {
  const attrs = getAttrs(node);
  return attrs[`@_w:${localName}`] ?? attrs[`@_${localName}`] ?? attrs[`@_a:${localName}`];
}

function parseSectionGeometry(sectPr: FxpNode): ResumeSectionGeometry | null {
  let pageWidthTwips: number | null = null;
  let pageHeightTwips: number | null = null;
  let marginTopTwips: number | null = null;
  let marginRightTwips: number | null = null;
  let marginBottomTwips: number | null = null;
  let marginLeftTwips: number | null = null;
  let headerTwips: number | null = null;
  let footerTwips: number | null = null;
  let gutterTwips: number | null = null;

  for (const child of elementChildren(sectPr)) {
    const tag = elementTag(child);
    if (tag === "w:pgSz") {
      pageWidthTwips = parseTwip(attr(child, "w"));
      pageHeightTwips = parseTwip(attr(child, "h"));
    }
    if (tag === "w:pgMar") {
      marginTopTwips = parseTwip(attr(child, "top"));
      marginRightTwips = parseTwip(attr(child, "right"));
      marginBottomTwips = parseTwip(attr(child, "bottom"));
      marginLeftTwips = parseTwip(attr(child, "left"));
      headerTwips = parseTwip(attr(child, "header"));
      footerTwips = parseTwip(attr(child, "footer"));
      gutterTwips = parseTwip(attr(child, "gutter"));
    }
  }

  if (
    pageWidthTwips === null ||
    pageHeightTwips === null ||
    marginTopTwips === null ||
    marginRightTwips === null ||
    marginBottomTwips === null ||
    marginLeftTwips === null
  ) {
    return null;
  }

  return {
    pageWidthTwips,
    pageHeightTwips,
    marginTopTwips,
    marginRightTwips,
    marginBottomTwips,
    marginLeftTwips,
    headerTwips,
    footerTwips,
    gutterTwips,
  };
}

function collectConcreteFonts(nodes: FxpNode[], into: Set<string>): void {
  walkElements(nodes, (tag, node) => {
    const attrs = getAttrs(node);
    if (tag === "w:rFonts") {
      for (const key of FONT_NAME_ATTRS) {
        const value = attrs[key];
        if (value) into.add(value);
      }
    }
    if (tag === "w:font") {
      const name = attr(node, "name");
      if (name) into.add(name);
    }
    if (tag === "a:latin" || tag === "a:ea" || tag === "a:cs" || tag === "a:sym") {
      const typeface = attrs["@_typeface"];
      if (typeface && !typeface.startsWith("+")) into.add(typeface);
    }
  });
}

function collectThemeSlotTypefaces(themeXml: string, into: Set<string>): void {
  const parsed = parseFragment(themeXml);
  walkElements(parsed, (tag, node) => {
    if (tag !== "a:latin" && tag !== "a:ea" && tag !== "a:cs") return;
    const typeface = getAttrs(node)["@_typeface"];
    if (typeface && !typeface.startsWith("+")) into.add(typeface);
  });
}

/**
 * Read-only inventory of fonts, `sectPr` geometry, and paragraph plaintext.
 */
export async function readResumeOoxml(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<ResumeOoxmlInventory> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = decodeUtf8(getDocxPart(loaded, DOCUMENT_XML_PATH));
  const paragraphs = listParagraphXml(documentXml).map(paragraphPlaintextFromXml);
  const concatenatedPlaintext = paragraphs.join("\n");
  if (concatenatedPlaintext.replace(/\n/g, "").length === 0) {
    throw new ResumeOoxmlReadError("Document plaintext is empty");
  }

  const documentNodes = parseFragment(documentXml);
  const sections: ResumeSectionGeometry[] = [];
  walkElements(documentNodes, (tag, node) => {
    if (tag !== "w:sectPr") return;
    const geometry = parseSectionGeometry(node);
    if (geometry) sections.push(geometry);
  });
  if (sections.length === 0) {
    throw new ResumeOoxmlReadError("Document has no usable sectPr page geometry");
  }

  const fonts = new Set<string>();
  collectConcreteFonts(documentNodes, fonts);

  const stylesPart = tryGetPart(loaded, STYLES_XML_PATH);
  if (stylesPart) {
    collectConcreteFonts(parseFragment(decodeUtf8(stylesPart)), fonts);
  }
  const fontTablePart = tryGetPart(loaded, FONT_TABLE_XML_PATH);
  if (fontTablePart) {
    collectConcreteFonts(parseFragment(decodeUtf8(fontTablePart)), fonts);
  }
  const themePart = tryGetPart(loaded, THEME_XML_PATH);
  if (themePart) {
    collectThemeSlotTypefaces(decodeUtf8(themePart), fonts);
  }

  const fontList = [...fonts].sort((a, b) => a.localeCompare(b));
  if (fontList.length === 0) {
    throw new ResumeOoxmlReadError("Document font list is empty");
  }

  return {
    paragraphCount: paragraphs.length,
    paragraphs,
    concatenatedPlaintext,
    fonts: fontList,
    sections,
  };
}
