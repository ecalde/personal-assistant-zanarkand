/**
 * Accept / reject / edit / regenerate for suggestion cards (Phase 7B–7D).
 *
 * Reviewable cards stay pending, blocked_formatting, or stale until the user
 * records a decision. Accept re-grounds edited wording, then 7C patches OOXML
 * and marks `applied` only when `originalTextHash` still matches the paragraph.
 * Hash mismatch marks `stale` and does not patch. PatchError marks
 * `blocked_formatting` and leaves the document unchanged. Reject stores
 * `rejected`. Regenerated text always re-runs grounding and style lint against
 * the current paragraph; failed gates keep the previous proposal.
 *
 * Do not log resume or JD text.
 */

import {
  detectResumeSections,
  type FactSourceBlock,
  type ResumeDocumentSections,
} from "./resumeFacts";
import { groundProposedText } from "./resumeGrounding";
import type { ResumeFactLedger, ResumeSuggestion, SuggestionStatus } from "./resumeModel";
import { MIXED_RUN_FAIL_MESSAGE } from "./resumeBlockEdit";
import {
  RESUME_APPLY_NOT_READY_MESSAGE,
  RESUME_SUGGESTION_STALE_MESSAGE,
} from "./resumeSuggestionApply";
import { prepareSuggestionText } from "./resumeStyleLint";

export type ResumeRegenerationOptions = {
  shorter?: boolean;
  closerToOriginal?: boolean;
  emphasizeRequirementId?: string;
};

export type SuggestionReviewErrorCode =
  | "not_reviewable"
  | "rejected_ungrounded"
  | "style_rejected"
  | "invalid_constraint"
  | "regenerate_failed"
  | "blocked_formatting"
  | "apply_not_ready"
  | "stale";

export type SuggestionReviewFailure = {
  ok: false;
  code: SuggestionReviewErrorCode;
};

export type SuggestionReviewSuccess = {
  ok: true;
  suggestion: ResumeSuggestion;
};

export type SuggestionReviewResult = SuggestionReviewSuccess | SuggestionReviewFailure;

export function isReviewableSuggestion(
  suggestion: Pick<ResumeSuggestion, "status" | "factualityStatus">
): boolean {
  return (
    (suggestion.status === "pending" ||
      suggestion.status === "blocked_formatting" ||
      suggestion.status === "stale") &&
    suggestion.factualityStatus === "grounded"
  );
}

export function suggestionReviewErrorCopy(code: SuggestionReviewErrorCode): string {
  switch (code) {
    case "not_reviewable":
      return "This suggestion can no longer be reviewed.";
    case "rejected_ungrounded":
      return "That wording adds claims that are not allowed evidence for this paragraph.";
    case "style_rejected":
      return "That wording failed the writing-style checks. Edit it and try again.";
    case "invalid_constraint":
      return "Choose a requirement from this job description to emphasize.";
    case "regenerate_failed":
      return "Could not regenerate a grounded suggestion. The previous wording is unchanged.";
    case "blocked_formatting":
      return MIXED_RUN_FAIL_MESSAGE;
    case "apply_not_ready":
      return RESUME_APPLY_NOT_READY_MESSAGE;
    case "stale":
      return RESUME_SUGGESTION_STALE_MESSAGE;
  }
}

export function normalizeRegenerationOptions(
  options: ResumeRegenerationOptions
): ResumeRegenerationOptions | null {
  const next: ResumeRegenerationOptions = {};
  if (options.shorter) next.shorter = true;
  if (options.closerToOriginal) next.closerToOriginal = true;
  const emphasize = options.emphasizeRequirementId?.trim();
  if (emphasize) next.emphasizeRequirementId = emphasize;
  if (!next.shorter && !next.closerToOriginal && !next.emphasizeRequirementId) {
    return null;
  }
  return next;
}

