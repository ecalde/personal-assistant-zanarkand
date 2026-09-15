/**
 * Stable block identity via bookmarks (Phase 3B).
 *
 * Injects `pa_<uuid>` bookmarks around each paragraph in the **working** copy
 * only (architecture §19.2). The immutable original bytes must never be passed
 * through this writer — bookmarks belong to the working lineage.
 *
 * Design notes:
 * - Each `w:p` gets one `w:bookmarkStart`/`w:bookmarkEnd` pair. The start is
 *   placed immediately after `w:pPr` (schema requires `pPr` first) and the end
 *   is appended as the paragraph's last child, so the mark spans the whole
 *   paragraph and stays visually invisible.
 * - Injection is **idempotent / reuse-first**: a paragraph that already has a
 *   `pa_` bookmark keeps it (and its bytes are left untouched). Re-running the
 *   injector therefore yields the same ids — the stability guarantee 3B needs.
 * - Only paragraphs that gain a new bookmark are re-serialized; everything
 *   outside a paragraph (declaration, root, `sectPr`, other parts) is spliced
 *   back byte-for-byte, keeping the change minimal for Word fidelity.
 *
 * Text is never mutated here (that is the fail-closed 0D patcher). The fact
 * ledger is Phase 3C.
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
  paragraphRanges,
  parseFragment,
  setElementChildren,
  type FxpNode,
} from "./resumeOoxmlRead";
import type { ResumeBlockMapEntry } from "./resumeModel";

/** Prefix for every bookmark this feature owns. */
export const RESUME_BOOKMARK_PREFIX = "pa_";

export class ResumeOoxmlWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeOoxmlWriteError";
  }
}

/** Secondary block map entry (architecture §19.2); persisted shape lives in the model. */
export type { ResumeBlockMapEntry };

export type ResumeBookmarkDocumentXml = {
  documentXml: string;
  blockMap: ResumeBlockMapEntry[];
  /** Bookmarks newly inserted in this pass. */
  addedCount: number;
  /** Existing `pa_` bookmarks reused (proves idempotency). */
  reusedCount: number;
};

export type ResumeBookmarkInjection = {
  bytes: Uint8Array;
  blockMap: ResumeBlockMapEntry[];
  addedCount: number;
  reusedCount: number;
};

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

function defaultBookmarkName(): string {
  return `${RESUME_BOOKMARK_PREFIX}${crypto.randomUUID()}`;
}

function parseParagraphFragment(xml: string): FxpNode[] {
  try {
    return parseFragment(xml);
  } catch {
    throw new ResumeOoxmlWriteError("Could not parse paragraph XML");
  }
}

/** Highest `w:id` used by any existing bookmark, or -1 if none. */
function maxBookmarkId(documentXml: string): number {
  let max = -1;
  const re = /<w:bookmark(?:Start|End)\b[^>]*\bw:id="(-?\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(documentXml)) !== null) {
    const id = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max;
}

/** Direct-child `pa_` bookmark name for a paragraph, or null. */
function findParagraphBookmarkName(pNode: FxpNode): string | null {
  for (const child of elementChildren(pNode)) {
    if (elementTag(child) !== "w:bookmarkStart") continue;
    const name = getAttrs(child)["@_w:name"];
    if (name && name.startsWith(RESUME_BOOKMARK_PREFIX)) return name;
  }
  return null;
}

function bookmarkStartNode(id: number, name: string): FxpNode {
  return {
    "w:bookmarkStart": [] as FxpNode[],
    ":@": { "@_w:id": String(id), "@_w:name": name },
  };
}

function bookmarkEndNode(id: number): FxpNode {
  return { "w:bookmarkEnd": [] as FxpNode[], ":@": { "@_w:id": String(id) } };
}

function insertParagraphBookmark(pNode: FxpNode, id: number, name: string): void {
  const children = elementChildren(pNode);
  const pPrIndex = children.findIndex((child) => elementTag(child) === "w:pPr");
  const next = [...children];
  // Start must follow pPr (schema order). No pPr → insert at the front.
  next.splice(pPrIndex + 1, 0, bookmarkStartNode(id, name));
  next.push(bookmarkEndNode(id));
  setElementChildren(pNode, next);
}

/**
 * Pure core: wrap every paragraph of `word/document.xml` in a `pa_` bookmark,
 * reusing any that already exist. Paragraphs outside the reused set are the
 * only bytes re-serialized. `newBookmarkName` is injectable for deterministic
 * tests.
 */
