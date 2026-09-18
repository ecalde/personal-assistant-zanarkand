/**
 * Job-session persist helpers (Phase 5B).
 *
 * Architecture §36–§37: debounce the JD textarea to `resume_job_sessions`
 * (500 ms). Survive navigation via the RLS row, not React state or
 * localStorage. Reset archives the session and clears the pane; Replace
 * archives then creates a new empty session. Neither mutates the resume
 * document. Deterministic parse / matching is 5C–5D — this phase stores
 * company, title, raw text, and optional applicationId (`parsed_job` stays null).
 */

import { RESUME_JOB_DESCRIPTION_MAX_CHARS } from "./resumeDbMappers";
import type { ResumeJobSession } from "./resumeModel";

/** Architecture §36: JD textarea debounce. */
export const RESUME_JD_AUTOSAVE_DEBOUNCE_MS = 500;

export type JobSessionDraft = {
  company: string;
  jobTitle: string;
  jobDescriptionText: string;
  /** Soft FK to Career JobApplication.id. Null = not linked. */
  applicationId: string | null;
};

export const EMPTY_JOB_SESSION_DRAFT: JobSessionDraft = {
  company: "",
  jobTitle: "",
  jobDescriptionText: "",
  applicationId: null,
};

export type JobSessionPersistPlan =
  | { action: "skip" }
  | { action: "insert"; draft: JobSessionDraft }
  | { action: "update"; sessionId: string; draft: JobSessionDraft }
  | { action: "too_long" };

export type JobSessionResetPlan =
  | { action: "clear_local" }
  | { action: "archive"; sessionId: string };

export type JobSessionReplacePlan =
  | { action: "noop" }
  | { action: "archive_then_insert_empty"; sessionId: string };

export function draftFromJobSession(session: ResumeJobSession): JobSessionDraft {
  return {
    company: session.company,
    jobTitle: session.jobTitle,
    jobDescriptionText: session.jobDescriptionText,
    applicationId: session.applicationId,
  };
}

export function draftsEqual(a: JobSessionDraft, b: JobSessionDraft): boolean {
  return (
    a.company === b.company &&
    a.jobTitle === b.jobTitle &&
    a.jobDescriptionText === b.jobDescriptionText &&
    a.applicationId === b.applicationId
  );
}

export function isJobSessionDraftEmpty(draft: JobSessionDraft): boolean {
  return (
    draft.company.trim() === "" &&
    draft.jobTitle.trim() === "" &&
    draft.jobDescriptionText.trim() === "" &&
    draft.applicationId === null
  );
}

/** Fields written to Postgres. Never includes parsedJob or matchResult. */
export function jobSessionWriteFields(draft: JobSessionDraft): JobSessionDraft {
  return {
    company: draft.company,
    jobTitle: draft.jobTitle,
    jobDescriptionText: draft.jobDescriptionText,
    applicationId: draft.applicationId,
  };
}

export function planJobSessionPersist(args: {
  draft: JobSessionDraft;
  lastPersisted: JobSessionDraft | null;
  activeSessionId: string | null;
}): JobSessionPersistPlan {
  if (args.draft.jobDescriptionText.length > RESUME_JOB_DESCRIPTION_MAX_CHARS) {
    return { action: "too_long" };
  }
  if (args.lastPersisted && draftsEqual(args.draft, args.lastPersisted)) {
    return { action: "skip" };
  }
  if (!args.activeSessionId) {
    if (isJobSessionDraftEmpty(args.draft)) return { action: "skip" };
    return { action: "insert", draft: jobSessionWriteFields(args.draft) };
  }
  return {
    action: "update",
    sessionId: args.activeSessionId,
    draft: jobSessionWriteFields(args.draft),
  };
}

export function planJobSessionReset(activeSessionId: string | null): JobSessionResetPlan {
  if (!activeSessionId) return { action: "clear_local" };
  return { action: "archive", sessionId: activeSessionId };
}

/**
 * Archive the active session and insert a new empty one so the next paste
 * cannot keep stale `parsed_job` / `match_result` on the old row. The new row
 * is created with null analysis (Phase 5F).
 */
export function planJobSessionReplace(activeSessionId: string | null): JobSessionReplacePlan {
  if (!activeSessionId) return { action: "noop" };
  return { action: "archive_then_insert_empty", sessionId: activeSessionId };
}

export function jobSessionTooLongMessage(): string {
  return `Job description is too long (max ${RESUME_JOB_DESCRIPTION_MAX_CHARS.toLocaleString()} characters).`;
}
