import { describe, expect, it } from "vitest";
import type { AppPayload } from "../model";
import {
  FACT_PROVENANCES,
  FACT_TYPES,
  LAYOUT_STATUSES,
  RESUME_SOURCE_KINDS,
  SUGGESTION_FACTUALITY_STATUSES,
  SUGGESTION_STATUSES,
  SUGGESTION_TRANSFORMATION_TYPES,
  isFactProvenance,
  isFactType,
  isJobSessionRetention,
  isLayoutStatus,
  isRequirementCategory,
  isRequirementPriority,
  isResumeSourceKind,
  isSuggestionFactualityStatus,
  isSuggestionStatus,
  isSuggestionTransformationType,
  type Resume,
  type ResumeFact,
  type ResumeJobSession,
  type ResumeSuggestion,
  type ResumeVersion,
} from "./resumeModel";

type AppPayloadHasResumeKey = "resumes" extends keyof AppPayload ? true : false;
const _appPayloadHasNoResumeKey: AppPayloadHasResumeKey extends true ? never : true = true;
void _appPayloadHasNoResumeKey;

function assertAcceptsAll<T>(
  guard: (value: unknown) => value is T,
  allowed: readonly T[]
): void {
  for (const value of allowed) {
    expect(guard(value)).toBe(true);
  }
}

describe("resume domain allowlists", () => {
  it("accepts ResumeSourceKind upload | edit | tailor | duplicate only", () => {
    assertAcceptsAll(isResumeSourceKind, RESUME_SOURCE_KINDS);
    expect(isResumeSourceKind("clone")).toBe(false);
    expect(isResumeSourceKind("Upload")).toBe(false);
    expect(isResumeSourceKind("")).toBe(false);
    expect(isResumeSourceKind(null)).toBe(false);
  });

  it("accepts FactProvenance values from architecture §16.2 only", () => {
    assertAcceptsAll(isFactProvenance, FACT_PROVENANCES);
    expect(isFactProvenance("inferred_low")).toBe(false);
    expect(isFactProvenance("imported")).toBe(false);
  });

  it("accepts FactType values from architecture §16.2 only", () => {
    assertAcceptsAll(isFactType, FACT_TYPES);
    expect(isFactType("skill")).toBe(false);
    expect(isFactType("clearance_inferred")).toBe(false);
  });

  it("accepts suggestion status, factuality, transformation, and layout unions", () => {
    assertAcceptsAll(isSuggestionStatus, SUGGESTION_STATUSES);
    expect(isSuggestionStatus("blocked")).toBe(false);
    assertAcceptsAll(isSuggestionFactualityStatus, SUGGESTION_FACTUALITY_STATUSES);
    expect(isSuggestionFactualityStatus("ungrounded")).toBe(false);
    assertAcceptsAll(isSuggestionTransformationType, SUGGESTION_TRANSFORMATION_TYPES);
    expect(isSuggestionTransformationType("rewrite_all")).toBe(false);
    assertAcceptsAll(isLayoutStatus, LAYOUT_STATUSES);
    expect(isLayoutStatus("overflow")).toBe(false);
  });

  it("accepts job-session retention and JD requirement unions", () => {
    expect(isJobSessionRetention("until_replaced")).toBe(true);
    expect(isJobSessionRetention("forever")).toBe(false);
    expect(isRequirementPriority("required")).toBe(true);
    expect(isRequirementPriority("optional")).toBe(false);
    expect(isRequirementCategory("skill")).toBe(true);
    expect(isRequirementCategory("kubernetes")).toBe(false);
  });
});

describe("resume domain records", () => {
  it("shapes ledger, version sourceKind, session, and suggestion without touching AppPayload", () => {
    const fact: ResumeFact = {
      id: "fact-1",
      type: "technology",
      verbatim: "REST APIs",
      normalized: "rest apis",
      sourceBlockIds: ["block-1"],
      provenance: "imported_source",
      inheritedFromFactIds: [],
      presentInWorkingDocument: true,
      firstSeenVersionId: "version-1",
    };
    const resume: Resume = {
      id: "resume-1",
      userId: "user-1",
      name: "Base",
      sourceFilename: "resume.docx",
      isDefault: true,
      activeVersionId: "version-1",
      importFactLedger: { facts: [fact] },
      createdAtIso: "2026-01-01T00:00:00.000Z",
      updatedAtIso: "2026-01-01T00:00:00.000Z",
    };
    const version: ResumeVersion = {
      id: "version-1",
      userId: "user-1",
      resumeId: resume.id,
      parentVersionId: null,
      versionN: 1,
      label: "Base",
      sourceKind: "upload",
      originalStoragePath: "user-1/resume-1/original/abc.docx",
      workingStoragePath: "user-1/resume-1/versions/version-1.docx",
      sha256: "abc",
      extractedStructure: { mentionIndex: [] },
      pageCountEstimated: 1,
      createdAtIso: "2026-01-01T00:00:00.000Z",
    };
    const session: ResumeJobSession = {
      id: "session-1",
      userId: "user-1",
      resumeId: resume.id,
      resumeVersionId: version.id,
      company: "Acme",
      jobTitle: "Engineer",
      jobDescriptionText: "Build APIs",
      parsedJob: null,
      matchResult: null,
      retention: "until_replaced",
      applicationId: null,
      archivedAtIso: null,
      createdAtIso: "2026-01-01T00:00:00.000Z",
      updatedAtIso: "2026-01-01T00:00:00.000Z",
    };
    const suggestion: ResumeSuggestion = {
      id: "sug-1",
      sourceBlockId: "block-1",
      originalText: "Built APIs",
      originalTextHash: "hash",
      proposedText: "Built REST APIs",
      targetRequirementIds: ["req-1"],
      evidenceIds: [fact.id],
      evidenceQuotes: [fact.verbatim],
      reasoning: "Align terminology",
      transformationType: "terminology_alignment",
      confidence: 0.8,
      factualityStatus: "grounded",
      layoutConstraint: { status: "fits" },
      status: "pending",
      generation: {
        pipelineVersion: "1",
        promptVersion: "1",
        model: "local",
      },
    };

    expect(resume.importFactLedger.facts[0]?.provenance).toBe("imported_source");
    expect(version.sourceKind).toBe("upload");
    expect(session.retention).toBe("until_replaced");
    expect(suggestion.status).toBe("pending");
  });
});
