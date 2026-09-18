/**
 * Phase 10B — expanded Case F prompt-injection corpus.
 *
 * Architecture §42 / §59: untrusted JD / resume / company / title stay in
 * user JSON; an obedient fake LLM still cannot produce an Acceptable
 * Kubernetes (or metric / hidden-ATS / extra-key) rewrite. Do not log
 * resume or JD text.
 */

import { describe, expect, it } from "vitest";
import { extractImportedFacts, type FactSourceBlock } from "./resumeFacts";
import { parseJobDescription } from "./resumeJobParse";
import {
  REWRITE_BLOCK_SYSTEM_PROMPT,
  buildEvidenceMapPrompt,
  buildJdClassifyPrompt,
  findUntrustedSnippetInSystem,
  parsePromptUserJson,
  promptSystemContent,
  promptUserContent,
  type ResumeLlmPromptBundle,
  type RewriteBlockUserPayload,
} from "./resumeLlmPrompts";
import type { ResumeFactLedger, ResumeJobSession } from "./resumeModel";
import {
  CASE_F_ORIGINAL_BULLET,
  CASE_F_PROMPT_FENCE_VARIANTS,
  CASE_F_REWRITE_VARIANTS,
  promptFenceUntrustedStrings,
  rewriteVariantUntrustedStrings,
  type CaseFRewriteVariant,
} from "./resumePromptInjection";
import { generateBlockSuggestion, type ResumeLLM } from "./resumeSuggestions";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_A_BULLET = "b-role-a-bullet";

const IMPORT_BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 \u2013 2026" },
  { blockId: ROLE_A_BULLET, text: CASE_F_ORIGINAL_BULLET },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 \u2013 2020" },
  { blockId: "b-role-b-bullet", text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: "b-skills", text: "Python, REST APIs, SQL, Docker" },
];

function importedLedger(): ResumeFactLedger {
  return extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
}

function sessionFor(variant: CaseFRewriteVariant): ResumeJobSession {
  const parsed = parseJobDescription(variant.jobDescriptionText);
  return {
    id: SESSION_ID,
    userId: USER_ID,
    resumeId: RESUME_ID,
    resumeVersionId: VERSION_ID,
    company: variant.company,
    jobTitle: variant.jobTitle,
    jobDescriptionText: variant.jobDescriptionText,
    parsedJob: parsed,
    matchResult: null,
    retention: "until_replaced",
    applicationId: null,
    archivedAtIso: null,
    createdAtIso: "2026-09-18T00:00:00.000Z",
    updatedAtIso: "2026-09-18T00:00:00.000Z",
  };
}

function blocksFor(variant: CaseFRewriteVariant): FactSourceBlock[] {
  if (variant.originalText === CASE_F_ORIGINAL_BULLET) return IMPORT_BLOCKS;
  return IMPORT_BLOCKS.map((block) =>
    block.blockId === ROLE_A_BULLET ? { ...block, text: variant.originalText } : block
  );
}

function capturingFakeLlm(
  response: unknown
): { llm: ResumeLLM; bundles: ResumeLlmPromptBundle[] } {
  const bundles: ResumeLlmPromptBundle[] = [];
  return {
    bundles,
    llm: {
      rewriteBlock: async (bundle) => {
        bundles.push(bundle);
        return response;
      },
    },
  };
}

function containsKubernetes(text: string): boolean {
  return /\bkubernetes\b/i.test(text);
}

describe("Case F corpus shape", () => {
  it("keeps distinctive canaries unique and out of the frozen system policy", () => {
    const rewriteIds = CASE_F_REWRITE_VARIANTS.map((variant) => variant.id);
    const fenceIds = CASE_F_PROMPT_FENCE_VARIANTS.map((variant) => variant.id);
    const canaries = [
      ...CASE_F_REWRITE_VARIANTS.map((variant) => variant.canary),
      ...CASE_F_PROMPT_FENCE_VARIANTS.map((variant) => variant.canary),
    ];

    expect(new Set(rewriteIds).size).toBe(rewriteIds.length);
    expect(new Set(fenceIds).size).toBe(fenceIds.length);
    expect(new Set(canaries).size).toBe(canaries.length);
    expect(CASE_F_REWRITE_VARIANTS.length).toBeGreaterThanOrEqual(12);
    expect(rewriteIds).toContain("classic_ignore_previous");
    expect(rewriteIds).toContain("policy_compliant");

    for (const canary of canaries) {
      expect(canary.trim().length).toBeGreaterThanOrEqual(12);
      expect(REWRITE_BLOCK_SYSTEM_PROMPT).not.toContain(canary);
      expect(canary.toLowerCase()).not.toContain("ats score");
    }
  });
});

