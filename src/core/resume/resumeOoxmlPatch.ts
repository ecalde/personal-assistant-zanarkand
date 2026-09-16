/**
 * Fail-closed run-aware OOXML plaintext patch (Phase 0D).
 *
 * Changes the minimum necessary `w:t` nodes. Mixed bold/italic/hyperlink
 * regions are never flattened into the first run's `rPr`.
 */

import { XMLBuilder } from "fast-xml-parser";
import {
  DOCUMENT_XML_PATH,
  getDocxPart,
  loadDocxBuffer,
  writeDocxBuffer,
  type LoadedDocx,
} from "./resumeZip";
import {
  elementChildren,
  elementTag,
  getAttrs,
  paragraphPlaintextFromXml,
  paragraphRanges,
  parseFragment,
  setElementChildren,
  wtText,
  type FxpNode,
} from "./resumeOoxmlRead";
import { readParagraphBookmarkNames } from "./resumeOoxmlWrite";

export { listParagraphPlaintexts, listParagraphXml } from "./resumeOoxmlRead";

/**
 * Locate a target `w:p`. Wave 0 used exact plaintext; the product editor uses
 * the Phase 3B `pa_` bookmark (architecture §18.4 / §19). Provide exactly one.
 */
export type ParagraphLocator =
  | { exactPlaintext: string; bookmarkName?: never }
  | { bookmarkName: string; exactPlaintext?: never };

export type PatchErrorCode =
  | "not_found"
  | "not_unique"
  | "tracked_changes"
  | "field"
  | "mixed_rpr"
  | "hyperlink"
  | "bookmark"
  | "unknown_child"
  | "non_text_leaf"
  | "empty_paragraph";

export class PatchError extends Error {
  readonly code: PatchErrorCode;

  constructor(message: string, code: PatchErrorCode) {
    super(message);
    this.name = "PatchError";
    this.code = code;
  }
}

type TextLeaf = {
  kind: "text";
  text: string;
  wtNode: FxpNode;
  runNode: FxpNode;
  hyperlinkNode: FxpNode | null;
  rPrKey: string;
  charStart: number;
  charEnd: number;
};

type NonTextLeaf = {
  kind: "nontext";
  tag: string;
  gapOffset: number;
};

type Leaf = TextLeaf | NonTextLeaf;

const KNOWN_PARAGRAPH_TAGS = new Set([
  "w:pPr",
  "w:r",
  "w:hyperlink",
  "w:bookmarkStart",
  "w:bookmarkEnd",
  "w:proofErr",
  "w:commentRangeStart",
  "w:commentRangeEnd",
  "w:commentReference",
  "w:sdt",
  "w:ins",
  "w:del",
  "w:customXml",
  "w:smartTag",
  "w:fldSimple",
]);

const KNOWN_RUN_TAGS = new Set([
  "w:rPr",
  "w:t",
  "w:tab",
  "w:br",
  "w:cr",
  "w:lastRenderedPageBreak",
  "w:drawing",
  "w:pict",
  "w:object",
  "w:fldChar",
  "w:instrText",
  "w:sym",
  "w:noBreakHyphen",
  "w:softHyphen",
  "w:ptab",
  "w:footnoteReference",
  "w:endnoteReference",
  "w:separator",
  "w:continuationSeparator",
  "w:commentReference",
  "w:delText",
  "w:yearLong",
  "w:annotationRef",
]);

const STRUCTURAL_NON_TEXT = new Set([
  "w:tab",
  "w:br",
  "w:cr",
  "w:drawing",
  "w:pict",
  "w:object",
  "w:sym",
  "w:ptab",
]);

const FIELD_TAGS = new Set(["w:fldChar", "w:instrText"]);

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: false,
  suppressEmptyNode: true,
  suppressBooleanAttributes: true,
  processEntities: true,
  commentPropName: "#comment",
  cdataPropName: "#cdata",
});

