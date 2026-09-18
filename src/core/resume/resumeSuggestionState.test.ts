import { describe, expect, it } from "vitest";
import {
  allowedEvidenceForBlock,
  detectResumeSections,
  extractImportedFacts,
  type FactSourceBlock,
} from "./resumeFacts";
import type { ResumeSuggestion } from "./resumeModel";
import {
  acceptReviewedSuggestion,
  applyRegeneratedProposal,
  isReviewableSuggestion,
  markSuggestionApplied,
  markSuggestionBlockedFormatting,
  markSuggestionStale,
  normalizeRegenerationOptions,
  regenerationConstraintIsValid,
  rejectReviewedSuggestion,
  suggestionReviewErrorCopy,
} from "./resumeSuggestionState";

const ROLE_A_BULLET = "b-role-a-bullet";
const ROLE_B_BULLET = "b-role-b-bullet";
const VERSION_ID = "11111111-1111-4111-8111-111111111111";

const BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 – 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 – 2020" },
  { blockId: ROLE_B_BULLET, text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
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

describe("isReviewableSuggestion", () => {
  it("allows grounded pending or blocked_formatting rows for retry", () => {
    expect(isReviewableSuggestion(suggestion())).toBe(true);
    expect(isReviewableSuggestion(suggestion({ status: "blocked_formatting" }))).toBe(true);
    expect(isReviewableSuggestion(suggestion({ status: "stale" }))).toBe(true);
    expect(isReviewableSuggestion(suggestion({ status: "rejected" }))).toBe(false);
    expect(isReviewableSuggestion(suggestion({ status: "accepted" }))).toBe(false);
    expect(isReviewableSuggestion(suggestion({ status: "applied" }))).toBe(false);
    expect(
      isReviewableSuggestion(suggestion({ factualityStatus: "rejected_ungrounded" }))
    ).toBe(false);
  });
});

describe("rejectReviewedSuggestion", () => {
  it("marks a pending card rejected so it leaves the visible list", () => {
    const result = rejectReviewedSuggestion(suggestion());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.status).toBe("rejected");
    expect(result.suggestion.proposedText).toContain("RESTful");
    expect(isReviewableSuggestion(result.suggestion)).toBe(false);
  });

  it("does not reject an already accepted row", () => {
    const result = rejectReviewedSuggestion(suggestion({ status: "accepted" }));
    expect(result).toEqual({ ok: false, code: "not_reviewable" });
  });
});