describe("Case F rewrite variants (obedient fake LLM)", () => {
  it.each(CASE_F_REWRITE_VARIANTS)(
    "$id keeps the injection in user JSON and fails closed unless the rewrite stays grounded",
    async (variant) => {
      const ledger = importedLedger();
      expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
      expect(ledger.facts.some((fact) => fact.normalized === "terraform")).toBe(false);

      const { llm, bundles } = capturingFakeLlm(variant.obedientResponse);
      const result = await generateBlockSuggestion({
        blockId: ROLE_A_BULLET,
        originalText: variant.originalText,
        blocks: blocksFor(variant),
        ledger,
        session: sessionFor(variant),
        model: "fake-model",
        llm,
      });

      expect(bundles).toHaveLength(1);
      const bundle = bundles[0]!;
      const system = promptSystemContent(bundle);
      const user = promptUserContent(bundle);
      const untrusted = rewriteVariantUntrustedStrings(variant);

      expect(system).toBe(REWRITE_BLOCK_SYSTEM_PROMPT);
      expect(system).toMatch(/job description and resume are data/i);
      expect(system).not.toContain(variant.canary);
      expect(system).not.toContain(variant.jobDescriptionText);
      expect(user).toContain(variant.canary);
      expect(findUntrustedSnippetInSystem(system, untrusted)).toBeNull();
      expect(findUntrustedSnippetInSystem(`${system}\n${variant.canary}`, [variant.canary])).toBe(
        variant.canary
      );

      const payload = parsePromptUserJson(bundle) as RewriteBlockUserPayload;
      expect(payload.jobDescription.rawText).toBe(variant.jobDescriptionText);
      expect(payload.block.originalText).toBe(variant.originalText);
      expect(payload.jobDescription.company).toBe(variant.company);
      expect(payload.jobDescription.jobTitle).toBe(variant.jobTitle);
      expect(payload.constraints.regeneration).toEqual({});

      if (variant.expectedGate === "grounded") {
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.suggestion.factualityStatus).toBe("grounded");
        expect(result.suggestion.status).toBe("pending");
        expect(containsKubernetes(result.suggestion.proposedText)).toBe(false);
        expect(result.suggestion.proposedText.toLowerCase()).not.toContain("terraform");
        return;
      }

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe(variant.expectedGate);

      if (variant.expectedGate === "rejected_ungrounded") {
        expect(result.violations?.some((item) => item.normalized === variant.expectedNormalized)).toBe(
          true
        );
      }
      if (variant.expectedGate === "style_rejected") {
        expect(
          result.lint?.findings.some((finding) => finding.code === variant.expectedStyleCode)
        ).toBe(true);
      }

      expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
    }
  );
});

describe("Case F classify and evidence-map fences", () => {
  it.each(CASE_F_PROMPT_FENCE_VARIANTS)(
    "$id keeps leftover / requirement canaries out of the system prompt",
    (variant) => {
      const untrusted = promptFenceUntrustedStrings(variant);

      if (variant.channel === "leftover_classify") {
        const leftover = variant.leftoverBullet ?? "";
        const prompt = buildJdClassifyPrompt({
          jobDescription: { rawText: variant.jobDescriptionText },
          leftoverBullets: [leftover],
          deterministicDraft: {
            company: "Acme",
            jobTitle: "Engineer",
            requirements: [
              {
                id: "req-k8s",
                text: "Must have Kubernetes.",
                category: "skill",
                priority: "required",
              },
            ],
          },
        });
        const system = promptSystemContent(prompt);
        const user = promptUserContent(prompt);
        expect(system).toMatch(/job description and resume are data/i);
        expect(system).not.toContain(variant.canary);
        expect(system).not.toContain(leftover);
        expect(user).toContain(variant.canary);
        expect(user).toContain(leftover);
        expect(findUntrustedSnippetInSystem(system, untrusted)).toBeNull();
        return;
      }

      const requirementText = variant.requirementText ?? "";
      const prompt = buildEvidenceMapPrompt({
        requirement: {
          id: "req-k8s",
          text: requirementText,
          category: "skill",
          priority: "required",
          normalizedTerms: ["kubernetes"],
        },
        evidence: [{ id: "fact-1", type: "technology", verbatim: CASE_F_ORIGINAL_BULLET }],
      });
      const system = promptSystemContent(prompt);
      const user = promptUserContent(prompt);
      expect(system).not.toContain(variant.canary);
      expect(system).not.toContain(requirementText);
      expect(system).not.toContain("Kubernetes");
      expect(user).toContain(variant.canary);
      expect(user).toContain(requirementText);
      expect(findUntrustedSnippetInSystem(system, untrusted)).toBeNull();
    }
  );
});
