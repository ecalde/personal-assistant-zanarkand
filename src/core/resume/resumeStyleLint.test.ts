import { describe, expect, it } from "vitest";
import { FORBIDDEN_HIDDEN_ATS_TRICKS } from "./resumeLlmPrompts";
import {
  BANNED_PHRASES,
  lintSuggestionText,
  prepareSuggestionText,
  RESUME_STYLE_LINT_VERSION,
} from "./resumeStyleLint";

const ZWSP = "\u200b";
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const CLEAN = "Built REST APIs for inventory sync using Python and AWS.";

function codes(raw: string) {
  return prepareSuggestionText(raw).lint.findings.map((finding) => finding.code);
}

describe("RESUME_STYLE_LINT_VERSION", () => {
  it("is a frozen pipeline id for later suggestion rows", () => {
    expect(RESUME_STYLE_LINT_VERSION).toBe("resume-style-lint-1");
  });
});

describe("prepareSuggestionText unicode", () => {
  it("strips ZWSP and other Cf stuffing before lint", () => {
    const prepared = prepareSuggestionText(`Built${ZWSP} REST${ZWSP} APIs using Python.`);
    expect(prepared.text).toBe("Built REST APIs using Python.");
    expect(prepared.sanitation.changes).toContain("invisible_format_removed");
    expect(prepared.text).not.toContain(ZWSP);
    expect(prepared.lint.ok).toBe(true);
  });

  it("NFC-normalizes generated output", () => {
    const prepared = prepareSuggestionText("Built Andre\u0301s APIs using Python.");
    expect(prepared.text).toBe("Built Andrés APIs using Python.");
    expect(prepared.sanitation.changes).toContain("nfc_normalized");
    expect(prepared.lint.ok).toBe(true);
  });

  it("folds NBSP and line breaks so a suggestion stays one paragraph", () => {
    const prepared = prepareSuggestionText("Built REST APIs\nusing\u00a0Python.");
    expect(prepared.text).toBe("Built REST APIs using Python.");
    expect(prepared.lint.ok).toBe(true);
  });

  it("fails empty after sanitation of only invisibles", () => {
    const prepared = prepareSuggestionText(`${ZWSP}\u00a0`);
    expect(prepared.text).toBe("");
    expect(prepared.lint.ok).toBe(false);
    expect(codes(`${ZWSP}\u00a0`)).toEqual(["empty"]);
  });
});

describe("lintSuggestionText natural writing (RES-STY-001)", () => {
  it("accepts a clean past-tense bullet", () => {
    expect(lintSuggestionText(CLEAN)).toEqual({ ok: true, findings: [] });
    expect(prepareSuggestionText(CLEAN).lint.ok).toBe(true);
  });

  it("rejects an em dash", () => {
    const text = `Built REST APIs ${EM_DASH} inventory sync using Python.`;
    const result = lintSuggestionText(text);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([{ code: "em_dash" }]);
    expect(prepareSuggestionText(text).text).toContain(EM_DASH);
  });

  it("allows an en dash date range", () => {
    const text = `Built REST APIs for the 2020 ${EN_DASH} 2024 inventory program using Python.`;
    expect(lintSuggestionText(text).ok).toBe(true);
    expect(prepareSuggestionText(text).text).toContain(EN_DASH);
  });

  it("rejects leveraged and related banned phrases", () => {
    expect(BANNED_PHRASES).toContain("leveraged");
    const result = lintSuggestionText("Leveraged Python to build REST APIs.");
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.code === "banned_phrase")).toBe(true);
    expect(result.findings.some((finding) => finding.token === "leveraged")).toBe(true);
    expect(lintSuggestionText("Utilized AWS for nightly jobs.").ok).toBe(false);
  });

  it("does not treat 'lever' as leveraged", () => {
    expect(lintSuggestionText("Built a lever arm for the warehouse gate using Python.").ok).toBe(
      true
    );
  });

  it("rejects first person", () => {
    expect(codes("I built REST APIs using Python.")).toContain("first_person");
    expect(codes("Improved APIs on my team using Python.")).toContain("first_person");
    expect(codes("We shipped REST APIs using Python.")).toContain("first_person");
    expect(lintSuggestionText(CLEAN).ok).toBe(true);
  });

  it("does not treat API as the pronoun I", () => {
    expect(lintSuggestionText("Shipped an API using Python.").ok).toBe(true);
  });

  it("rejects three consecutive fluff adjectives", () => {
    const piled =
      "Dynamic passionate innovative engineer who built REST APIs using Python.";
    expect(codes(piled)).toContain("adjective_pileup");
    expect(
      lintSuggestionText("Proactive engineer who built REST APIs using Python.").ok
    ).toBe(true);
  });
});

describe("hidden ATS tricks (RES-ATS-002)", () => {
  it("reuses the prompt ban list and rejects those phrases in outputs", () => {
    for (const trick of FORBIDDEN_HIDDEN_ATS_TRICKS) {
      const result = lintSuggestionText(`Built REST APIs. Tip: use ${trick} for parsers.`);
      expect(result.ok, trick).toBe(false);
      expect(
        result.findings.some((finding) => finding.code === "hidden_ats"),
        trick
      ).toBe(true);
    }
  });

  it("rejects w:vanish and white/1pt CSS-shaped tricks", () => {
    expect(codes("Hide keywords with w:vanish in the footer.")).toContain("hidden_ats");
    expect(codes("color: white 1pt off-page keywords Python Kubernetes.")).toContain(
      "hidden_ats"
    );
  });

  it("ZWSP stuffing is neutralized rather than treated as a hidden-ATS phrase", () => {
    const prepared = prepareSuggestionText(`Built REST APIs using Python${ZWSP} and AWS.`);
    expect(prepared.lint.ok).toBe(true);
    expect(prepared.text).toBe("Built REST APIs using Python and AWS.");
  });
});

describe("prepareSuggestionText composition", () => {
  it("reports sanitation and lint independently", () => {
    const prepared = prepareSuggestionText(
      `I leveraged Python ${EM_DASH} ${ZWSP}inventory sync.`
    );
    expect(prepared.text).toBe(`I leveraged Python ${EM_DASH} inventory sync.`);
    expect(prepared.sanitation.changes).toContain("invisible_format_removed");
    expect(prepared.lint.ok).toBe(false);
    expect(prepared.lint.findings.map((finding) => finding.code).sort()).toEqual(
      ["banned_phrase", "em_dash", "first_person"].sort()
    );
  });

  it("does not include the full suggestion in finding tokens", () => {
    const long = `Leveraged Python to ${"x".repeat(80)}`;
    const prepared = prepareSuggestionText(long);
    for (const finding of prepared.lint.findings) {
      expect(finding.token ?? "").not.toContain("xxx");
      expect((finding.token ?? "").length).toBeLessThan(40);
    }
  });
});
