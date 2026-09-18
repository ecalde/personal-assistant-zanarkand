import { describe, expect, it } from "vitest";
import {
  allowedEvidenceForBlock,
  detectResumeSections,
  extractImportedFacts,
  type FactSourceBlock,
} from "./resumeFacts";
import {
  RESUME_SUGGESTIONS_PIPELINE_VERSION,
  createFakeResumeLLM,
  generateBlockSuggestion,
  hashResumeBlockText,
} from "./resumeSuggestions";
import { layoutFontStyle, type LayoutDocumentBlock } from "./resumeLayout";
import {
  RESUME_LLM_PROMPT_VERSION,
  parsePromptUserJson,
  type ResumeLlmPromptBundle,
  type RewriteBlockUserPayload,
} from "./resumeLlmPrompts";
import type { ParsedJobDescription, ResumeJobSession } from "./resumeModel";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";

const ROLE_A_BULLET = "b-role-a-bullet";
const ROLE_B_BULLET = "b-role-b-bullet";

const IMPORT_BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 \u2013 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 \u2013 2020" },
  { blockId: ROLE_B_BULLET, text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: "b-skills", text: "Python, REST APIs, SQL, Docker" },
];

const PARSED_JOB: ParsedJobDescription = {
  jobTitle: "Backend Engineer",
  company: "Acme",
  domainTags: [],
  requirements: [
    {
      id: "req-k8s",
      text: "Must have Kubernetes experience",
      category: "skill",
      priority: "required",
      normalizedTerms: ["kubernetes"],
      aliases: [],
      salience: 0.9,
    },
    {
      id: "req-rest",
      text: "Must have RESTful services",
      category: "skill",
      priority: "required",
      normalizedTerms: ["restful"],
      aliases: ["rest apis"],
      salience: 0.8,
    },
  ],
  rawText: "Must have Kubernetes. Must have RESTful services.",
  parserVersion: "test-1",
};

function session(overrides: Partial<ResumeJobSession> = {}): ResumeJobSession {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    resumeId: RESUME_ID,
    resumeVersionId: VERSION_ID,
    company: "Acme",
    jobTitle: "Backend Engineer",
    jobDescriptionText: PARSED_JOB.rawText,
    parsedJob: PARSED_JOB,
    matchResult: null,
    retention: "until_replaced",
    applicationId: null,
    archivedAtIso: null,
    createdAtIso: "2026-09-16T00:00:00.000Z",
    updatedAtIso: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function originalText(blockId: string): string {
  const block = IMPORT_BLOCKS.find((item) => item.blockId === blockId);
  if (!block) throw new Error(`missing block ${blockId}`);
  return block.text;
}

describe("hashResumeBlockText", () => {
  it("returns a 64-char lowercase hex digest", async () => {
    const hash = await hashResumeBlockText("Built REST APIs.");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashResumeBlockText("Built REST APIs.")).toBe(hash);
  });
});

