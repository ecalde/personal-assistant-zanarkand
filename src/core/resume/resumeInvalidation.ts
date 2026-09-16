/**
 * Resume invalidation (Phase 5F).
 *
 * Architecture §20.3 / §37: a new job description archives the previous
 * session and drops coverage. Document edits refresh the working mention
 * index only — they do not re-parse the JD and they never rebuild the frozen
 * import ledger from working text.
 */

import type { JobSessionDraft } from "./resumeJobSessionPersist";
import type { MatchResult, ParsedJobDescription } from "./resumeModel";

export type ResumeInvalidationEvent =
  | "document_text_edit"
  | "typed_unverified_mention"
  | "fail_closed_patch"
  | "jd_field_change"
  | "jd_replace"
  | "jd_reset"
  | "jd_analyze";

export type ResumeInvalidationDecision = {
  rerunJobParse: boolean;
  rebuildImportLedger: boolean;
  refreshMentions: boolean;
  dropCoverage: boolean;
  archiveJobSession: boolean;
  discardPendingSuggestions: boolean;
  documentBytes: "unchanged" | "patched_working" | "forbidden";
};

const DECISIONS: Record<ResumeInvalidationEvent, ResumeInvalidationDecision> = {
  document_text_edit: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: true,
    dropCoverage: false,
    archiveJobSession: false,
    discardPendingSuggestions: false,
    documentBytes: "patched_working",
  },
  typed_unverified_mention: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: true,
    dropCoverage: false,
    archiveJobSession: false,
    discardPendingSuggestions: false,
    documentBytes: "patched_working",
  },
  fail_closed_patch: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: false,
    dropCoverage: false,
    archiveJobSession: false,
    discardPendingSuggestions: false,
    documentBytes: "forbidden",
  },
  jd_field_change: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: false,
    dropCoverage: true,
    archiveJobSession: false,
    discardPendingSuggestions: true,
    documentBytes: "unchanged",
  },
  jd_replace: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: false,
    dropCoverage: true,
    archiveJobSession: true,
    discardPendingSuggestions: true,
    documentBytes: "unchanged",
  },
  jd_reset: {
    rerunJobParse: false,
    rebuildImportLedger: false,
    refreshMentions: false,
    dropCoverage: true,
    archiveJobSession: true,
    discardPendingSuggestions: true,
    documentBytes: "unchanged",
  },
  jd_analyze: {
    rerunJobParse: true,
    rebuildImportLedger: false,
    refreshMentions: false,
    dropCoverage: false,
    archiveJobSession: false,
    discardPendingSuggestions: false,
    documentBytes: "unchanged",
  },
};

export function decideResumeInvalidation(
  event: ResumeInvalidationEvent
): ResumeInvalidationDecision {
  return { ...DECISIONS[event] };
}

export type JobSessionAnalysisSnapshot = {
  company: string;
  jobTitle: string;
  jobDescriptionText: string;
  parsedJob: ParsedJobDescription | null;
  matchResult: MatchResult | null;
};

export function sessionHasStoredJobAnalysis(session: JobSessionAnalysisSnapshot | null): boolean {
  return Boolean(session?.parsedJob || session?.matchResult);
}

/**
 * Stored coverage is only valid for the exact company / title / JD text that
 * was analyzed. A later keystroke must not keep showing the old match.
 */
export function storedJobAnalysisIsStaleForDraft(
  session: JobSessionAnalysisSnapshot | null,
  draft: JobSessionDraft
): boolean {
  if (!sessionHasStoredJobAnalysis(session) || !session) return false;
  return (
    session.company !== draft.company ||
    session.jobTitle !== draft.jobTitle ||
    session.jobDescriptionText !== draft.jobDescriptionText
  );
}

export function shouldDropStoredJobAnalysis(
  session: JobSessionAnalysisSnapshot | null,
  draft: JobSessionDraft
): boolean {
  return storedJobAnalysisIsStaleForDraft(session, draft);
}

export function jobAnalysisClearPatch(): { parsedJob: null; matchResult: null } {
  return { parsedJob: null, matchResult: null };
}

/** Replace starts a new empty session so the archived row keeps the old parse. */
export function emptyReplacedJobSessionFields(): JobSessionDraft & {
  parsedJob: null;
  matchResult: null;
} {
  return {
    company: "",
    jobTitle: "",
    jobDescriptionText: "",
    parsedJob: null,
    matchResult: null,
  };
}
