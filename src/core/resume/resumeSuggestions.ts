/**
 * Single-block suggestion generator (Phase 6F).
 *
 * One block at a time: prompt → schema → grounding → unicode/style lint →
 * optional persist. Layout estimate (Wave 8) and suggestion UI (Wave 7) belong
 * to later phases. Do not log resume or JD text.
 */

import { chatCompletion } from "../../lib/ollamaClient";
import { sha256HexOfBytes } from "./resumeAutosave";
import {
  allowedEvidenceForBlock,
  detectResumeSections,
  type FactSourceBlock,
  type ResumeDocumentSections,
} from "./resumeFacts";
import { groundProposedText, type ResumeGroundingViolation } from "./resumeGrounding";
import {
  RESUME_LLM_PROMPT_VERSION,
  buildRewriteBlockPrompt,
  type ResumeLlmPromptBundle,
} from "./resumeLlmPrompts";
import {
  parseLlmJsonValue,
  parseRewriteBlockLlmJson,
  type ResumeLlmParseFailure,
  type RewriteBlockLlmOutput,
} from "./resumeLlmSchema";
import type {
  LayoutReport,
  Requirement,
  ResumeFactLedger,
  ResumeJobSession,
  ResumeSuggestion,
  SuggestionGeneration,
} from "./resumeModel";
import { prepareSuggestionText, type ResumeStyleLintResult } from "./resumeStyleLint";

export const RESUME_SUGGESTIONS_PIPELINE_VERSION = "resume-suggestions-1";

export type ResumeLLM = {
  rewriteBlock(bundle: ResumeLlmPromptBundle): Promise<unknown>;
};

export type GenerateBlockSuggestionFailureCode =
  | "llm_error"
  | "schema_invalid"
  | "rejected_ungrounded"
  | "style_rejected";

export type GenerateBlockSuggestionInput = {
  blockId: string;
  originalText: string;
  blocks: readonly FactSourceBlock[];
  ledger: ResumeFactLedger;
  session: ResumeJobSession;
  llm: ResumeLLM;
  model: string;
  scope?: ResumeDocumentSections;
  createId?: () => string;
  /** Recorded on the suggestion row (RES-VER-001). */
  quantization?: string;
};

export type GenerateBlockSuggestionSuccess = {
  ok: true;
  suggestion: ResumeSuggestion;
};

export type GenerateBlockSuggestionFailure = {
  ok: false;
  code: GenerateBlockSuggestionFailureCode;
  schemaError?: ResumeLlmParseFailure;
  factualityStatus?: "rejected_ungrounded";
  violations?: ResumeGroundingViolation[];
  lint?: ResumeStyleLintResult;
};

export type GenerateBlockSuggestionResult =
  | GenerateBlockSuggestionSuccess
  | GenerateBlockSuggestionFailure;

export function createFakeResumeLLM(response: unknown): ResumeLLM {
  return {
    rewriteBlock: async () => response,
  };
}

export function createOllamaResumeLLM(options: {
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  RequestCtor?: typeof Request;
}): ResumeLLM {
  return {
    rewriteBlock: async (bundle) =>
      chatCompletion({
        model: options.model,
        baseUrl: options.baseUrl,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        RequestCtor: options.RequestCtor,
        format: "json",
        messages: bundle.messages,
      }),
  };
}

export async function hashResumeBlockText(text: string): Promise<string> {
  return sha256HexOfBytes(new TextEncoder().encode(text));
}

function requirementsForSession(session: ResumeJobSession): Requirement[] {
  return session.parsedJob?.requirements ?? [];
}

function defaultLayoutReport(characterCount: number): LayoutReport {
  return {
    status: "indeterminate",
    characterCount,
  };
}

function buildGeneration(model: string, quantization?: string): SuggestionGeneration {
  return {
    pipelineVersion: RESUME_SUGGESTIONS_PIPELINE_VERSION,
    promptVersion: RESUME_LLM_PROMPT_VERSION,
    model: model.trim(),
    ...(quantization?.trim() ? { quantization: quantization.trim() } : {}),
  };
}

function buildSuggestion(
  input: GenerateBlockSuggestionInput,
  llmOutput: RewriteBlockLlmOutput,
  proposedText: string,
  originalTextHash: string
): ResumeSuggestion {
  const createId = input.createId ?? (() => crypto.randomUUID());
  return {
    id: createId(),
    sourceBlockId: input.blockId,
    originalText: input.originalText,
    originalTextHash,
    proposedText,
    targetRequirementIds: [...llmOutput.targetRequirementIds],
    evidenceIds: [...llmOutput.evidenceIds],
    evidenceQuotes: [...llmOutput.evidenceQuotes],
    reasoning: llmOutput.reasoning,
    transformationType: llmOutput.transformationType,
    confidence: llmOutput.confidence,
    factualityStatus: "grounded",
    layoutConstraint: defaultLayoutReport(proposedText.length),
    status: "pending",
    generation: buildGeneration(input.model, input.quantization),
  };
}

/**
 * Generate one grounded suggestion for a block. Failed gates are not Acceptable
 * and are returned without a suggestion row (architecture §25).
 */
export async function generateBlockSuggestion(
  input: GenerateBlockSuggestionInput
): Promise<GenerateBlockSuggestionResult> {
  const scope = input.scope ?? detectResumeSections(input.blocks);
  const evidence = allowedEvidenceForBlock(input.ledger, input.blockId, { scope });
  const requirements = requirementsForSession(input.session);

  const prompt = buildRewriteBlockPrompt({
    evidence: evidence.map((fact) => ({
      id: fact.id,
      type: fact.type,
      verbatim: fact.verbatim,
    })),
    jobDescription: {
      rawText: input.session.jobDescriptionText,
      company: input.session.company,
      jobTitle: input.session.jobTitle,
      requirements: requirements.map((requirement) => ({
        id: requirement.id,
        text: requirement.text,
        category: requirement.category,
        priority: requirement.priority,
      })),
    },
    block: {
      id: input.blockId,
      originalText: input.originalText,
    },
  });

  let rawLlm: unknown;
  try {
    rawLlm = await input.llm.rewriteBlock(prompt);
  } catch {
    return { ok: false, code: "llm_error" };
  }

  const jsonParsed = parseLlmJsonValue(rawLlm);
  if (!jsonParsed.ok) {
    return { ok: false, code: "schema_invalid", schemaError: jsonParsed };
  }

  const schemaParsed = parseRewriteBlockLlmJson(jsonParsed.value);
  if (!schemaParsed.ok) {
    return { ok: false, code: "schema_invalid", schemaError: schemaParsed };
  }

  const grounding = groundProposedText({
    proposedText: schemaParsed.value.proposedText,
    originalText: input.originalText,
    blockId: input.blockId,
    ledger: input.ledger,
    scope,
  });
  if (grounding.factualityStatus !== "grounded") {
    return {
      ok: false,
      code: "rejected_ungrounded",
      factualityStatus: "rejected_ungrounded",
      violations: grounding.violations,
    };
  }

  const prepared = prepareSuggestionText(schemaParsed.value.proposedText);
  if (!prepared.lint.ok) {
    return { ok: false, code: "style_rejected", lint: prepared.lint };
  }

  const originalTextHash = await hashResumeBlockText(input.originalText);
  return {
    ok: true,
    suggestion: buildSuggestion(input, schemaParsed.value, prepared.text, originalTextHash),
  };
}
