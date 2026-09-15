/**
 * Full OOXML block parse (Phase 3A).
 *
 * Projects the working DOCX into a block graph of paragraphs and their runs.
 * Each `w:p` becomes one block; each text-bearing `w:r` stays a distinct run
 * with its own formatting. Runs are never flattened into a single span, so
 * bold/italic/underline boundaries and hyperlink relationship ids survive.
 *
 * This is a read-only projection (architecture §16.1). Stable block ids
 * (bookmarks) are Phase 3B; the fact ledger is Phase 3C. Nothing here mutates
 * the working or original bytes.
 */

import { DOCUMENT_XML_PATH, getDocxPart, loadDocxBuffer } from "./resumeZip";
import {
  elementChildren,
  elementTag,
  getAttrs,
  listParagraphXml,
  parseFragment,
  wtText,
  type FxpNode,
} from "./resumeOoxmlRead";
import { RESUME_BOOKMARK_PREFIX, readParagraphBookmarkNames } from "./resumeOoxmlWrite";

/** A single formatting-homogeneous run of text inside a paragraph. */
export type ResumeRun = {
  /** Concatenated `w:t` text of this run (honors `xml:space="preserve"`). */
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Concrete typeface from `w:rFonts` (ascii preferred), or null if inherited. */
  font: string | null;
  /** Point size from `w:sz` (half-points / 2), or null if inherited. */
  sizePt: number | null;
  /** `r:id` of the enclosing `w:hyperlink`, or null when not in a hyperlink. */
  hyperlinkRelId: string | null;
};

/** One paragraph (`w:p`) projected into ordered text runs. */
export type ResumeBlock = {
  /** Zero-based document reading order. */
  order: number;
  /** Full paragraph plaintext (equals the concatenation of run texts). */
  text: string;
  runs: ResumeRun[];
};

export type ResumeBlockGraph = {
  blocks: ResumeBlock[];
};

/** Containers that hold runs but are not runs themselves (mirrors the reader). */
const RUN_CONTAINER_TAGS = new Set([
  "w:hyperlink",
  "w:sdt",
  "w:sdtContent",
  "w:sdtPr",
  "w:customXml",
  "w:smartTag",
  "w:fldSimple",
  "w:ins",
  "w:del",
]);

function findChild(rPr: FxpNode | null, tag: string): FxpNode | null {
  if (!rPr) return null;
  return elementChildren(rPr).find((child) => elementTag(child) === tag) ?? null;
}

/**
 * Toggle-property semantics: present with no `w:val` (or a truthy val) is on;
 * `w:val="0" | "false" | "off"` turns it off.
 */
function toggleProp(rPr: FxpNode | null, tag: string): boolean {
  const el = findChild(rPr, tag);
  if (!el) return false;
  const val = getAttrs(el)["@_w:val"];
  if (val === undefined) return true;
  const lowered = val.toLowerCase();
  return lowered !== "0" && lowered !== "false" && lowered !== "off";
}

function underlineProp(rPr: FxpNode | null): boolean {
  const el = findChild(rPr, "w:u");
  if (!el) return false;
  const val = getAttrs(el)["@_w:val"];
  return val !== undefined && val !== "none";
}

function fontName(rPr: FxpNode | null): string | null {
  const el = findChild(rPr, "w:rFonts");
  if (!el) return null;
  const attrs = getAttrs(el);
  return (
    attrs["@_w:ascii"] ??
    attrs["@_w:hAnsi"] ??
    attrs["@_w:cs"] ??
    attrs["@_w:eastAsia"] ??
    null
  );
}

function fontSizePt(rPr: FxpNode | null): number | null {
  const el = findChild(rPr, "w:sz");
  if (!el) return null;
  const val = getAttrs(el)["@_w:val"];
  if (val === undefined) return null;
  const halfPoints = Number.parseInt(val, 10);
  if (!Number.isFinite(halfPoints)) return null;
  return halfPoints / 2;
}

function runText(runNode: FxpNode): string {
  let out = "";
  for (const child of elementChildren(runNode)) {
    if (elementTag(child) === "w:t") out += wtText(child);
  }
  return out;
}

function buildRun(runNode: FxpNode, hyperlinkRelId: string | null): ResumeRun {
  const rPr = findChild(runNode, "w:rPr");
  return {
    text: runText(runNode),
    bold: toggleProp(rPr, "w:b"),
    italic: toggleProp(rPr, "w:i"),
    underline: underlineProp(rPr),
    font: fontName(rPr),
    sizePt: fontSizePt(rPr),
    hyperlinkRelId,
  };
}

function collectRuns(nodes: FxpNode[], hyperlinkRelId: string | null, out: ResumeRun[]): void {
  for (const node of nodes) {
    const tag = elementTag(node);
    if (!tag || tag === "w:pPr") continue;
    if (tag === "w:r") {
      const run = buildRun(node, hyperlinkRelId);
      // Skip runs that contribute no text (e.g. a lone tab/break/drawing run)
      // so run-text concatenation equals the paragraph plaintext.
      if (run.text.length > 0) out.push(run);
      continue;
    }
    if (tag === "w:hyperlink") {
      const relId = getAttrs(node)["@_r:id"] ?? null;
      collectRuns(elementChildren(node), relId, out);
      continue;
    }
    if (RUN_CONTAINER_TAGS.has(tag)) {
      collectRuns(elementChildren(node), hyperlinkRelId, out);
    }
  }
}

function parseParagraphBlock(paragraphXml: string, order: number): ResumeBlock {
  const parsed = parseFragment(paragraphXml);
  const pNode = parsed.find((node) => elementTag(node) === "w:p");
  if (!pNode) return { order, text: "", runs: [] };
  const runs: ResumeRun[] = [];
  collectRuns(elementChildren(pNode), null, runs);
  return { order, text: runs.map((run) => run.text).join(""), runs };
}

/** Build a block graph from an already-decoded `word/document.xml` string. */
export function blockGraphFromDocumentXml(documentXml: string): ResumeBlockGraph {
  const blocks = listParagraphXml(documentXml).map((xml, index) =>
    parseParagraphBlock(xml, index)
  );
  return { blocks };
}

/** Load a DOCX and project `word/document.xml` into a block graph. */
export async function readResumeBlockGraph(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<ResumeBlockGraph> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  return blockGraphFromDocumentXml(documentXml);
}

/**
 * A block paired with its stable Phase 3B identity. `blockId` / `bookmarkName`
 * are null when the paragraph has no `pa_` bookmark yet (pre-injection).
 */
export type IdentifiedResumeBlock = ResumeBlock & {
  blockId: string | null;
  bookmarkName: string | null;
};

export type IdentifiedResumeBlockGraph = {
  blocks: IdentifiedResumeBlock[];
};

/** Build a block graph and attach each block's `pa_` bookmark identity. */
export function identifiedBlockGraphFromDocumentXml(
  documentXml: string
): IdentifiedResumeBlockGraph {
  const graph = blockGraphFromDocumentXml(documentXml);
  const names = readParagraphBookmarkNames(documentXml);
  const blocks = graph.blocks.map((block) => {
    const name = names[block.order] ?? null;
    return {
      ...block,
      bookmarkName: name,
      blockId: name === null ? null : name.slice(RESUME_BOOKMARK_PREFIX.length),
    };
  });
  return { blocks };
}

/** Load a DOCX and project it into an identity-carrying block graph. */
export async function readIdentifiedResumeBlockGraph(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<IdentifiedResumeBlockGraph> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  return identifiedBlockGraphFromDocumentXml(documentXml);
}
