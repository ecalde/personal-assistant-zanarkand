/**
 * ocr-extract Edge Function contract (pure). LLM I/O is injected.
 * Keep request limits aligned with supabase/functions/ocr-extract/index.ts.
 */

import {
  extractedRecipeIsUsable,
  parseExtractedRecipe,
} from "./recipeImport";
import type { ExtractedRecipe } from "./model";

export const OCR_EXTRACT_MAX_TEXT_CHARS = 20_000;
export const OCR_EXTRACT_MIN_TEXT_CHARS = 12;
export const OCR_EXTRACT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const OCR_EXTRACT_MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
export const OCR_EXTRACT_RATE_LIMIT = 10;
export const OCR_EXTRACT_RATE_WINDOW_MS = 60 * 60 * 1000;

export const OCR_EXTRACT_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type OcrExtractImageType = (typeof OCR_EXTRACT_ALLOWED_IMAGE_TYPES)[number];

export const EXTRACTED_RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "servings",
    "cookTimeMinutes",
    "ingredients",
    "steps",
    "equipment",
    "notes",
  ],
  properties: {
    title: { anyOf: [{ type: "string" }, { type: "null" }] },
    servings: { anyOf: [{ type: "number" }, { type: "null" }] },
    cookTimeMinutes: { anyOf: [{ type: "number" }, { type: "null" }] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rawText", "quantity", "unit", "name"],
        properties: {
          rawText: { type: "string" },
          quantity: { anyOf: [{ type: "number" }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          name: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "text"],
        properties: {
          order: { type: "integer" },
          text: { type: "string" },
        },
      },
    },
    equipment: { type: "array", items: { type: "string" } },
    notes: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

export const OCR_EXTRACT_SYSTEM_PROMPT = [
  "You extract structured recipes from photos or pasted text.",
  "Return only fields that are present in the source. Do not invent a title, servings, cook time, ingredients, or steps.",
  "Leave a field null or empty when it is not in the source.",
  "Ingredient rawText must be the verbatim line when possible.",
  "Keep quantities and units as written; do not convert units.",
  "Steps should be in cooking order.",
].join(" ");

export type OcrExtractKind = "text" | "image";

export type OcrLlmInput =
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string; contentType: OcrExtractImageType };

export type OcrExtractRequest = {
  userId: string | null | undefined;
  kind: unknown;
  text?: unknown;
  imageBase64?: unknown;
  contentType?: unknown;
};

export type OcrExtractDeps = {
  callLlm: (input: OcrLlmInput, attempt: 1 | 2) => Promise<unknown>;
  allowRequest?: (userId: string) => boolean | Promise<boolean>;
  openaiConfigured?: boolean;
};

export type OcrExtractSuccess = { ok: true; extracted: ExtractedRecipe };
export type OcrExtractFailure = { ok: false; status: number; error: string };
export type OcrExtractResult = OcrExtractSuccess | OcrExtractFailure;

export function isOcrExtractImageType(value: string): value is OcrExtractImageType {
  return (OCR_EXTRACT_ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

export function validateOcrImageFile(file: { size: number; type: string }): string | null {
  const contentType = file.type.trim().toLowerCase();
  const normalized = contentType === "image/jpg" ? "image/jpeg" : contentType;
  if (!isOcrExtractImageType(normalized)) {
    return "Use a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size <= 0) return "An image file is required.";
  if (file.size > OCR_EXTRACT_MAX_IMAGE_BYTES) return "Image must be 4 MB or smaller.";
  return null;
}

export function validateOcrImageCapture(file: { size: number; type: string }): string | null {
  const contentType = file.type.trim().toLowerCase();
  const normalized = contentType === "image/jpg" ? "image/jpeg" : contentType;
  if (!isOcrExtractImageType(normalized)) {
    return "Use a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size <= 0) return "An image file is required.";
  if (file.size > OCR_EXTRACT_MAX_CAPTURE_BYTES) return "Image is too large to import.";
  return null;
}

export function stripBase64Prefix(value: string): { base64: string; contentType?: string } {
  const trimmed = value.trim().replace(/\s/g, "");
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(trimmed);
  if (match) {
    return { contentType: match[1]?.toLowerCase(), base64: match[2] ?? "" };
  }
  return { base64: trimmed };
}

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export type ParsedOcrExtractRequest = OcrLlmInput | { error: string };

export function parseOcrExtractRequest(request: OcrExtractRequest): ParsedOcrExtractRequest {
  const kind = typeof request.kind === "string" ? request.kind.trim() : "";
  if (kind !== "text" && kind !== "image") {
    return { error: "kind must be text or image." };
  }

  if (kind === "text") {
    if (typeof request.text !== "string") return { error: "text is required." };
    const text = request.text.trim();
    if (text.length < OCR_EXTRACT_MIN_TEXT_CHARS) {
      return { error: `Paste at least ${OCR_EXTRACT_MIN_TEXT_CHARS} characters of recipe text.` };
    }
    if (text.length > OCR_EXTRACT_MAX_TEXT_CHARS) {
      return { error: `Recipe text must be ${OCR_EXTRACT_MAX_TEXT_CHARS} characters or fewer.` };
    }
    return { kind: "text", text };
  }

  if (typeof request.imageBase64 !== "string" || !request.imageBase64.trim()) {
    return { error: "An image is required." };
  }
  const stripped = stripBase64Prefix(request.imageBase64);
  const contentTypeRaw =
    (typeof request.contentType === "string" ? request.contentType.trim().toLowerCase() : "") ||
    stripped.contentType ||
    "";
  const contentType = contentTypeRaw === "image/jpg" ? "image/jpeg" : contentTypeRaw;
  if (!isOcrExtractImageType(contentType)) {
    return { error: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  if (!stripped.base64) return { error: "An image is required." };
  const bytes = estimateBase64Bytes(stripped.base64);
  if (bytes <= 0) return { error: "An image is required." };
  if (bytes > OCR_EXTRACT_MAX_IMAGE_BYTES) {
    return { error: "Image must be 4 MB or smaller." };
  }
  return { kind: "image", imageBase64: stripped.base64, contentType };
}

export function createOcrExtractRateLimiter(options?: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
}): { allow: (userId: string) => boolean } {
  const limit = options?.limit ?? OCR_EXTRACT_RATE_LIMIT;
  const windowMs = options?.windowMs ?? OCR_EXTRACT_RATE_WINDOW_MS;
  const hits = new Map<string, number[]>();

  return {
    allow(userId: string): boolean {
      const now = options?.now?.() ?? Date.now();
      const previous = hits.get(userId) ?? [];
      const recent = previous.filter((stamp) => now - stamp < windowMs);
      if (recent.length >= limit) {
        hits.set(userId, recent);
        return false;
      }
      recent.push(now);
      hits.set(userId, recent);
      return true;
    },
  };
}

async function callLlmSafely(
  callLlm: OcrExtractDeps["callLlm"],
  input: OcrLlmInput,
  attempt: 1 | 2
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await callLlm(input, attempt) };
  } catch {
    return { ok: false };
  }
}

export async function handleOcrExtract(
  request: OcrExtractRequest,
  deps: OcrExtractDeps
): Promise<OcrExtractResult> {
  if (!request.userId || !request.userId.trim()) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  if (deps.openaiConfigured === false) {
    return { ok: false, status: 503, error: "Recipe import is not configured." };
  }

  const parsed = parseOcrExtractRequest(request);
  if ("error" in parsed) {
    return { ok: false, status: 400, error: parsed.error };
  }

  if (deps.allowRequest) {
    const allowed = await deps.allowRequest(request.userId);
    if (!allowed) {
      return { ok: false, status: 429, error: "Too many import requests. Try again later." };
    }
  }

  const first = await callLlmSafely(deps.callLlm, parsed, 1);
  let extractedOrError = first.ok ? parseExtractedRecipe(first.value) : "Extraction failed.";
  if (typeof extractedOrError !== "string" && extractedRecipeIsUsable(extractedOrError)) {
    return { ok: true, extracted: extractedOrError };
  }

  const second = await callLlmSafely(deps.callLlm, parsed, 2);
  extractedOrError = second.ok ? parseExtractedRecipe(second.value) : "Extraction failed.";
  if (typeof extractedOrError === "string") {
    return { ok: false, status: 502, error: "Could not read a recipe from that input." };
  }
  if (!extractedRecipeIsUsable(extractedOrError)) {
    return { ok: false, status: 422, error: "No recipe data found. Try a clearer photo or paste the text." };
  }
  return { ok: true, extracted: extractedOrError };
}
