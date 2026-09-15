/**
 * Pure resume library helpers (Phase 2C). No Supabase, no React.
 * Name validation and the deterministic single-default rule live here so both the
 * UI and the remote layer share one source of truth. The database enforces the
 * `is_default` partial unique index; this mirror keeps optimistic UI consistent.
 */

import type { Resume } from "./resumeModel";

export const RESUME_NAME_MAX_LENGTH = 200;

/** Trim surrounding whitespace and collapse internal runs to single spaces. */
export function normalizeResumeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Validate a proposed resume name. Returns a user-facing error message, or
 * `null` when the (normalized) name is acceptable.
 */
export function validateResumeName(raw: string): string | null {
  const normalized = normalizeResumeName(raw);
  if (normalized.length === 0) {
    return "Enter a resume name.";
  }
  if (normalized.length > RESUME_NAME_MAX_LENGTH) {
    return `Resume name must be ${RESUME_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * Return a new list where exactly `resumeId` is the default and every other
 * resume is unset. Mirrors the DB single-default rule for optimistic updates.
 * If `resumeId` is not present, the list is returned with all defaults cleared.
 */
export function applyDefaultResumeSelection(resumes: Resume[], resumeId: string): Resume[] {
  return resumes.map((resume) =>
    resume.isDefault === (resume.id === resumeId)
      ? resume
      : { ...resume, isDefault: resume.id === resumeId }
  );
}

/** Return a new list with `resumeId` removed. */
export function removeResumeById(resumes: Resume[], resumeId: string): Resume[] {
  return resumes.filter((resume) => resume.id !== resumeId);
}

/** Return a new list with `resumeId` renamed to `name` (already normalized by caller). */
export function renameResumeInList(resumes: Resume[], resumeId: string, name: string): Resume[] {
  return resumes.map((resume) => (resume.id === resumeId ? { ...resume, name } : resume));
}

/** Suffix appended to a duplicated resume's name. */
export const RESUME_COPY_SUFFIX = " (copy)";

/**
 * Derive the name for a duplicated resume (Phase 2D): normalize the source name
 * and append `RESUME_COPY_SUFFIX`, truncating the base so the result never
 * exceeds `RESUME_NAME_MAX_LENGTH`. Always returns a non-empty, valid name.
 */
export function duplicateResumeName(sourceName: string): string {
  const base = normalizeResumeName(sourceName);
  const withSuffix = `${base}${RESUME_COPY_SUFFIX}`;
  if (withSuffix.length <= RESUME_NAME_MAX_LENGTH) {
    return withSuffix;
  }
  const room = RESUME_NAME_MAX_LENGTH - RESUME_COPY_SUFFIX.length;
  const truncatedBase = base.slice(0, Math.max(0, room)).trimEnd();
  return `${truncatedBase}${RESUME_COPY_SUFFIX}`;
}
