/**
 * Structured JSON contracts for local Resume LLM output (Phase 6B).
 *
 * Hand validators (no Zod), same idea as `ocrExtractContract.ts`. The model
 * may only return the rewrite / classify / evidence-map payloads defined here.
 * Grounding, style lint, prompts, and Ollama chat belong to later phases.
 *
 * Fail closed: unknown keys are rejected. Do not log resume or JD text.
 */

import {
  isRequirementCategory,
  isSuggestionTransformationType,
  type RequirementCategory,
  type SuggestionTransformationType,
} from "./resumeModel";

export const RESUME_LLM_SCHEMA_VERSION = "resume-llm-json-1";

export const MAX_REWRITE_PROPOSED_CHARS = 2_000;
export const MAX_REWRITE_REASONING_CHARS = 800;
export const MAX_REWRITE_LIST_ITEMS = 32;
export const MAX_REWRITE_ID_CHARS = 128;
export const MAX_REWRITE_QUOTE_CHARS = 500;

export const EVIDENCE_MAP_VERDICTS = ["yes", "no", "uncertain"] as const;
export type EvidenceMapVerdict = (typeof EVIDENCE_MAP_VERDICTS)[number];

const REWRITE_KEYS = [
  "proposedText",
  "targetRequirementIds",
  "evidenceIds",
  "evidenceQuotes",
  "reasoning",
  "transformationType",
  "confidence",
] as const;

const JD_CLASSIFY_KEYS = ["classifications"] as const;
const JD_CLASSIFY_ITEM_KEYS = ["text", "category"] as const;
const EVIDENCE_MAP_KEYS = ["verdict", "quote"] as const;

export type ResumeLlmSchemaCode =
  | "not_object"
  | "not_json"
  | "extra_fields"
  | "missing_proposed_text"
  | "empty_proposed_text"
  | "invalid_field";

export type ResumeLlmParseFailure = {
  ok: false;
  code: ResumeLlmSchemaCode;
  field?: string;
};

export type ResumeLlmParseSuccess<T> = {
  ok: true;
  value: T;
};

export type ResumeLlmParseResult<T> = ResumeLlmParseSuccess<T> | ResumeLlmParseFailure;

/**
 * LLM rewrite payload only. Pipeline fields (id, hashes, factuality, layout,
 * status, generation) are filled later — not accepted from the model.
 */
export type RewriteBlockLlmOutput = {
  proposedText: string;
  targetRequirementIds: string[];
  evidenceIds: string[];
  evidenceQuotes: string[];
  reasoning: string;
  transformationType: SuggestionTransformationType;
  confidence: number;
};

export type JdClassifyLlmItem = {
  text: string;
  category: RequirementCategory;
};

export type JdClassifyLlmOutput = {
  classifications: JdClassifyLlmItem[];
};

export type EvidenceMapLlmOutput = {
  verdict: EvidenceMapVerdict;
  quote: string;
};

/** JSON Schema for Ollama `format` / `format: "json"` (rewrite). */
export const REWRITE_BLOCK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proposedText"],
  properties: {
    proposedText: { type: "string" },
    targetRequirementIds: { type: "array", items: { type: "string" } },
    evidenceIds: { type: "array", items: { type: "string" } },
    evidenceQuotes: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
    transformationType: {
      type: "string",
      enum: [
        "terminology_alignment",
        "reorder_emphasis",
        "concise",
        "split",
        "other",
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const JD_CLASSIFY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classifications"],
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "category"],
        properties: {
          text: { type: "string" },
          category: { type: "string" },
        },
      },
    },
  },
} as const;

export const EVIDENCE_MAP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "quote"],
  properties: {
    verdict: { type: "string", enum: ["yes", "no", "uncertain"] },
    quote: { type: "string" },
  },
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code: ResumeLlmSchemaCode, field?: string): ResumeLlmParseFailure {
  return field ? { ok: false, code, field } : { ok: false, code };
}

function assertAllowedKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[]
): ResumeLlmParseFailure | null {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      return fail("extra_fields", key);
    }
  }
  return null;
}

/**
 * Accept a parsed object or a JSON string. Markdown fences and extra prose
 * are invalid — the model must return JSON only.
 */
export function parseLlmJsonValue(value: unknown): ResumeLlmParseResult<unknown> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fail("not_json");
    try {
      return { ok: true, value: JSON.parse(trimmed) as unknown };
    } catch {
      return fail("not_json");
    }
  }
  return { ok: true, value };
}

function parseIdList(value: unknown, field: string): ResumeLlmParseResult<string[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("invalid_field", field);
  if (value.length > MAX_REWRITE_LIST_ITEMS) return fail("invalid_field", field);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return fail("invalid_field", field);
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > MAX_REWRITE_ID_CHARS) {
      return fail("invalid_field", field);
    }
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseQuoteList(value: unknown, field: string): ResumeLlmParseResult<string[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail("invalid_field", field);
  if (value.length > MAX_REWRITE_LIST_ITEMS) return fail("invalid_field", field);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return fail("invalid_field", field);
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > MAX_REWRITE_QUOTE_CHARS) {
      return fail("invalid_field", field);
    }
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseConfidence(value: unknown): ResumeLlmParseResult<number> {
  if (value === undefined) return { ok: true, value: 0 };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return fail("invalid_field", "confidence");
  }
  return { ok: true, value };
}

