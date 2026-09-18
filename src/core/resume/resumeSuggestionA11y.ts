/**
 * Keyboard extras for suggestion review (Phase 10C). Buttons remain the
 * primary path. Shortcuts must not rewrite the document by themselves —
 * callers still go through Accept / Reject.
 */

export type ResumeSuggestionReviewShortcut = "accept" | "reject" | "nextCard" | "prevCard";

/** User-visible copy. Not the only way to Accept or Reject. */
export const RESUME_SUGGESTION_KEYBOARD_HELP =
  "Keyboard extras (the buttons still work): Alt+Enter accepts, Alt+Backspace rejects. Arrow Up and Arrow Down move between cards when the card itself is focused, not while typing in a field. After Accept or Reject, focus moves to the next card.";

export type ResumeSuggestionShortcutEvent = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** True for textarea / input / select so arrows still move the caret. */
  targetIsEditable: boolean;
};

/**
 * Map a key event to a review action. Ctrl/Cmd combinations are left to the
 * editor undo stack. Plain letters never Accept while typing.
 */
export function resumeSuggestionReviewShortcut(
  event: ResumeSuggestionShortcutEvent
): ResumeSuggestionReviewShortcut | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.altKey && !event.shiftKey) {
    if (event.key === "Enter") return "accept";
    if (event.key === "Backspace") return "reject";
    return null;
  }
  if (event.altKey || event.shiftKey || event.targetIsEditable) return null;
  if (event.key === "ArrowDown") return "nextCard";
  if (event.key === "ArrowUp") return "prevCard";
  return null;
}

export function suggestionCardElementId(suggestionId: string): string {
  return `resume-suggestion-card-${suggestionId}`;
}

export const RESUME_SUGGESTIONS_HEADING_ID = "resume-suggestions-heading";

/** Move keyboard focus to a remaining card, or the Suggestions heading. */
export function focusResumeSuggestionReviewTarget(suggestionId: string | null): void {
  if (typeof document === "undefined") return;
  const id = suggestionId
    ? suggestionCardElementId(suggestionId)
    : RESUME_SUGGESTIONS_HEADING_ID;
  const node = document.getElementById(id);
  if (node instanceof HTMLElement) node.focus();
}

/**
 * After a card leaves the list, focus the following card, else the previous.
 */
export function nextSuggestionIdAfterDismiss(
  orderedIds: readonly string[],
  dismissedId: string
): string | null {
  const index = orderedIds.indexOf(dismissedId);
  if (index < 0) return orderedIds[0] ?? null;
  return orderedIds[index + 1] ?? orderedIds[index - 1] ?? null;
}

export function neighborSuggestionId(
  orderedIds: readonly string[],
  currentId: string,
  direction: "next" | "prev"
): string | null {
  const index = orderedIds.indexOf(currentId);
  if (index < 0) return null;
  const next = direction === "next" ? index + 1 : index - 1;
  if (next < 0 || next >= orderedIds.length) return null;
  return orderedIds[next] ?? null;
}

export function isSuggestionShortcutEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== "object" || !("tagName" in target)) return false;
  const tag = String((target as { tagName?: string }).tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return true;
  if ("isContentEditable" in target && (target as { isContentEditable?: boolean }).isContentEditable) {
    return true;
  }
  return false;
}
