/**
 * Product-path DOCX download (Phase 4G).
 *
 * Architecture §38 / §58.3: export is the **working** OOXML bytes after a
 * flush of pending patches through the same `patchParagraphPlaintext` as 0D
 * (via `flushBlockPlaintextByBookmark`). Never HTML-to-docx, never the
 * immutable original, never a flatten-on-save rewrite. Named `Name-role.docx`
 * is Phase 9A.
 */

import { RESUME_DOCX_CONTENT_TYPE } from "./resumeFileValidation";
import { flushBlockPlaintextByBookmark } from "./resumeEditorFlush";

export type PendingWorkingFlush = {
  bookmarkName: string;
  newPlaintext: string;
};

export type WorkingCopyDownloadResult = {
  bytes: Uint8Array;
  failed: boolean;
  message: string | null;
};

const DOCX_EXTENSION = ".docx";
const FILENAME_MAX_BASE = 120;

/**
 * Safe `.docx` filename from the library resume name. Strips path separators
 * and Windows-illegal characters. Does **not** append a job role (9A).
 */
export function resumeWorkingDownloadFilename(resumeName: string): string {
  const collapsed = resumeName.replace(/\s+/g, " ").trim();
  const withoutExt = collapsed.toLowerCase().endsWith(DOCX_EXTENSION)
    ? collapsed.slice(0, -DOCX_EXTENSION.length).trim()
    : collapsed;
  const sanitized = withoutExt
    .replace(/\.\./g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const base =
    sanitized.length > 0 ? sanitized.slice(0, FILENAME_MAX_BASE).trim() : "resume";
  return `${base}${DOCX_EXTENSION}`;
}

/**
 * Apply pending block plaintext through the 0D fail-closed patcher, then
 * return those working bytes as the download payload. A `PatchError` skips
 * that paragraph (last-good bytes stay unflattened). Empty pending is an
 * identity download of the current working copy.
 */
export async function flushWorkingCopyForDownload(
  lastGoodBytes: Uint8Array,
  pending: readonly PendingWorkingFlush[]
): Promise<WorkingCopyDownloadResult> {
  let bytes = lastGoodBytes;
  let failed = false;
  let message: string | null = null;

  for (const item of pending) {
    const result = await flushBlockPlaintextByBookmark(
      bytes,
      item.bookmarkName,
      item.newPlaintext
    );
    if (!result.ok) {
      failed = true;
      message = result.message;
      continue;
    }
    bytes = result.bytes;
  }

  return { bytes, failed, message };
}

/** Browser file save of working DOCX bytes. Not used in node tests. */
export function triggerResumeWorkingDocxDownload(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: RESUME_DOCX_CONTENT_TYPE });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
