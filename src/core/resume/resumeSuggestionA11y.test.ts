import { describe, expect, it } from "vitest";
import {
  isSuggestionShortcutEditableTarget,
  neighborSuggestionId,
  nextSuggestionIdAfterDismiss,
  RESUME_SUGGESTION_KEYBOARD_HELP,
  resumeSuggestionReviewShortcut,
  suggestionCardElementId,
} from "./resumeSuggestionA11y";

function event(
  overrides: Partial<Parameters<typeof resumeSuggestionReviewShortcut>[0]> = {}
): Parameters<typeof resumeSuggestionReviewShortcut>[0] {
  return {
    key: "a",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    targetIsEditable: false,
    ...overrides,
  };
}

describe("resumeSuggestionReviewShortcut", () => {
  it("maps Alt+Enter to accept even inside the wording field", () => {
    expect(
      resumeSuggestionReviewShortcut(event({ key: "Enter", altKey: true, targetIsEditable: true }))
    ).toBe("accept");
  });

  it("maps Alt+Backspace to reject", () => {
    expect(resumeSuggestionReviewShortcut(event({ key: "Backspace", altKey: true }))).toBe(
      "reject"
    );
  });

  it("does not treat typing A or Enter without Alt as Accept", () => {
    expect(resumeSuggestionReviewShortcut(event({ key: "a" }))).toBeNull();
    expect(resumeSuggestionReviewShortcut(event({ key: "Enter" }))).toBeNull();
    expect(resumeSuggestionReviewShortcut(event({ key: "Enter", targetIsEditable: true }))).toBeNull();
  });

  it("leaves Cmd/Ctrl shortcuts to the document editor", () => {
    expect(
      resumeSuggestionReviewShortcut(event({ key: "Enter", altKey: true, metaKey: true }))
    ).toBeNull();
    expect(
      resumeSuggestionReviewShortcut(event({ key: "z", ctrlKey: true }))
    ).toBeNull();
  });

  it("moves between cards with arrows only when the card itself is focused", () => {
    expect(resumeSuggestionReviewShortcut(event({ key: "ArrowDown" }))).toBe("nextCard");
    expect(resumeSuggestionReviewShortcut(event({ key: "ArrowUp" }))).toBe("prevCard");
    expect(
      resumeSuggestionReviewShortcut(event({ key: "ArrowDown", targetIsEditable: true }))
    ).toBeNull();
  });
});

describe("nextSuggestionIdAfterDismiss", () => {
  it("focuses the following card, then the previous, then none", () => {
    expect(nextSuggestionIdAfterDismiss(["a", "b", "c"], "a")).toBe("b");
    expect(nextSuggestionIdAfterDismiss(["a", "b", "c"], "b")).toBe("c");
    expect(nextSuggestionIdAfterDismiss(["a", "b", "c"], "c")).toBe("b");
    expect(nextSuggestionIdAfterDismiss(["only"], "only")).toBeNull();
    expect(nextSuggestionIdAfterDismiss([], "gone")).toBeNull();
  });
});

describe("neighborSuggestionId", () => {
  it("does not wrap past the ends", () => {
    expect(neighborSuggestionId(["a", "b", "c"], "b", "next")).toBe("c");
    expect(neighborSuggestionId(["a", "b", "c"], "b", "prev")).toBe("a");
    expect(neighborSuggestionId(["a", "b", "c"], "c", "next")).toBeNull();
    expect(neighborSuggestionId(["a", "b", "c"], "a", "prev")).toBeNull();
  });
});

describe("RESUME_SUGGESTION_KEYBOARD_HELP", () => {
  it("documents accept/reject shortcuts as extras, not the only path", () => {
    expect(RESUME_SUGGESTION_KEYBOARD_HELP.toLowerCase()).toContain("alt+enter");
    expect(RESUME_SUGGESTION_KEYBOARD_HELP.toLowerCase()).toContain("alt+backspace");
    expect(RESUME_SUGGESTION_KEYBOARD_HELP.toLowerCase()).toContain("buttons still work");
    expect(RESUME_SUGGESTION_KEYBOARD_HELP.toLowerCase()).toContain("next card");
  });
});

describe("suggestionCardElementId", () => {
  it("is stable and unique per suggestion id", () => {
    expect(suggestionCardElementId("sug-1")).toBe("resume-suggestion-card-sug-1");
  });
});

describe("isSuggestionShortcutEditableTarget", () => {
  it("treats form fields as editable without a DOM", () => {
    expect(isSuggestionShortcutEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isSuggestionShortcutEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isSuggestionShortcutEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isSuggestionShortcutEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isSuggestionShortcutEditableTarget({ tagName: "ARTICLE", isContentEditable: true })).toBe(
      true
    );
    expect(isSuggestionShortcutEditableTarget(null)).toBe(false);
  });
});
