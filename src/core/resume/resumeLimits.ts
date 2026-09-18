/**
 * Resume Tool size and path limits (Phase 10A).
 *
 * Dual-checks the SQL CHECKs / Storage policies: 100k JD characters
 * (architecture §33, same order as school ingest), 8 MB compressed upload
 * (bucket `file_size_limit` and §17), canonical `{uid}/{resumeId}/…` object
 * names, and one in-flight Generate run (client-side suggestion spam).
 */

import { RESUME_JOB_DESCRIPTION_MAX_CHARS } from "./resumeDbMappers";
import {
  RESUME_UPLOAD_ERRORS,
  RESUME_UPLOAD_MAX_BYTES,
} from "./resumeFileValidation";

export { RESUME_JOB_DESCRIPTION_MAX_CHARS, RESUME_UPLOAD_MAX_BYTES };

/** Matches Postgres `uuid::text` (lowercase, hyphenated) used in Storage paths. */
const RESUME_DOCS_UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** `{user_id}/{resume_id}/original/{sha256}.docx` — SQL CHECK + Storage policy. */
export const RESUME_DOCS_ORIGINAL_OBJECT_RE = new RegExp(
  `^${RESUME_DOCS_UUID}/${RESUME_DOCS_UUID}/original/[0-9a-f]{64}\\.docx$`
);

/** `{user_id}/{resume_id}/versions/{version_id}.docx` — SQL CHECK + Storage policy. */
export const RESUME_DOCS_WORKING_OBJECT_RE = new RegExp(
  `^${RESUME_DOCS_UUID}/${RESUME_DOCS_UUID}/versions/${RESUME_DOCS_UUID}\\.docx$`
);

export class ResumeJobDescriptionTooLongError extends Error {
  constructor() {
    super(
      `Job description is too long (max ${RESUME_JOB_DESCRIPTION_MAX_CHARS.toLocaleString()} characters).`
    );
    this.name = "ResumeJobDescriptionTooLongError";
  }
}

export function resumeJobDescriptionExceedsCap(text: string): boolean {
  return text.length > RESUME_JOB_DESCRIPTION_MAX_CHARS;
}

export function assertResumeJobDescriptionWithinCap(text: string): void {
  if (resumeJobDescriptionExceedsCap(text)) {
    throw new ResumeJobDescriptionTooLongError();
  }
}

export function resumeUploadExceedsCompressedCap(byteLength: number): boolean {
  return byteLength > RESUME_UPLOAD_MAX_BYTES;
}

/** User-facing message when compressed bytes exceed the 8 MB Storage/UI cap. */
export function resumeUploadTooLargeMessage(byteLength: number): string | null {
  if (!resumeUploadExceedsCompressedCap(byteLength)) return null;
  return RESUME_UPLOAD_ERRORS.tooLarge;
}

/**
 * Object names the Storage RLS policy and `resume_versions` path CHECKs accept.
 * Rejects `..`, extra segments, and non-canonical folders even when the first
 * segment is the caller's uid (the 1B policy alone would allow that).
 */
export function isCanonicalResumeDocsObjectName(name: string): boolean {
  if (!name || name.includes("..") || name.includes("\\") || name.includes("\0")) {
    return false;
  }
  if (name.startsWith("/") || name.includes("//")) return false;
  return RESUME_DOCS_ORIGINAL_OBJECT_RE.test(name) || RESUME_DOCS_WORKING_OBJECT_RE.test(name);
}

/**
 * Client-side Generate spam guard. The button is also disabled while running;
 * this is the fail-closed check so a second click cannot start another Ollama
 * loop before React re-renders.
 */
export function mayStartResumeSuggestionGenerate(generating: boolean): boolean {
  return !generating;
}
