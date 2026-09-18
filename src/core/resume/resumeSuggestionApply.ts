/**
 * Apply an accepted suggestion to working OOXML (Phase 7C) with stale-hash
 * fail-closed (Phase 7D).
 *
 * Uses the Wave 0 `patchParagraphPlaintext` via the 4D bookmark flush. Locator
 * is `pa_` bookmark from the block graph — never a document-wide plaintext
 * search. Hash mismatch vs `originalTextHash` is stale: no patch. `PatchError`
 * becomes `blocked_formatting`; last-good bytes stay unflattened. Autosave of
 * successful bytes is the editor's job.
 *
 * Do not log resume or JD text.
 */

import { sha256HexOfBytes } from "./resumeAutosave";
import { MIXED_RUN_FAIL_MESSAGE } from "./resumeBlockEdit";
import type { ResumeStructureBlock } from "./resumeModel";
import { flushBlockPlaintextByBookmark } from "./resumeEditorFlush";

export const RESUME_APPLY_NOT_READY_MESSAGE =
  "The Word document is still loading. Try again in a moment, or reopen the preview.";

export const RESUME_SUGGESTION_STALE_MESSAGE =
  "This paragraph changed after the suggestion was generated. Accept cannot apply it. Regenerate using the current wording.";

export type ApplyAcceptedSuggestionToOoxmlResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "blocked_formatting" | "stale"; message: string };

export type ApplyAcceptedSuggestionToDocumentInput = {
  sourceBlockId: string;
  proposedText: string;
  originalTextHash: string;
};

export type ApplyAcceptedSuggestionToDocumentResult =
  | { ok: true }
  | { ok: false; code: "blocked_formatting" | "not_ready" | "stale"; message: string };

/**
 * True only when `currentPlaintext` hashes to the suggestion's stored
 * `originalTextHash`. Mismatch means the paragraph moved; do not patch.
 */
export async function originalTextHashMatchesCurrent(args: {
  originalTextHash: string;
  currentPlaintext: string;
}): Promise<boolean> {
  const stored = args.originalTextHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(stored)) return false;
  const currentHash = await sha256HexOfBytes(new TextEncoder().encode(args.currentPlaintext));
  return currentHash === stored;
}

export function currentPlaintextForSuggestionBlock(
  blocks: readonly Pick<ResumeStructureBlock, "blockId" | "text">[],
  sourceBlockId: string
): string | null {
  const id = sourceBlockId.trim();
  if (!id) return null;
  const block = blocks.find((item) => item.blockId === id);
  return block ? block.text : null;
}

/**
 * Resolve the working-copy bookmark for a suggestion's source block. Returns
 * null when the graph has no `pa_` bookmark for that id (do not fall back to
 * searching paragraph text).
 */
export function bookmarkNameForSuggestionBlock(
  blocks: readonly Pick<ResumeStructureBlock, "blockId" | "bookmarkName">[],
  sourceBlockId: string
): string | null {
  const id = sourceBlockId.trim();
  if (!id) return null;
  const block = blocks.find((item) => item.blockId === id);
  const name = block?.bookmarkName ?? null;
  if (!name || !name.startsWith("pa_")) return null;
  return name;
}

/**
 * Patch one bookmarked paragraph to the accepted wording. Same fail-closed
 * 0D algorithm as editor flush. Input bytes are never mutated. A hash
 * mismatch is stale: no patch, original bytes unchanged (RES-SUG-002).
 */
export async function applyAcceptedSuggestionToOoxml(input: {
  docxBytes: Uint8Array;
  bookmarkName: string;
  proposedText: string;
  originalTextHash: string;
  currentPlaintext: string;
}): Promise<ApplyAcceptedSuggestionToOoxmlResult> {
  const fresh = await originalTextHashMatchesCurrent({
    originalTextHash: input.originalTextHash,
    currentPlaintext: input.currentPlaintext,
  });
  if (!fresh) {
    return {
      ok: false,
      code: "stale",
      message: RESUME_SUGGESTION_STALE_MESSAGE,
    };
  }

  const result = await flushBlockPlaintextByBookmark(
    input.docxBytes,
    input.bookmarkName,
    input.proposedText
  );
  if (!result.ok) {
    return {
      ok: false,
      code: "blocked_formatting",
      message: result.message || MIXED_RUN_FAIL_MESSAGE,
    };
  }
  return { ok: true, bytes: result.bytes };
}
