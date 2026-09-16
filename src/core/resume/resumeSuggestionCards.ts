/**
 * Suggestion cards bound to stable block ids (Phase 7A).
 *
 * Cards display grounded pending proposals. Clicking a card focuses that
 * bookmark id in the editor. Accept / reject / regenerate belong to 7B.
 * Applying OOXML patches belongs to 7C. Do not log resume or JD text.
 */

import { truncateForAriaLabel } from "./resumeBlockEdit";
import { detectResumeSections, type FactSourceBlock } from "./resumeFacts";
import type { ResumeSuggestion, SuggestionStatus } from "./resumeModel";

export const SUGGESTION_CARD_VISIBLE_STATUSES: readonly SuggestionStatus[] = ["pending"];

const ELIGIBLE_SECTION_KINDS = new Set(["experience", "skills", "projects", "profile"]);

export type SuggestionDiffKind = "equal" | "removed" | "added";

export type SuggestionDiffToken = {
  text: string;
  kind: SuggestionDiffKind;
};

export type SuggestionCardView = {
  suggestion: ResumeSuggestion;
  index: number;
  total: number;
  sourceBlockId: string;
  title: string;
  originalLabel: string;
  suggestedLabel: string;
  originalTokens: SuggestionDiffToken[];
  suggestedTokens: SuggestionDiffToken[];
  ariaLabel: string;
};

export function suggestionsVisibleOnCards(
  suggestions: readonly ResumeSuggestion[]
): ResumeSuggestion[] {
  return suggestions.filter(
    (suggestion) =>
      suggestion.status === "pending" && suggestion.factualityStatus === "grounded"
  );
}

export function suggestionCardFocusTarget(
  suggestion: Pick<ResumeSuggestion, "sourceBlockId">
): string {
  return suggestion.sourceBlockId;
}

export function suggestionCardTitle(index: number, total: number): string {
  return `Suggestion ${index} of ${total}`;
}

export function buildSuggestionCardViews(
  suggestions: readonly ResumeSuggestion[]
): SuggestionCardView[] {
  const visible = suggestionsVisibleOnCards(suggestions);
  const total = visible.length;
  return visible.map((suggestion, offset) => {
    const index = offset + 1;
    const originalTokens = suggestionPlaintextDiff(
      suggestion.originalText,
      suggestion.proposedText
    ).filter((token) => token.kind !== "added");
    const suggestedTokens = suggestionPlaintextDiff(
      suggestion.originalText,
      suggestion.proposedText
    ).filter((token) => token.kind !== "removed");
    return {
      suggestion,
      index,
      total,
      sourceBlockId: suggestionCardFocusTarget(suggestion),
      title: suggestionCardTitle(index, total),
      originalLabel: "Original",
      suggestedLabel: "Suggested",
      originalTokens,
      suggestedTokens,
      ariaLabel: `${suggestionCardTitle(index, total)}. Original: ${truncateForAriaLabel(
        suggestion.originalText
      )}`,
    };
  });
}

/**
 * Body paragraphs that may receive a rewrite. Headings, role headers, and
 * contact/education/certification blocks stay out of the card generator.
 */
export function eligibleBlocksForSuggestionCards(
  blocks: readonly FactSourceBlock[]
): FactSourceBlock[] {
  const scope = detectResumeSections(blocks);
  const headingIds = new Set(
    scope.sections
      .map((section) => section.headingBlockId)
      .filter((id): id is string => Boolean(id))
  );
  const roleHeadingIds = new Set(scope.roles.map((role) => role.headingBlockId));
  return blocks.filter((block) => {
    if (!block.blockId || !block.text.trim()) return false;
    if (headingIds.has(block.blockId) || roleHeadingIds.has(block.blockId)) return false;
    const kind = scope.sectionKindByBlockId[block.blockId];
    return kind !== undefined && ELIGIBLE_SECTION_KINDS.has(kind);
  });
}

/**
 * Word-level plaintext diff for card display. Tokens keep their own words;
 * callers must still render Original / Suggested labels (not color-only).
 */
export function suggestionPlaintextDiff(
  originalText: string,
  proposedText: string
): SuggestionDiffToken[] {
  const a = tokenize(originalText);
  const b = tokenize(proposedText);
  if (a.length === 0 && b.length === 0) return [];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tokens: SuggestionDiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      tokens.push({ text: a[i], kind: "equal" });
      i += 1;
      j += 1;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: a[i], kind: "removed" });
      i += 1;
    } else {
      tokens.push({ text: b[j], kind: "added" });
      j += 1;
    }
  }
  while (i < a.length) {
    tokens.push({ text: a[i], kind: "removed" });
    i += 1;
  }
  while (j < b.length) {
    tokens.push({ text: b[j], kind: "added" });
    j += 1;
  }
  return tokens;
}

function tokenize(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}