export function injectBookmarksIntoDocumentXml(
  documentXml: string,
  newBookmarkName: () => string = defaultBookmarkName
): ResumeBookmarkDocumentXml {
  const ranges = paragraphRanges(documentXml);
  let nextId = maxBookmarkId(documentXml) + 1;

  const blockMap: ResumeBlockMapEntry[] = [];
  let addedCount = 0;
  let reusedCount = 0;
  let out = "";
  let cursor = 0;

  for (let order = 0; order < ranges.length; order += 1) {
    const range = ranges[order];
    if (!range) continue;
    const paraXml = documentXml.slice(range.start, range.end);
    const parsed = parseParagraphFragment(paraXml);
    const pNode = parsed.find((node) => elementTag(node) === "w:p");
    if (!pNode) {
      throw new ResumeOoxmlWriteError("Paragraph element not found while injecting bookmarks");
    }

    const existing = findParagraphBookmarkName(pNode);
    let bookmarkName: string;
    let replacement: string;
    if (existing !== null) {
      bookmarkName = existing;
      replacement = paraXml;
      reusedCount += 1;
    } else {
      const id = nextId;
      nextId += 1;
      bookmarkName = newBookmarkName();
      if (!bookmarkName.startsWith(RESUME_BOOKMARK_PREFIX)) {
        throw new ResumeOoxmlWriteError("Bookmark name must use the pa_ prefix");
      }
      insertParagraphBookmark(pNode, id, bookmarkName);
      const rebuilt = xmlBuilder.build(parsed);
      if (typeof rebuilt !== "string" || !rebuilt.includes("<w:p")) {
        throw new ResumeOoxmlWriteError("Failed to serialize bookmarked paragraph");
      }
      replacement = rebuilt;
      addedCount += 1;
    }

    blockMap.push({
      blockId: bookmarkName.slice(RESUME_BOOKMARK_PREFIX.length),
      bookmarkName,
      order,
    });
    out += documentXml.slice(cursor, range.start) + replacement;
    cursor = range.end;
  }

  out += documentXml.slice(cursor);
  return { documentXml: out, blockMap, addedCount, reusedCount };
}

/** Per-paragraph `pa_` bookmark name in document order (null when absent). */
export function readParagraphBookmarkNames(documentXml: string): Array<string | null> {
  return paragraphRanges(documentXml).map((range) => {
    const parsed = parseParagraphFragment(documentXml.slice(range.start, range.end));
    const pNode = parsed.find((node) => elementTag(node) === "w:p");
    return pNode ? findParagraphBookmarkName(pNode) : null;
  });
}

function replaceDocumentXml(loaded: LoadedDocx, documentXml: string): LoadedDocx {
  const data = new TextEncoder().encode(documentXml);
  return {
    entries: loaded.entries.map((entry) =>
      entry.name === DOCUMENT_XML_PATH && !entry.dir ? { ...entry, data } : entry
    ),
  };
}

/**
 * Inject stable `pa_` bookmarks into working DOCX bytes. Returns new bytes plus
 * the block map. The input buffer is never mutated. Never call on the immutable
 * original stored bytes.
 */
export async function injectResumeBookmarks(
  docxBytes: Uint8Array | ArrayBuffer,
  newBookmarkName: () => string = defaultBookmarkName
): Promise<ResumeBookmarkInjection> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  const result = injectBookmarksIntoDocumentXml(documentXml, newBookmarkName);
  const bytes = await writeDocxBuffer(replaceDocumentXml(loaded, result.documentXml));
  return {
    bytes,
    blockMap: result.blockMap,
    addedCount: result.addedCount,
    reusedCount: result.reusedCount,
  };
}

/** Read the `pa_` block map back from DOCX bytes (paragraphs without one are skipped). */
export async function readResumeBlockMap(
  docxBytes: Uint8Array | ArrayBuffer
): Promise<ResumeBlockMapEntry[]> {
  const loaded = await loadDocxBuffer(docxBytes);
  const documentXml = new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH));
  const map: ResumeBlockMapEntry[] = [];
  readParagraphBookmarkNames(documentXml).forEach((name, order) => {
    if (name === null) return;
    map.push({ blockId: name.slice(RESUME_BOOKMARK_PREFIX.length), bookmarkName: name, order });
  });
  return map;
}