describe("generateBlockSuggestion", () => {
  it("returns a grounded pending suggestion when the fake LLM aligns REST terminology", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const scope = detectResumeSections(IMPORT_BLOCKS);
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      scope,
      model: "fake-model",
      llm: createFakeResumeLLM({
        proposedText: "Built RESTful services with Python and Docker for inventory sync.",
        targetRequirementIds: ["req-rest"],
        evidenceIds: [],
        evidenceQuotes: ["Built REST APIs with Python and Docker"],
        reasoning: "Align REST wording with the job description.",
        transformationType: "terminology_alignment",
        confidence: 0.85,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.factualityStatus).toBe("grounded");
    expect(result.suggestion.status).toBe("pending");
    expect(result.suggestion.proposedText).toContain("RESTful");
    expect(result.suggestion.generation).toEqual({
      pipelineVersion: RESUME_SUGGESTIONS_PIPELINE_VERSION,
      promptVersion: RESUME_LLM_PROMPT_VERSION,
      model: "fake-model",
    });
    expect(result.suggestion.layoutConstraint.status).toBe("indeterminate");
    expect(result.suggestion.originalTextHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("attaches a wraps layout report when an injected measurer sees extra lines", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const scope = detectResumeSections(IMPORT_BLOCKS);
    const original = originalText(ROLE_A_BULLET);
    const proposed = `${original} ${"Python ".repeat(40).trim()}`;
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: original,
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      scope,
      model: "fake-model",
      layout: {
        measure: (text) => text.length * 12,
        substitutionActive: false,
        section: {
          pageWidthTwips: 2000,
          pageHeightTwips: 15840,
          marginTopTwips: 0,
          marginRightTwips: 0,
          marginBottomTwips: 0,
          marginLeftTwips: 0,
          headerTwips: null,
          footerTwips: null,
          gutterTwips: null,
        },
      },
      llm: createFakeResumeLLM({
        proposedText: proposed,
        targetRequirementIds: ["req-rest"],
        evidenceIds: [],
        evidenceQuotes: ["Built REST APIs with Python and Docker"],
        reasoning: "Repeat Python already on the bullet.",
        transformationType: "terminology_alignment",
        confidence: 0.8,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.layoutConstraint.status).toBe("wraps");
    expect(result.suggestion.layoutConstraint.estimatedLineCount).toBeGreaterThan(1);
    expect(result.suggestion.layoutConstraint.estimatedPageCount).toBeUndefined();
    expect(result.suggestion.layoutConstraint.fingerprint).toContain("sub:0");
    expect(result.suggestion.layoutConstraint.stale).toBeUndefined();
  });

  it("attaches page_count_changed when the draft would add a page", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const scope = detectResumeSections(IMPORT_BLOCKS);
    const original = originalText(ROLE_A_BULLET);
    const proposed = `${original} ${"Python ".repeat(80).trim()}`;
    const bodyStyle = layoutFontStyle({ fontFamily: "Calibri", fontSizePt: 10 });
    const documentBlocks: LayoutDocumentBlock[] = IMPORT_BLOCKS.map((block) => ({
      blockId: block.blockId,
      text: block.text,
      style: bodyStyle,
    }));
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: original,
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      scope,
      model: "fake-model",
      layout: {
        measure: (text) => text.length * 10,
        substitutionActive: false,
        section: {
          pageWidthTwips: 2000,
          pageHeightTwips: 800,
          marginTopTwips: 0,
          marginRightTwips: 0,
          marginBottomTwips: 0,
          marginLeftTwips: 0,
          headerTwips: null,
          footerTwips: null,
          gutterTwips: null,
        },
        documentBlocks,
        targetBlockId: ROLE_A_BULLET,
      },
      llm: createFakeResumeLLM({
        proposedText: proposed,
        targetRequirementIds: ["req-rest"],
        evidenceIds: [],
        evidenceQuotes: ["Built REST APIs with Python and Docker"],
        reasoning: "Repeat Python already on the bullet.",
        transformationType: "terminology_alignment",
        confidence: 0.8,
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.layoutConstraint.status).toBe("page_count_changed");
    expect(result.suggestion.layoutConstraint.estimatedPageCount).toBeGreaterThan(1);
    expect(result.suggestion.layoutConstraint.fingerprint).toContain("sub:0");
  });

  it("rejects when the fake LLM inserts Kubernetes (Case B gate)", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const scope = detectResumeSections(IMPORT_BLOCKS);
    expect(
      allowedEvidenceForBlock(ledger, ROLE_A_BULLET, { scope }).some(
        (fact) => fact.normalized === "kubernetes"
      )
    ).toBe(false);

    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      scope,
      model: "fake-model",
      llm: createFakeResumeLLM({
        proposedText:
          "Built REST APIs with Python, Docker, and Kubernetes for inventory sync.",
        reasoning: "Add Kubernetes because the JD asks for it.",
        transformationType: "terminology_alignment",
        confidence: 0.9,
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("rejected_ungrounded");
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(result.violations?.some((item) => item.normalized === "kubernetes")).toBe(true);
  });

  it("rejects schema-invalid LLM output", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      model: "fake-model",
      llm: createFakeResumeLLM({ extraField: true }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("schema_invalid");
    expect(result.schemaError?.code).toBe("extra_fields");
  });

  it("rejects style-lint failures after grounding", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      model: "fake-model",
      llm: createFakeResumeLLM({
        proposedText: "Leveraged Python and Docker to build REST APIs for inventory sync.",
        transformationType: "terminology_alignment",
        confidence: 0.7,
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("style_rejected");
    expect(result.lint?.findings.some((finding) => finding.code === "banned_phrase")).toBe(true);
  });

  it("puts regenerate constraints in the user JSON and still re-grounds", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    let captured: ResumeLlmPromptBundle | null = null;
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      model: "fake-model",
      regeneration: { shorter: true, closerToOriginal: true, emphasizeRequirementId: "req-rest" },
      llm: {
        rewriteBlock: async (bundle) => {
          captured = bundle;
          return {
            proposedText: "Built REST APIs with Python and Docker.",
            targetRequirementIds: ["req-rest"],
            evidenceIds: [],
            evidenceQuotes: ["REST APIs"],
            reasoning: "Shorter and closer to the original.",
            transformationType: "concise",
            confidence: 0.7,
          };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.status).toBe("pending");
    expect(captured).not.toBeNull();
    const payload = parsePromptUserJson(captured!) as RewriteBlockUserPayload;
    expect(payload.constraints.regeneration).toEqual({
      shorter: true,
      closerToOriginal: true,
      emphasizeRequirementId: "req-rest",
    });
  });

  it("rejects regenerate emphasize ids that are not on the parsed job", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = await generateBlockSuggestion({
      blockId: ROLE_A_BULLET,
      originalText: originalText(ROLE_A_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      model: "fake-model",
      regeneration: { emphasizeRequirementId: "req-missing" },
      llm: createFakeResumeLLM({
        proposedText: "Built REST APIs with Python and Docker for inventory sync.",
      }),
    });
    expect(result).toEqual({ ok: false, code: "invalid_constraint" });
  });

  it("maps LLM transport failures to llm_error without throwing", async () => {
    const ledger = extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
    const result = await generateBlockSuggestion({
      blockId: ROLE_B_BULLET,
      originalText: originalText(ROLE_B_BULLET),
      blocks: IMPORT_BLOCKS,
      ledger,
      session: session(),
      model: "fake-model",
      llm: {
        rewriteBlock: async () => {
          throw new Error("down");
        },
      },
    });

    expect(result).toEqual({ ok: false, code: "llm_error" });
  });
});