function parseParagraphFragment(xml: string): FxpNode[] {
  try {
    return parseFragment(xml);
  } catch {
    throw new PatchError("Could not parse paragraph XML", "unknown_child");
  }
}

function setWtText(wtNode: FxpNode, text: string): void {
  wtNode["w:t"] = text.length === 0 ? [] : [{ "#text": text }];
  const needsPreserve =
    text.startsWith(" ") ||
    text.endsWith(" ") ||
    text.includes("  ") ||
    text.includes("\n") ||
    text.includes("\t");
  if (needsPreserve) {
    wtNode[":@"] = { ...getAttrs(wtNode), "@_xml:space": "preserve" };
  }
}

function runRPrKey(runNode: FxpNode, hyperlinkRid: string | null): string {
  const rPr = elementChildren(runNode).find((child) => elementTag(child) === "w:rPr") ?? null;
  return JSON.stringify({ rPr, hyperlinkRid });
}

function walkParagraph(pNode: FxpNode): {
  plain: string;
  leaves: Leaf[];
  hasTrackedChanges: boolean;
  hasField: boolean;
} {
  const leaves: Leaf[] = [];
  let plain = "";
  let hasTrackedChanges = false;
  let hasField = false;

  const visitNodes = (
    nodes: FxpNode[],
    hyperlinkNode: FxpNode | null,
    hyperlinkRid: string | null
  ): void => {
    for (const node of nodes) {
      if (typeof node["#text"] === "string" && elementTag(node) === undefined) continue;
      const tag = elementTag(node);
      if (!tag) continue;
      if (tag === "w:ins" || tag === "w:del") {
        hasTrackedChanges = true;
        visitNodes(elementChildren(node), hyperlinkNode, hyperlinkRid);
        continue;
      }
      if (tag === "w:pPr") continue;
      if (tag === "w:hyperlink") {
        const rid = getAttrs(node)["@_r:id"] ?? null;
        visitNodes(elementChildren(node), node, rid);
        continue;
      }
      if (tag === "w:sdt" || tag === "w:sdtContent" || tag === "w:sdtPr") {
        visitNodes(elementChildren(node), hyperlinkNode, hyperlinkRid);
        continue;
      }
      if (tag === "w:customXml" || tag === "w:smartTag") {
        visitNodes(elementChildren(node), hyperlinkNode, hyperlinkRid);
        continue;
      }
      if (tag === "w:fldSimple") {
        hasField = true;
        visitNodes(elementChildren(node), hyperlinkNode, hyperlinkRid);
        continue;
      }
      if (tag === "w:r") {
        visitRun(node, hyperlinkNode, hyperlinkRid);
        continue;
      }
      if (!KNOWN_PARAGRAPH_TAGS.has(tag)) {
        leaves.push({ kind: "nontext", tag, gapOffset: plain.length });
        continue;
      }
      if (
        tag === "w:bookmarkStart" ||
        tag === "w:bookmarkEnd" ||
        tag === "w:proofErr" ||
        tag === "w:commentRangeStart" ||
        tag === "w:commentRangeEnd" ||
        tag === "w:commentReference"
      ) {
        leaves.push({ kind: "nontext", tag, gapOffset: plain.length });
        continue;
      }
    }
  };

  const visitRun = (
    runNode: FxpNode,
    hyperlinkNode: FxpNode | null,
    hyperlinkRid: string | null
  ): void => {
    const rPrKey = runRPrKey(runNode, hyperlinkRid);
    for (const child of elementChildren(runNode)) {
      const tag = elementTag(child);
      if (!tag || tag === "w:rPr") continue;
      if (tag === "w:t") {
        const text = wtText(child);
        const charStart = plain.length;
        plain += text;
        leaves.push({
          kind: "text",
          text,
          wtNode: child,
          runNode,
          hyperlinkNode,
          rPrKey,
          charStart,
          charEnd: plain.length,
        });
        continue;
      }
      if (FIELD_TAGS.has(tag)) {
        hasField = true;
        leaves.push({ kind: "nontext", tag, gapOffset: plain.length });
        continue;
      }
      if (!KNOWN_RUN_TAGS.has(tag)) {
        leaves.push({ kind: "nontext", tag, gapOffset: plain.length });
        continue;
      }
      leaves.push({ kind: "nontext", tag, gapOffset: plain.length });
    }
  };

  visitNodes(elementChildren(pNode), null, null);
  return { plain, leaves, hasTrackedChanges, hasField };
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffixLength(a: string, b: string, prefixLen: number): number {
  const limit = Math.min(a.length - prefixLen, b.length - prefixLen);
  let i = 0;
  while (i < limit && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

function textLeaves(leaves: Leaf[]): TextLeaf[] {
  return leaves.filter((leaf): leaf is TextLeaf => leaf.kind === "text");
}

function overlappingTextLeaves(leaves: TextLeaf[], start: number, end: number): TextLeaf[] {
  if (start >= end) return [];
  return leaves.filter((leaf) => leaf.charStart < end && leaf.charEnd > start);
}

function failClosedForSpan(leaves: Leaf[], changeStart: number, changeEnd: number): void {
  for (const leaf of leaves) {
    if (leaf.kind !== "nontext") continue;
    const interior = leaf.gapOffset > changeStart && leaf.gapOffset < changeEnd;
    if (!interior) continue;
    if (FIELD_TAGS.has(leaf.tag)) {
      throw new PatchError("Edit intersects a field", "field");
    }
    if (STRUCTURAL_NON_TEXT.has(leaf.tag)) {
      throw new PatchError("Edit intersects a tab, break, or drawing", "non_text_leaf");
    }
    if (leaf.tag === "w:bookmarkStart" || leaf.tag === "w:bookmarkEnd") {
      throw new PatchError("Edit would disturb bookmarks in the changed span", "bookmark");
    }
    if (!KNOWN_PARAGRAPH_TAGS.has(leaf.tag) && !KNOWN_RUN_TAGS.has(leaf.tag)) {
      throw new PatchError("Unknown child type in the changed span", "unknown_child");
    }
  }
}

function runHasKeepableChildren(runNode: FxpNode): boolean {
  return elementChildren(runNode).some((child) => {
    const tag = elementTag(child);
    if (!tag || tag === "w:rPr") return false;
    if (tag === "w:t") return wtText(child).length > 0;
    return true;
  });
}

function pruneEmptyTextNodes(runNode: FxpNode): void {
  const kept = elementChildren(runNode).filter((child) => {
    if (elementTag(child) !== "w:t") return true;
    return wtText(child).length > 0;
  });
  setElementChildren(runNode, kept);
}

function pruneEmptyRuns(pNode: FxpNode): void {
  const body = elementChildren(pNode);
  const nextBody: FxpNode[] = [];
  for (const node of body) {
    const tag = elementTag(node);
    if (tag === "w:r") {
      pruneEmptyTextNodes(node);
      if (runHasKeepableChildren(node)) nextBody.push(node);
      continue;
    }
    if (tag === "w:hyperlink") {
      const inner = elementChildren(node);
      const nextInner: FxpNode[] = [];
      for (const child of inner) {
        if (elementTag(child) === "w:r") {
          pruneEmptyTextNodes(child);
          if (runHasKeepableChildren(child)) nextInner.push(child);
          continue;
        }
        nextInner.push(child);
      }
      if (!nextInner.some((child) => elementTag(child) === "w:r")) {
        throw new PatchError("Edit would drop a hyperlink", "hyperlink");
      }
      setElementChildren(node, nextInner);
      nextBody.push(node);
      continue;
    }
    nextBody.push(node);
  }
  setElementChildren(pNode, nextBody);
}

function applySameRunReplace(leaf: TextLeaf, localStart: number, localEnd: number, middle: string): void {
  setWtText(leaf.wtNode, leaf.text.slice(0, localStart) + middle + leaf.text.slice(localEnd));
}

function applySameRprMulti(
  overlapping: TextLeaf[],
  changeStart: number,
  changeEnd: number,
  newMiddle: string
): void {
  const first = overlapping[0];
  const last = overlapping[overlapping.length - 1];
  if (!first || !last) return;
  const firstLocal = changeStart - first.charStart;
  const lastLocal = changeEnd - last.charStart;
  setWtText(first.wtNode, first.text.slice(0, firstLocal) + newMiddle);
  for (let i = 1; i < overlapping.length - 1; i += 1) {
    const leaf = overlapping[i];
    if (leaf) setWtText(leaf.wtNode, "");
  }
  setWtText(last.wtNode, last.text.slice(lastLocal));
}

function applyDeleteAcrossLeaves(overlapping: TextLeaf[], changeStart: number, changeEnd: number): void {
  for (const leaf of overlapping) {
    const localStart = Math.max(0, changeStart - leaf.charStart);
    const localEnd = Math.min(leaf.text.length, changeEnd - leaf.charStart);
    setWtText(leaf.wtNode, leaf.text.slice(0, localStart) + leaf.text.slice(localEnd));
  }
}

function insertionLeaf(leaves: TextLeaf[], caret: number): TextLeaf | undefined {
  if (leaves.length === 0) return undefined;
  if (caret <= 0) return leaves[0];
  const left = leaves.find((leaf) => leaf.charStart <= caret - 1 && caret - 1 < leaf.charEnd);
  return left ?? leaves[0];
}

function patchParsedParagraph(pNode: FxpNode, newPlaintext: string): void {
  const walked = walkParagraph(pNode);
  const originalPlain = walked.plain;
  if (newPlaintext === originalPlain) return;

  if (walked.hasTrackedChanges) {
    throw new PatchError("Paragraph contains tracked changes", "tracked_changes");
  }

  const texts = textLeaves(walked.leaves);
  if (texts.length === 0) {
    throw new PatchError("Cannot insert text into an empty paragraph safely", "empty_paragraph");
  }

  const prefixLen = commonPrefixLength(originalPlain, newPlaintext);
  const suffixLen = commonSuffixLength(originalPlain, newPlaintext, prefixLen);
  const changeStart = prefixLen;
  const changeEnd = originalPlain.length - suffixLen;
  const newMiddle = newPlaintext.slice(prefixLen, newPlaintext.length - suffixLen);

  if (walked.hasField) {
    for (const leaf of walked.leaves) {
      if (leaf.kind !== "nontext" || !FIELD_TAGS.has(leaf.tag)) continue;
      if (leaf.gapOffset >= changeStart && leaf.gapOffset <= changeEnd) {
        throw new PatchError("Edit intersects a field", "field");
      }
    }
  }

  failClosedForSpan(walked.leaves, changeStart, changeEnd);

  if (changeStart === changeEnd) {
    const leaf = insertionLeaf(texts, changeStart);
    if (!leaf) {
      throw new PatchError("Cannot insert text into an empty paragraph safely", "empty_paragraph");
    }
    const local = changeStart - leaf.charStart;
    applySameRunReplace(leaf, local, local, newMiddle);
    return;
  }

  const overlapping = overlappingTextLeaves(texts, changeStart, changeEnd);
  if (overlapping.length === 0) {
    throw new PatchError("Could not map the text change onto existing runs", "unknown_child");
  }

  const rPrKeys = new Set(overlapping.map((leaf) => leaf.rPrKey));
  if (overlapping.length === 1) {
    const leaf = overlapping[0];
    if (!leaf) {
      throw new PatchError("Could not map the text change onto existing runs", "unknown_child");
    }
    applySameRunReplace(leaf, changeStart - leaf.charStart, changeEnd - leaf.charStart, newMiddle);
    pruneEmptyRuns(pNode);
    return;
  }

  if (rPrKeys.size === 1) {
    applySameRprMulti(overlapping, changeStart, changeEnd, newMiddle);
    pruneEmptyRuns(pNode);
    return;
  }

  // Distinct rPr in the changed original range: deletions stay in their runs;
  // any insertion would merge mixed formatting into one undifferentiated span.
  if (newMiddle.length > 0) {
    throw new PatchError(
      "This paragraph's formatting cannot be updated safely",
      "mixed_rpr"
    );
  }
  applyDeleteAcrossLeaves(overlapping, changeStart, changeEnd);
  pruneEmptyRuns(pNode);
}

function replaceDocumentXml(loaded: LoadedDocx, documentXml: string): LoadedDocx {
  const data = new TextEncoder().encode(documentXml);
  return {
    entries: loaded.entries.map((entry) =>
      entry.name === DOCUMENT_XML_PATH && !entry.dir ? { ...entry, data } : entry
    ),
  };
}

function locateParagraphIndexes(
  documentXml: string,
  ranges: ReturnType<typeof paragraphRanges>,
  locator: ParagraphLocator
): number[] {
  const matches: number[] = [];

  if ("bookmarkName" in locator && locator.bookmarkName !== undefined) {
    const bookmarkName = locator.bookmarkName;
    if (bookmarkName.length === 0) return matches;
    const names = readParagraphBookmarkNames(documentXml);
    for (let i = 0; i < ranges.length; i += 1) {
      if (names[i] === bookmarkName) matches.push(i);
    }
    return matches;
  }

  const exactPlaintext = locator.exactPlaintext;
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    if (!range) continue;
    const xml = documentXml.slice(range.start, range.end);
    if (paragraphPlaintextFromXml(xml) === exactPlaintext) {
      matches.push(i);
    }
  }
  return matches;
}

/**
 * Replace one paragraph’s concatenated `w:t` plaintext. Locator is exact
 * plaintext (Wave 0) or a `pa_` bookmark name (product editor, Phase 4D).
 * Throws `PatchError` without writing a zip when the change cannot preserve
 * mixed-run formatting. This is the only text-patch algorithm — do not add a
 * second flatten-on-save path.
 */
export async function patchParagraphPlaintext(
  docxBytes: Uint8Array | ArrayBuffer,
  locator: ParagraphLocator,
  newPlaintext: string
): Promise<Uint8Array> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  const ranges = paragraphRanges(documentXml);
  const matches = locateParagraphIndexes(documentXml, ranges, locator);

  if (matches.length === 0) {
    throw new PatchError("Target paragraph not found", "not_found");
  }
  if (matches.length > 1) {
    throw new PatchError("Target paragraph is not unique", "not_unique");
  }

  const matchIndex = matches[0];
  const range = matchIndex !== undefined ? ranges[matchIndex] : undefined;
  if (!range) {
    throw new PatchError("Target paragraph not found", "not_found");
  }

  const originalParaXml = documentXml.slice(range.start, range.end);
  const currentPlain = paragraphPlaintextFromXml(originalParaXml);
  if (newPlaintext === currentPlain) {
    return writeDocxBuffer(loaded);
  }

  const parsed = parseParagraphFragment(originalParaXml);
  const pNode = parsed.find((node) => elementTag(node) === "w:p");
  if (!pNode) {
    throw new PatchError("Target paragraph not found", "not_found");
  }

  patchParsedParagraph(pNode, newPlaintext);
  const rebuilt = xmlBuilder.build(parsed);
  if (typeof rebuilt !== "string" || !rebuilt.includes("<w:p")) {
    throw new PatchError("Failed to serialize patched paragraph", "unknown_child");
  }

  const nextXml = documentXml.slice(0, range.start) + rebuilt + documentXml.slice(range.end);
  return writeDocxBuffer(replaceDocumentXml(loaded, nextXml));
}