export function parseRewriteBlockLlmJson(value: unknown): ResumeLlmParseResult<RewriteBlockLlmOutput> {
  const parsed = parseLlmJsonValue(value);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value)) return fail("not_object");

  const extra = assertAllowedKeys(parsed.value, REWRITE_KEYS);
  if (extra) return extra;

  if (!("proposedText" in parsed.value)) {
    return fail("missing_proposed_text", "proposedText");
  }
  if (typeof parsed.value.proposedText !== "string") {
    return fail("invalid_field", "proposedText");
  }
  const proposedText = parsed.value.proposedText.trim();
  if (!proposedText) return fail("empty_proposed_text", "proposedText");
  if (proposedText.length > MAX_REWRITE_PROPOSED_CHARS) {
    return fail("invalid_field", "proposedText");
  }

  const targetRequirementIds = parseIdList(parsed.value.targetRequirementIds, "targetRequirementIds");
  if (!targetRequirementIds.ok) return targetRequirementIds;
  const evidenceIds = parseIdList(parsed.value.evidenceIds, "evidenceIds");
  if (!evidenceIds.ok) return evidenceIds;
  const evidenceQuotes = parseQuoteList(parsed.value.evidenceQuotes, "evidenceQuotes");
  if (!evidenceQuotes.ok) return evidenceQuotes;

  let reasoning = "";
  if (parsed.value.reasoning !== undefined) {
    if (typeof parsed.value.reasoning !== "string") {
      return fail("invalid_field", "reasoning");
    }
    reasoning = parsed.value.reasoning.trim();
    if (reasoning.length > MAX_REWRITE_REASONING_CHARS) {
      return fail("invalid_field", "reasoning");
    }
  }

  let transformationType: SuggestionTransformationType = "other";
  if (parsed.value.transformationType !== undefined) {
    if (!isSuggestionTransformationType(parsed.value.transformationType)) {
      return fail("invalid_field", "transformationType");
    }
    transformationType = parsed.value.transformationType;
  }

  const confidence = parseConfidence(parsed.value.confidence);
  if (!confidence.ok) return confidence;

  return {
    ok: true,
    value: {
      proposedText,
      targetRequirementIds: targetRequirementIds.value,
      evidenceIds: evidenceIds.value,
      evidenceQuotes: evidenceQuotes.value,
      reasoning,
      transformationType,
      confidence: confidence.value,
    },
  };
}

export function parseJdClassifyLlmJson(value: unknown): ResumeLlmParseResult<JdClassifyLlmOutput> {
  const parsed = parseLlmJsonValue(value);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value)) return fail("not_object");

  const extra = assertAllowedKeys(parsed.value, JD_CLASSIFY_KEYS);
  if (extra) return extra;

  if (!Array.isArray(parsed.value.classifications)) {
    return fail("invalid_field", "classifications");
  }
  if (parsed.value.classifications.length > MAX_REWRITE_LIST_ITEMS) {
    return fail("invalid_field", "classifications");
  }

  const classifications: JdClassifyLlmItem[] = [];
  for (const item of parsed.value.classifications) {
    if (!isPlainObject(item)) return fail("invalid_field", "classifications");
    const itemExtra = assertAllowedKeys(item, JD_CLASSIFY_ITEM_KEYS);
    if (itemExtra) return itemExtra;
    if (typeof item.text !== "string") return fail("invalid_field", "text");
    const text = item.text.trim();
    if (!text || text.length > MAX_REWRITE_QUOTE_CHARS) {
      return fail("invalid_field", "text");
    }
    if (!isRequirementCategory(item.category)) {
      return fail("invalid_field", "category");
    }
    classifications.push({ text, category: item.category });
  }

  return { ok: true, value: { classifications } };
}

export function parseEvidenceMapLlmJson(value: unknown): ResumeLlmParseResult<EvidenceMapLlmOutput> {
  const parsed = parseLlmJsonValue(value);
  if (!parsed.ok) return parsed;
  if (!isPlainObject(parsed.value)) return fail("not_object");

  const extra = assertAllowedKeys(parsed.value, EVIDENCE_MAP_KEYS);
  if (extra) return extra;

  if (!isEvidenceMapVerdict(parsed.value.verdict)) {
    return fail("invalid_field", "verdict");
  }
  if (typeof parsed.value.quote !== "string") {
    return fail("invalid_field", "quote");
  }
  const quote = parsed.value.quote.trim();
  if (quote.length > MAX_REWRITE_QUOTE_CHARS) {
    return fail("invalid_field", "quote");
  }

  return { ok: true, value: { verdict: parsed.value.verdict, quote } };
}

function isEvidenceMapVerdict(value: unknown): value is EvidenceMapVerdict {
  return typeof value === "string" && (EVIDENCE_MAP_VERDICTS as readonly string[]).includes(value);
}
