import { describe, expect, it } from "vitest";
import {
  EVIDENCE_MAP_JSON_SCHEMA,
  JD_CLASSIFY_JSON_SCHEMA,
  MAX_REWRITE_PROPOSED_CHARS,
  REWRITE_BLOCK_JSON_SCHEMA,
  parseEvidenceMapLlmJson,
  parseJdClassifyLlmJson,
  parseLlmJsonValue,
  parseRewriteBlockLlmJson,
} from "./resumeLlmSchema";

function validRewrite(overrides: Record<string, unknown> = {}) {
  return {
    proposedText: "Built REST APIs for internal tools.",
    targetRequirementIds: ["req-1"],
    evidenceIds: ["fact-1"],
    evidenceQuotes: ["Built REST APIs"],
    reasoning: "Align terminology with the job.",
    transformationType: "terminology_alignment",
    confidence: 0.8,
    ...overrides,
  };
}

describe("REWRITE_BLOCK_JSON_SCHEMA", () => {
  it("forbids extra properties and requires proposedText", () => {
    expect(REWRITE_BLOCK_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(REWRITE_BLOCK_JSON_SCHEMA.required).toEqual(["proposedText"]);
    expect(JD_CLASSIFY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(EVIDENCE_MAP_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("parseRewriteBlockLlmJson", () => {
  it("accepts a complete rewrite object", () => {
    const parsed = parseRewriteBlockLlmJson(validRewrite());
    expect(parsed).toEqual({
      ok: true,
      value: {
        proposedText: "Built REST APIs for internal tools.",
        targetRequirementIds: ["req-1"],
        evidenceIds: ["fact-1"],
        evidenceQuotes: ["Built REST APIs"],
        reasoning: "Align terminology with the job.",
        transformationType: "terminology_alignment",
        confidence: 0.8,
      },
    });
  });

  it("accepts a JSON string of the same object", () => {
    const parsed = parseRewriteBlockLlmJson(JSON.stringify(validRewrite()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.proposedText).toBe("Built REST APIs for internal tools.");
  });

  it("accepts proposedText alone and defaults the rest", () => {
    const parsed = parseRewriteBlockLlmJson({ proposedText: "  Shipped APIs  " });
    expect(parsed).toEqual({
      ok: true,
      value: {
        proposedText: "Shipped APIs",
        targetRequirementIds: [],
        evidenceIds: [],
        evidenceQuotes: [],
        reasoning: "",
        transformationType: "other",
        confidence: 0,
      },
    });
  });

  it("rejects missing proposedText", () => {
    const { proposedText: _drop, ...rest } = validRewrite();
    void _drop;
    expect(parseRewriteBlockLlmJson(rest)).toEqual({
      ok: false,
      code: "missing_proposed_text",
      field: "proposedText",
    });
  });

  it("rejects extra fields", () => {
    expect(parseRewriteBlockLlmJson(validRewrite({ originalText: "Built APIs" }))).toEqual({
      ok: false,
      code: "extra_fields",
      field: "originalText",
    });
    expect(parseRewriteBlockLlmJson(validRewrite({ factualityStatus: "grounded" }))).toEqual({
      ok: false,
      code: "extra_fields",
      field: "factualityStatus",
    });
    expect(parseRewriteBlockLlmJson(validRewrite({ markdown: true }))).toEqual({
      ok: false,
      code: "extra_fields",
      field: "markdown",
    });
  });

  it("rejects empty proposedText", () => {
    expect(parseRewriteBlockLlmJson({ proposedText: "   " })).toEqual({
      ok: false,
      code: "empty_proposed_text",
      field: "proposedText",
    });
  });

  it("rejects a non-string proposedText", () => {
    expect(parseRewriteBlockLlmJson({ proposedText: 12 })).toEqual({
      ok: false,
      code: "invalid_field",
      field: "proposedText",
    });
  });

  it("rejects an oversized proposedText", () => {
    expect(
      parseRewriteBlockLlmJson({ proposedText: "x".repeat(MAX_REWRITE_PROPOSED_CHARS + 1) })
    ).toEqual({
      ok: false,
      code: "invalid_field",
      field: "proposedText",
    });
  });

  it("rejects invalid transformationType and confidence", () => {
    expect(parseRewriteBlockLlmJson(validRewrite({ transformationType: "invent" }))).toEqual({
      ok: false,
      code: "invalid_field",
      field: "transformationType",
    });
    expect(parseRewriteBlockLlmJson(validRewrite({ confidence: 1.2 }))).toEqual({
      ok: false,
      code: "invalid_field",
      field: "confidence",
    });
    expect(parseRewriteBlockLlmJson(validRewrite({ confidence: "high" }))).toEqual({
      ok: false,
      code: "invalid_field",
      field: "confidence",
    });
  });

  it("rejects non-object roots and invalid JSON", () => {
    expect(parseRewriteBlockLlmJson(null)).toEqual({ ok: false, code: "not_object" });
    expect(parseRewriteBlockLlmJson(["proposedText"])).toEqual({ ok: false, code: "not_object" });
    expect(parseRewriteBlockLlmJson("{not json")).toEqual({ ok: false, code: "not_json" });
    expect(parseRewriteBlockLlmJson("```json\n{}\n```")).toEqual({ ok: false, code: "not_json" });
  });

  it("does not put payload text on the failure object", () => {
    const secret = "Kubernetes-secret-claim";
    const failed = parseRewriteBlockLlmJson({ proposedText: secret, extra: true });
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain(secret);
  });
});

describe("parseJdClassifyLlmJson", () => {
  it("accepts labeled leftover bullets", () => {
    const parsed = parseJdClassifyLlmJson({
      classifications: [{ text: "Own the on-call rotation", category: "responsibility" }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.classifications[0]?.category).toBe("responsibility");
    }
  });

  it("rejects extra fields on the root or an item", () => {
    expect(parseJdClassifyLlmJson({ classifications: [], skill: "Kubernetes" })).toEqual({
      ok: false,
      code: "extra_fields",
      field: "skill",
    });
    expect(
      parseJdClassifyLlmJson({
        classifications: [{ text: "Python", category: "skill", invented: true }],
      })
    ).toEqual({
      ok: false,
      code: "extra_fields",
      field: "invented",
    });
  });
});

describe("parseEvidenceMapLlmJson", () => {
  it("accepts yes/no/uncertain with a quote", () => {
    expect(parseEvidenceMapLlmJson({ verdict: "yes", quote: "REST APIs" })).toEqual({
      ok: true,
      value: { verdict: "yes", quote: "REST APIs" },
    });
  });

  it("rejects extra fields and unknown verdicts", () => {
    expect(parseEvidenceMapLlmJson({ verdict: "yes", quote: "REST", score: 99 })).toEqual({
      ok: false,
      code: "extra_fields",
      field: "score",
    });
    expect(parseEvidenceMapLlmJson({ verdict: "maybe", quote: "REST" })).toEqual({
      ok: false,
      code: "invalid_field",
      field: "verdict",
    });
  });
});

describe("parseLlmJsonValue", () => {
  it("passes objects through and parses JSON strings", () => {
    expect(parseLlmJsonValue({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
    expect(parseLlmJsonValue("{\"a\":1}")).toEqual({ ok: true, value: { a: 1 } });
  });
});