describe("acceptReviewedSuggestion", () => {
  it("accepts an edited grounded proposal without changing original text", () => {
    const ledger = extractImportedFacts(BLOCKS, { firstSeenVersionId: VERSION_ID });
    const edited = "Built REST APIs with Python and Docker for nightly inventory sync.";
    const result = acceptReviewedSuggestion({
      suggestion: suggestion(),
      proposedText: edited,
      ledger,
      blocks: BLOCKS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.status).toBe("accepted");
    expect(result.suggestion.proposedText).toBe(edited);
    expect(result.suggestion.originalText).toBe(suggestion().originalText);
    expect(result.suggestion.originalTextHash).toBe("a".repeat(64));
  });

  it("rejects edited Kubernetes on a block that does not already contain it", () => {
    const ledger = extractImportedFacts(BLOCKS, { firstSeenVersionId: VERSION_ID });
    const scope = detectResumeSections(BLOCKS);
    expect(
      allowedEvidenceForBlock(ledger, ROLE_A_BULLET, { scope }).some(
        (fact) => fact.normalized === "kubernetes"
      )
    ).toBe(false);

    const result = acceptReviewedSuggestion({
      suggestion: suggestion(),
      proposedText:
        "Built REST APIs with Python, Docker, and Kubernetes for inventory sync.",
      ledger,
      blocks: BLOCKS,
      scope,
    });
    expect(result).toEqual({ ok: false, code: "rejected_ungrounded" });
  });

  it("rejects banned style on accept", () => {
    const ledger = extractImportedFacts(BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = acceptReviewedSuggestion({
      suggestion: suggestion(),
      proposedText: "I leveraged Python and Docker to build REST APIs for inventory sync.",
      ledger,
      blocks: BLOCKS,
    });
    expect(result).toEqual({ ok: false, code: "style_rejected" });
  });

  it("allows retry after blocked_formatting", () => {
    const ledger = extractImportedFacts(BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = acceptReviewedSuggestion({
      suggestion: suggestion({ status: "blocked_formatting" }),
      proposedText: "Built REST APIs with Python and Docker for inventory sync.",
      ledger,
      blocks: BLOCKS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.status).toBe("accepted");
  });
});

describe("markSuggestionApplied / markSuggestionBlockedFormatting / markSuggestionStale", () => {
  it("marks applied after a successful OOXML patch", () => {
    const accepted = suggestion({ status: "accepted" });
    expect(markSuggestionApplied(accepted).status).toBe("applied");
    expect(markSuggestionApplied(accepted).proposedText).toBe(accepted.proposedText);
  });

  it("marks blocked_formatting when the patcher fail-closes", () => {
    const accepted = suggestion({ status: "accepted" });
    expect(markSuggestionBlockedFormatting(accepted).status).toBe("blocked_formatting");
    expect(isReviewableSuggestion(markSuggestionBlockedFormatting(accepted))).toBe(true);
  });

  it("marks stale so Accept cannot apply and regenerate remains available", () => {
    const pending = suggestion();
    const stale = markSuggestionStale(pending);
    expect(stale.status).toBe("stale");
    expect(stale.proposedText).toBe(pending.proposedText);
    expect(stale.originalTextHash).toBe(pending.originalTextHash);
    expect(isReviewableSuggestion(stale)).toBe(true);
  });
});

describe("applyRegeneratedProposal", () => {
  it("replaces proposed text and keeps the same id; original hash follows the regenerated snapshot", () => {
    const current = suggestion();
    const generated = suggestion({
      id: "sug-new",
      originalText: "Built REST APIs with Python and Docker for nightly inventory sync.",
      originalTextHash: "b".repeat(64),
      proposedText: "Built REST APIs with Python and Docker for inventory sync.",
      reasoning: "Stay closer to the original bullet.",
      transformationType: "concise",
      confidence: 0.6,
    });
    const result = applyRegeneratedProposal(current, generated);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.id).toBe("sug-1");
    expect(result.suggestion.status).toBe("pending");
    expect(result.suggestion.proposedText).toBe(generated.proposedText);
    expect(result.suggestion.reasoning).toBe("Stay closer to the original bullet.");
    expect(result.suggestion.originalText).toBe(generated.originalText);
    expect(result.suggestion.originalTextHash).toBe(generated.originalTextHash);
    expect(result.suggestion.sourceBlockId).toBe(ROLE_A_BULLET);
  });

  it("does not merge a proposal for a different block", () => {
    const result = applyRegeneratedProposal(
      suggestion(),
      suggestion({ sourceBlockId: ROLE_B_BULLET })
    );
    expect(result).toEqual({ ok: false, code: "regenerate_failed" });
  });
});

describe("normalizeRegenerationOptions", () => {
  it("drops empty regenerate requests", () => {
    expect(normalizeRegenerationOptions({})).toBeNull();
    expect(normalizeRegenerationOptions({ shorter: true })).toEqual({ shorter: true });
    expect(
      normalizeRegenerationOptions({
        closerToOriginal: true,
        emphasizeRequirementId: " req-rest ",
      })
    ).toEqual({
      closerToOriginal: true,
      emphasizeRequirementId: "req-rest",
    });
  });
});

describe("regenerationConstraintIsValid", () => {
  it("requires emphasize ids to exist on the parsed job", () => {
    expect(regenerationConstraintIsValid({ shorter: true }, ["req-rest"])).toBe(true);
    expect(
      regenerationConstraintIsValid({ emphasizeRequirementId: "req-rest" }, ["req-rest"])
    ).toBe(true);
    expect(
      regenerationConstraintIsValid({ emphasizeRequirementId: "req-missing" }, ["req-rest"])
    ).toBe(false);
  });
});

describe("suggestionReviewErrorCopy", () => {
  it("never includes resume or job-description wording", () => {
    const codes = [
      "not_reviewable",
      "rejected_ungrounded",
      "style_rejected",
      "invalid_constraint",
      "regenerate_failed",
      "blocked_formatting",
      "apply_not_ready",
      "stale",
    ] as const;
    for (const code of codes) {
      const copy = suggestionReviewErrorCopy(code).toLowerCase();
      expect(copy).not.toContain("kubernetes");
      expect(copy).not.toContain("python");
      expect(copy).not.toContain("ats score");
    }
    expect(suggestionReviewErrorCopy("stale").toLowerCase()).toContain("regenerate");
  });
});
