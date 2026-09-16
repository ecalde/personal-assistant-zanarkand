/**
 * Editor → OOXML flush (Phase 4D).
 *
 * Wraps the Wave 0 `patchParagraphPlaintext` so the React pane can apply one
 * block's plaintext through the **same** fail-closed algorithm (architecture
 * §18.4). Bookmark locator only — product path. Storage upload of last-good
 * bytes is Phase 4F. Download Word (4G) flushes through this helper, then
 * emits those working bytes. No second flatten-on-save patcher.
 */

import { MIXED_RUN_FAIL_MESSAGE } from "./resumeBlockEdit";
import { PatchError, patchParagraphPlaintext } from "./resumeOoxmlPatch";

/** Architecture §36: debounce local typing before OOXML patch + working-copy upload. */
export const RESUME_OOXML_FLUSH_DEBOUNCE_MS = 1000;

export type FlushBlockPlaintextResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: PatchError["code"]; message: string };

/**
 * Patch one bookmarked paragraph in working DOCX bytes. On `PatchError`,
 * returns `ok: false` and leaves the caller's buffer untouched (the patcher
 * never mutates its input). The UI must keep the last-good bytes and revert
 * the block preview — never write a flattened paragraph.
 */
export async function flushBlockPlaintextByBookmark(
  docxBytes: Uint8Array,
  bookmarkName: string,
  newPlaintext: string
): Promise<FlushBlockPlaintextResult> {
  if (!bookmarkName.startsWith("pa_")) {
    return {
      ok: false,
      code: "not_found",
      message: MIXED_RUN_FAIL_MESSAGE,
    };
  }

  try {
    const bytes = await patchParagraphPlaintext(
      docxBytes,
      { bookmarkName },
      newPlaintext
    );
    return { ok: true, bytes };
  } catch (err) {
    if (err instanceof PatchError) {
      return {
        ok: false,
        code: err.code,
        message: MIXED_RUN_FAIL_MESSAGE,
      };
    }
    throw err;
  }
}
