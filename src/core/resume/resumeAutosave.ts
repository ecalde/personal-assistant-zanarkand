/**
 * Working-copy autosave helpers (Phase 4F).
 *
 * Architecture §36: after the fail-closed OOXML patch, upload working bytes
 * and update the version hash. Never write the immutable original, never call
 * `replaceRemotePayload`, and never upload a buffer that was not produced by a
 * successful patch (last-good bytes only).
 *
 * Mention index is refreshed from the flushed graph (§23 step 5). The frozen
 * import ledger is not rebuilt here.
 */

import { MapperError } from "../dbMappers";
import { assertResumeOwnerStoragePath, parseExtractedStructure } from "./resumeDbMappers";
import { buildDocumentMentionIndex, type FactSourceBlock } from "./resumeFacts";
import type { ResumeExtractedStructure, ResumeStructureGraph } from "./resumeModel";

/** Extra pause after a successful in-memory patch before the cloud upload. */
export const RESUME_AUTOSAVE_DEBOUNCE_MS = 800;

export type WorkingCopyUploadDecision = "upload" | "skip_unchanged" | "skip_missing";

export function resumeBytesEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Upload only when last-good patched bytes exist and differ from what we
 * already stored. A `PatchError` leaves last-good unchanged, so this skips.
 */
export function decideWorkingCopyUpload(args: {
  lastGoodBytes: Uint8Array | null;
  lastUploadedBytes: Uint8Array | null;
}): WorkingCopyUploadDecision {
  if (!args.lastGoodBytes) return "skip_missing";
  if (resumeBytesEqual(args.lastGoodBytes, args.lastUploadedBytes)) return "skip_unchanged";
  return "upload";
}

/**
 * Working-copy object only (`…/versions/{versionId}.docx`). The original
 * (`…/original/{sha256}.docx`) is immutable (RES-PER-004).
 */
export function assertWorkingCopyUploadPath(path: string, userId: string): void {
  assertResumeOwnerStoragePath(path, userId, "workingStoragePath");
  const folder = path.split("/")[2];
  if (folder !== "versions") {
    throw new MapperError(
      "Working copy upload must target versions/, never original/",
      "workingStoragePath"
    );
  }
}

export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  const hashBytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of hashBytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Persist the flushed graph and re-scan mentions. Keeps blockMap / ATS
 * warnings from the previous snapshot. Does not accept or emit ledger fields.
 */
export function extractedStructureAfterWorkingEdit(
  previous: ResumeExtractedStructure,
  graph: ResumeStructureGraph
): ResumeExtractedStructure {
  const sourceBlocks: FactSourceBlock[] = [];
  for (const block of graph.blocks) {
    if (!block.blockId) continue;
    sourceBlocks.push({ blockId: block.blockId, text: block.text.normalize("NFC") });
  }

  const next: ResumeExtractedStructure = {
    mentionIndex: buildDocumentMentionIndex(sourceBlocks),
    graph,
  };
  if (previous.blockMap) next.blockMap = previous.blockMap;
  if (previous.atsWarnings) next.atsWarnings = previous.atsWarnings;
  return parseExtractedStructure(next);
}

/** Version-row patch for an autosave. Original path and import ledger stay out. */
export function workingVersionRowPatch(args: {
  workingSha256: string;
  extractedStructure: ResumeExtractedStructure;
}): { sha256: string; extracted_structure: ResumeExtractedStructure } {
  return {
    sha256: args.workingSha256,
    extracted_structure: args.extractedStructure,
  };
}
