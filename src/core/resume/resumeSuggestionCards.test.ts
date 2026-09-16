import { describe, expect, it } from "vitest";
import type { FactSourceBlock } from "./resumeFacts";
import type { ResumeSuggestion } from "./resumeModel";
import {
  buildSuggestionCardViews,
  eligibleBlocksForSuggestionCards,
  suggestionCardFocusTarget,
  suggestionCardTitle,
  suggestionPlaintextDiff,
  suggestionsVisibleOnCards,
} from "./resumeSuggestionCards";

const ROLE_A_BULLET = "b-role-a-bullet";
const ROLE_B_BULLET = "b-role-b-bullet";

const BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 – 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 – 2020" },
  { blockId: ROLE_B_BULLET, text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
  { blockId: "b-edu-heading", text: "EDUCATION" },
  { blockId: "b-edu", text: "B.S. Computer Science" },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: "b-skills", text: "Python, REST APIs, SQL, Docker" },
];

function suggestion(overrides: Partial<ResumeSuggestion> = {}): ResumeSuggestion {
  return {
    id: "sug-1",
    sourceBlockId: ROLE_A_BULLET,
    originalText: "Built REST APIs with Python and Docker for inventory sync.",
    originalTextHash: "a".repeat(64),
    proposedText: "Built RESTful services with Python and Docker for inventory sync.",
    targetRequirementIds: ["req-rest"],
    evidenceIds: ["fact-1"],
    evidenceQuotes: ["REST APIs"],
    reasoning: "Align REST wording with the job description.",
    transformationType: "terminology_alignment",
    confidence: 0.8,
    factualityStatus: "grounded",
    layoutConstraint: { status: "indeterminate", characterCount: 64 },
    status: "pending",
    generation: {
      pipelineVersion: "resume-suggestions-1",
      promptVersion: "resume-llm-prompt-1",
      model: "fake-model",
    },
    ...overrides,
  };
}

describe("suggestionsVisibleOnCards", () => {
  it("keeps grounded pending suggestions and drops other statuses", () => {
    const visible = suggestionsVisibleOnCards([
      suggestion(),
      suggestion({ id: "sug-2", status: "rejected" }),
      suggestion({ id: "sug-3", factualityStatus: "rejected_ungrounded" }),
      suggestion({ id: "sug-4", status: "accepted" }),
    ]);
    expect(visible.map((row) => row.id)).toEqual(["sug-1"]);
  });
});

describe("buildSuggestionCardViews", () => {
  it("binds each card to sourceBlockId and labels Original / Suggested", () => {
    const views = buildSuggestionCardViews([
      suggestion(),
      suggestion({
        id: "sug-2",
        sourceBlockId: ROLE_B_BULLET,
        originalText: "Wrote SQL batch jobs that reconciled nightly shipment files.",
        proposedText: "Wrote SQL batch jobs that reconciled nightly shipment files.",
      }),
    ]);
    expect(views).toHaveLength(2);
    expect(views[0]?.sourceBlockId).toBe(ROLE_A_BULLET);
    expect(views[0]?.title).toBe("Suggestion 1 of 2");
    expect(views[0]?.originalLabel).toBe("Original");
    expect(views[0]?.suggestedLabel).toBe("Suggested");
    expect(views[0]?.ariaLabel.toLowerCase()).toContain("suggestion 1 of 2");
    expect(views[0]?.ariaLabel.toLowerCase()).toContain("original");
    expect(suggestionCardFocusTarget(views[0]!.suggestion)).toBe(ROLE_A_BULLET);
    expect(views[1]?.sourceBlockId).toBe(ROLE_B_BULLET);
    expect(views[1]?.title).toBe("Suggestion 2 of 2");
  });
});

describe("suggestionCardTitle", () => {
  it("uses 1-based indexes", () => {
    expect(suggestionCardTitle(3, 12)).toBe("Suggestion 3 of 12");
  });
});

describe("eligibleBlocksForSuggestionCards", () => {
  it("includes experience and skills body blocks, not headings or education", () => {
    const eligible = eligibleBlocksForSuggestionCards(BLOCKS).map((block) => block.blockId);
    expect(eligible).toEqual([ROLE_A_BULLET, ROLE_B_BULLET, "b-skills"]);
    expect(eligible).not.toContain("b-exp-heading");
    expect(eligible).not.toContain("b-role-a");
    expect(eligible).not.toContain("b-edu");
    expect(eligible).not.toContain("b-name");
  });
});

describe("suggestionPlaintextDiff", () => {
  it("marks replaced words without dropping unchanged neighbors", () => {
    const tokens = suggestionPlaintextDiff(
      "Built REST APIs with Python.",
      "Built RESTful services with Python."
    );
    expect(tokens.some((token) => token.kind === "removed" && token.text === "REST")).toBe(true);
    expect(tokens.some((token) => token.kind === "removed" && token.text === "APIs")).toBe(true);
    expect(tokens.some((token) => token.kind === "added" && token.text === "RESTful")).toBe(true);
    expect(tokens.some((token) => token.kind === "added" && token.text === "services")).toBe(true);
    expect(tokens.filter((token) => token.kind === "equal").map((token) => token.text)).toEqual(
      expect.arrayContaining(["Built", "with", "Python."])
    );
  });
});
