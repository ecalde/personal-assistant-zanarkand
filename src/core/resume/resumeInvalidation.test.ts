import { describe, expect, it } from "vitest";
import { extractedStructureAfterWorkingEdit, workingVersionRowPatch } from "./resumeAutosave";
import { EMPTY_JOB_SESSION_DRAFT } from "./resumeJobSessionPersist";
import type { MatchResult, ParsedJobDescription, ResumeStructureBlock } from "./resumeModel";
import {
  decideResumeInvalidation,
  emptyReplacedJobSessionFields,
  jobAnalysisClearPatch,
  sessionHasStoredJobAnalysis,
  shouldDropStoredJobAnalysis,
  storedJobAnalysisIsStaleForDraft,
} from "./resumeInvalidation";

const PARSED: ParsedJobDescription = {
  domainTags: [],
  requirements: [],
  rawText: "Must have Kubernetes.",
  parserVersion: "test",
};

const MATCH: MatchResult = {
  matcherVersion: "test",
  requirements: [],
  coverage: {
    requiredTotal: 1,
    requiredExplicitCount: 0,
    requiredExplicitCoverage: 0,
    preferredTotal: 0,
    preferredExplicitCount: 0,
    preferredExplicitCoverage: 0,
    semanticSupportedCount: 0,
    missingRequiredIds: ["req-k8s"],
    uncertainIds: [],
    onPageUnverifiedIds: [],
    contradictedIds: [],
    responsibilityTotal: 0,
    responsibilityAlignedCount: 0,
    responsibilityAlignment: 0,
  },
};

const ANALYZED = {
  company: "Acme",
  jobTitle: "Engineer",
  jobDescriptionText: "Must have Kubernetes.",
  parsedJob: PARSED,
  matchResult: MATCH,
};

function block(text: string): ResumeStructureBlock {
  const id = "44444444-4444-4444-8444-444444444444";
  return {
    order: 0,
    text,
    blockId: id,
    bookmarkName: `pa_${id}`,
    runs: [
      {
        text,
        bold: false,
        italic: false,
        underline: false,
        font: null,
        sizePt: null,
        hyperlinkRelId: null,
      },
    ],
  };
}

describe("decideResumeInvalidation", () => {
  it("archives on replace/reset, drops coverage, and never touches the Word file", () => {
    for (const event of ["jd_replace", "jd_reset"] as const) {
      const decision = decideResumeInvalidation(event);
      expect(decision.archiveJobSession).toBe(true);
      expect(decision.dropCoverage).toBe(true);
      expect(decision.discardPendingSuggestions).toBe(true);
      expect(decision.rerunJobParse).toBe(false);
      expect(decision.rebuildImportLedger).toBe(false);
      expect(decision.refreshMentions).toBe(false);
      expect(decision.documentBytes).toBe("unchanged");
    }
  });

  it("does not re-parse the JD or rebuild the import ledger after a document edit", () => {
    for (const event of ["document_text_edit", "typed_unverified_mention"] as const) {
      const decision = decideResumeInvalidation(event);
      expect(decision.rerunJobParse).toBe(false);
      expect(decision.rebuildImportLedger).toBe(false);
      expect(decision.refreshMentions).toBe(true);
      expect(decision.dropCoverage).toBe(false);
      expect(decision.archiveJobSession).toBe(false);
      expect(decision.documentBytes).toBe("patched_working");
    }
  });

  it("leaves coverage and the document alone on a fail-closed patch", () => {
    const decision = decideResumeInvalidation("fail_closed_patch");
    expect(decision.documentBytes).toBe("forbidden");
    expect(decision.rerunJobParse).toBe(false);
    expect(decision.rebuildImportLedger).toBe(false);
    expect(decision.refreshMentions).toBe(false);
    expect(decision.dropCoverage).toBe(false);
  });

  it("drops stale coverage when JD fields change without re-parsing yet", () => {
    const decision = decideResumeInvalidation("jd_field_change");
    expect(decision.dropCoverage).toBe(true);
    expect(decision.rerunJobParse).toBe(false);
    expect(decision.rebuildImportLedger).toBe(false);
    expect(decision.documentBytes).toBe("unchanged");
  });

  it("lets Analyze re-parse the JD without rewriting the import ledger or DOCX", () => {
    const decision = decideResumeInvalidation("jd_analyze");
    expect(decision.rerunJobParse).toBe(true);
    expect(decision.rebuildImportLedger).toBe(false);
    expect(decision.documentBytes).toBe("unchanged");
    expect(decision.archiveJobSession).toBe(false);
  });
});

describe("storedJobAnalysisIsStaleForDraft", () => {
  it("keeps coverage while the draft still matches the analyzed session", () => {
    expect(sessionHasStoredJobAnalysis(ANALYZED)).toBe(true);
    expect(
      storedJobAnalysisIsStaleForDraft(ANALYZED, {
        company: "Acme",
        jobTitle: "Engineer",
        jobDescriptionText: "Must have Kubernetes.",
      })
    ).toBe(false);
    expect(shouldDropStoredJobAnalysis(ANALYZED, EMPTY_JOB_SESSION_DRAFT)).toBe(true);
  });

  it("treats a JD/company/title edit as stale coverage that must be dropped", () => {
    expect(
      storedJobAnalysisIsStaleForDraft(ANALYZED, {
        company: "Acme",
        jobTitle: "Engineer",
        jobDescriptionText: "Must have Python.",
      })
    ).toBe(true);
    expect(
      storedJobAnalysisIsStaleForDraft(ANALYZED, {
        company: "Globex",
        jobTitle: "Engineer",
        jobDescriptionText: "Must have Kubernetes.",
      })
    ).toBe(true);
    expect(storedJobAnalysisIsStaleForDraft(null, EMPTY_JOB_SESSION_DRAFT)).toBe(false);
    expect(
      storedJobAnalysisIsStaleForDraft(
        { ...ANALYZED, parsedJob: null, matchResult: null },
        EMPTY_JOB_SESSION_DRAFT
      )
    ).toBe(false);
  });
});

describe("replace insert fields", () => {
  it("starts the new session with no parse and no match", () => {
    expect(emptyReplacedJobSessionFields()).toEqual({
      company: "",
      jobTitle: "",
      jobDescriptionText: "",
      parsedJob: null,
      matchResult: null,
    });
    expect(jobAnalysisClearPatch()).toEqual({ parsedJob: null, matchResult: null });
  });
});

describe("working-copy persist vs import ledger", () => {
  it("autosave patches never include import_fact_ledger or job-session analysis", () => {
    const previous = {
      mentionIndex: [],
      graph: { blocks: [block("Built inventory sync.")] },
    };
    const next = extractedStructureAfterWorkingEdit(previous, {
      blocks: [block("Built inventory sync. Kubernetes.")],
    });
    const patch = workingVersionRowPatch({
      workingSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      extractedStructure: next,
    });
    expect(patch).not.toHaveProperty("import_fact_ledger");
    expect(patch).not.toHaveProperty("parsed_job");
    expect(patch).not.toHaveProperty("match_result");
    expect(decideResumeInvalidation("document_text_edit").rebuildImportLedger).toBe(false);
    expect(decideResumeInvalidation("document_text_edit").rerunJobParse).toBe(false);
  });
});
