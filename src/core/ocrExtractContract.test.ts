import { describe, expect, it, vi } from "vitest";
import {
  createOcrExtractRateLimiter,
  estimateBase64Bytes,
  handleOcrExtract,
  OCR_EXTRACT_MAX_TEXT_CHARS,
  OCR_EXTRACT_MIN_TEXT_CHARS,
  parseOcrExtractRequest,
  stripBase64Prefix,
  validateOcrImageFile,
} from "./ocrExtractContract";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const VALID_EXTRACTED = {
  title: "Tomato toast",
  servings: 1,
  cookTimeMinutes: 10,
  ingredients: [{ rawText: "1 tomato", quantity: 1, unit: null, name: "tomato" }],
  steps: [{ order: 0, text: "Toast the bread and add tomato." }],
  equipment: ["Toaster"],
  notes: null,
};

const RECIPE_TEXT = "Tomato toast\n1 tomato\nToast the bread and add tomato.";

describe("parseOcrExtractRequest", () => {
  it("accepts text and routes image payloads", () => {
    expect(parseOcrExtractRequest({ userId: USER_ID, kind: "text", text: RECIPE_TEXT })).toEqual({
      kind: "text",
      text: RECIPE_TEXT,
    });
    const image = parseOcrExtractRequest({
      userId: USER_ID,
      kind: "image",
      imageBase64: "data:image/jpeg;base64,aGVsbG8=",
      contentType: "image/jpeg",
    });
    expect(image).toMatchObject({ kind: "image", contentType: "image/jpeg" });
    if ("error" in image) return;
    if (image.kind === "image") expect(image.imageBase64).toBe("aGVsbG8=");
  });

  it("rejects invalid kind, short text, and bad images", () => {
    expect(parseOcrExtractRequest({ userId: USER_ID, kind: "pdf" })).toEqual({
      error: "kind must be text or image.",
    });
    expect(parseOcrExtractRequest({ userId: USER_ID, kind: "text", text: "short" })).toMatchObject({
      error: expect.stringMatching(/at least/),
    });
    expect(
      parseOcrExtractRequest({
        userId: USER_ID,
        kind: "image",
        imageBase64: "abc",
        contentType: "application/pdf",
      })
    ).toMatchObject({ error: expect.stringMatching(/JPEG/) });
  });
});

describe("image helpers", () => {
  it("strips data-URL prefixes and estimates decoded size", () => {
    expect(stripBase64Prefix("data:image/png;base64,abcd")).toEqual({
      contentType: "image/png",
      base64: "abcd",
    });
    expect(estimateBase64Bytes("aGVsbG8=")).toBe(5);
    expect(validateOcrImageFile({ size: 12, type: "image/gif" })).toBeNull();
    expect(validateOcrImageFile({ size: 12, type: "image/heic" })).toMatch(/JPEG/);
  });
});

describe("handleOcrExtract", () => {
  it("rejects unauthenticated callers without calling the model", async () => {
    const callLlm = vi.fn();
    const result = await handleOcrExtract(
      { userId: null, kind: "text", text: RECIPE_TEXT },
      { callLlm }
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Authentication required." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 503 when OpenAI is not configured", async () => {
    const callLlm = vi.fn();
    const result = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm, openaiConfigured: false }
    );
    expect(result).toEqual({ ok: false, status: 503, error: "Recipe import is not configured." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("routes text vs image to the LLM", async () => {
    const callLlm = vi.fn().mockResolvedValue(VALID_EXTRACTED);
    const textResult = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm }
    );
    expect(textResult.ok).toBe(true);
    expect(callLlm).toHaveBeenCalledWith({ kind: "text", text: RECIPE_TEXT }, 1);

    callLlm.mockClear();
    const imageResult = await handleOcrExtract(
      {
        userId: USER_ID,
        kind: "image",
        imageBase64: "aGVsbG8=",
        contentType: "image/png",
      },
      { callLlm }
    );
    expect(imageResult.ok).toBe(true);
    expect(callLlm.mock.calls[0]?.[0]).toMatchObject({ kind: "image", contentType: "image/png" });
  });

  it("retries once on malformed output then succeeds", async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce({ nope: true })
      .mockResolvedValueOnce(VALID_EXTRACTED);
    const result = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extracted.title).toBe("Tomato toast");
    expect(callLlm).toHaveBeenCalledTimes(2);
    expect(callLlm).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: "text" }), 2);
  });

  it("returns 502 when the retry is still malformed", async () => {
    const callLlm = vi.fn().mockResolvedValue({ title: "only" });
    const result = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm }
    );
    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Could not read a recipe from that input.",
    });
    expect(callLlm).toHaveBeenCalledTimes(2);
  });

  it("returns 422 when extraction is empty after retry", async () => {
    const empty = {
      title: null,
      servings: null,
      cookTimeMinutes: null,
      ingredients: [],
      steps: [],
      equipment: [],
      notes: null,
    };
    const callLlm = vi.fn().mockResolvedValue(empty);
    const result = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
  });

  it("rate-limits before calling the model", async () => {
    const callLlm = vi.fn();
    const result = await handleOcrExtract(
      { userId: USER_ID, kind: "text", text: RECIPE_TEXT },
      { callLlm, allowRequest: () => false }
    );
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "Too many import requests. Try again later.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("createOcrExtractRateLimiter", () => {
  it("allows up to the limit inside the window", () => {
    let now = 1_000;
    const limiter = createOcrExtractRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => now,
    });
    expect(limiter.allow(USER_ID)).toBe(true);
    expect(limiter.allow(USER_ID)).toBe(true);
    expect(limiter.allow(USER_ID)).toBe(false);
    now = 2_100;
    expect(limiter.allow(USER_ID)).toBe(true);
  });
});

describe("text size limits", () => {
  it("rejects oversized text", () => {
    const text = "x".repeat(OCR_EXTRACT_MAX_TEXT_CHARS + 1);
    expect(parseOcrExtractRequest({ userId: USER_ID, kind: "text", text })).toMatchObject({
      error: expect.stringMatching(/or fewer/),
    });
    expect(OCR_EXTRACT_MIN_TEXT_CHARS).toBeGreaterThan(0);
  });
});