export function regenerationConstraintIsValid(
  options: ResumeRegenerationOptions,
  requirementIds: readonly string[]
): boolean {
  const emphasize = options.emphasizeRequirementId?.trim();
  if (!emphasize) return true;
  return requirementIds.includes(emphasize);
}

export function rejectReviewedSuggestion(
  suggestion: ResumeSuggestion
): SuggestionReviewResult {
  if (!isReviewableSuggestion(suggestion)) {
    return { ok: false, code: "not_reviewable" };
  }
  return {
    ok: true,
    suggestion: { ...suggestion, status: "rejected" satisfies SuggestionStatus },
  };
}

export type AcceptReviewedSuggestionInput = {
  suggestion: ResumeSuggestion;
  proposedText: string;
  ledger: ResumeFactLedger;
  blocks: readonly FactSourceBlock[];
  scope?: ResumeDocumentSections;
};

/**
 * Record Accept after optional user edit. Re-grounds edited wording. Status
 * stays `accepted` until the 7C OOXML apply marks `applied` or
 * `blocked_formatting`.
 */
export function acceptReviewedSuggestion(
  input: AcceptReviewedSuggestionInput
): SuggestionReviewResult {
  if (!isReviewableSuggestion(input.suggestion)) {
    return { ok: false, code: "not_reviewable" };
  }

  const prepared = prepareSuggestionText(input.proposedText);
  if (!prepared.lint.ok) {
    return { ok: false, code: "style_rejected" };
  }

  const scope = input.scope ?? detectResumeSections(input.blocks);
  const grounding = groundProposedText({
    proposedText: prepared.text,
    originalText: input.suggestion.originalText,
    blockId: input.suggestion.sourceBlockId,
    ledger: input.ledger,
    scope,
  });
  if (grounding.factualityStatus !== "grounded") {
    return { ok: false, code: "rejected_ungrounded" };
  }

  return {
    ok: true,
    suggestion: {
      ...input.suggestion,
      proposedText: prepared.text,
      factualityStatus: "grounded",
      status: "accepted",
      layoutConstraint: {
        ...input.suggestion.layoutConstraint,
        characterCount: prepared.text.length,
      },
    },
  };
}

export function markSuggestionApplied(suggestion: ResumeSuggestion): ResumeSuggestion {
  return { ...suggestion, status: "applied" satisfies SuggestionStatus };
}

export function markSuggestionBlockedFormatting(
  suggestion: ResumeSuggestion
): ResumeSuggestion {
  return { ...suggestion, status: "blocked_formatting" satisfies SuggestionStatus };
}

export function markSuggestionStale(suggestion: ResumeSuggestion): ResumeSuggestion {
  return { ...suggestion, status: "stale" satisfies SuggestionStatus };
}

/**
 * Keep the same suggestion id; replace the pending proposal and snapshot the
 * current paragraph as original text/hash (needed after a stale regenerate).
 * Generated output must already have passed generateBlockSuggestion gates.
 */
export function applyRegeneratedProposal(
  current: ResumeSuggestion,
  generated: ResumeSuggestion
): SuggestionReviewResult {
  if (!isReviewableSuggestion(current)) {
    return { ok: false, code: "not_reviewable" };
  }
  if (
    generated.factualityStatus !== "grounded" ||
    generated.status !== "pending" ||
    generated.sourceBlockId !== current.sourceBlockId
  ) {
    return { ok: false, code: "regenerate_failed" };
  }
  return {
    ok: true,
    suggestion: {
      ...current,
      originalText: generated.originalText,
      originalTextHash: generated.originalTextHash,
      proposedText: generated.proposedText,
      targetRequirementIds: [...generated.targetRequirementIds],
      evidenceIds: [...generated.evidenceIds],
      evidenceQuotes: [...generated.evidenceQuotes],
      reasoning: generated.reasoning,
      transformationType: generated.transformationType,
      confidence: generated.confidence,
      factualityStatus: "grounded",
      layoutConstraint: generated.layoutConstraint,
      status: "pending",
      generation: generated.generation,
    },
  };
}
