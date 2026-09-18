/**
 * Product-path DOCX download (Phase 4G flush + Phase 9A named file).
 *
 * Architecture §38 / §58.3: export is the **working** OOXML bytes after a
 * flush of pending patches through the same `patchParagraphPlaintext` as 0D
 * (via `flushBlockPlaintextByBookmark`). Never HTML-to-docx, never the
 * immutable original, never a flatten-on-save rewrite. Filename is
 * `Name-role.docx` (library name + job-session title when present).
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
const FILENAME_MAX_NAME_WITH_ROLE = 80;
const FILENAME_MAX_ROLE = 39;

function sanitizeDownloadFilenameSegment(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const withoutExt = collapsed.toLowerCase().endsWith(DOCX_EXTENSION)
    ? collapsed.slice(0, -DOCX_EXTENSION.length).trim()
    : collapsed;
  return withoutExt
    .replace(/\.\./g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Safe `.docx` filename: `{resume name}.docx`, or `{resume name}-{role}.docx`
 * when a job-session title is present. Strips path separators and
 * Windows-illegal characters. Does not invent a role when the title is empty.
 */
export function resumeWorkingDownloadFilename(
  resumeName: string,
  jobRole?: string
): string {
  const nameRaw = sanitizeDownloadFilenameSegment(resumeName);
  const roleRaw = sanitizeDownloadFilenameSegment(jobRole ?? "");
  const nameBudget = roleRaw.length > 0 ? FILENAME_MAX_NAME_WITH_ROLE : FILENAME_MAX_BASE;
  const namePart = (nameRaw.length > 0 ? nameRaw : "resume").slice(0, nameBudget).trim();
  if (roleRaw.length === 0) {
    return `${namePart}${DOCX_EXTENSION}`;
  }
  const rolePart = roleRaw.slice(0, FILENAME_MAX_ROLE).trim();
  if (rolePart.length === 0) {
    return `${namePart}${DOCX_EXTENSION}`;
  }
  return `${namePart}-${rolePart}${DOCX_EXTENSION}`;
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
