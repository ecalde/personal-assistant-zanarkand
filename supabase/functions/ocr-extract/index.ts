// Phase 9: LLM structured recipe extraction from photo or pasted text.
// Secrets (supabase secrets set): OPENAI_API_KEY
// Optional: OPENAI_MODEL (default gpt-4o-mini)
// Mapping stays aligned with src/core/ocrExtractContract.ts.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXT_CHARS = 20_000;
const MIN_TEXT_CHARS = 12;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const EXTRACTED_RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "servings", "cookTimeMinutes", "ingredients", "steps", "equipment", "notes"],
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
};

const SYSTEM_PROMPT = [
  "You extract structured recipes from photos or pasted text.",
  "Return only fields that are present in the source. Do not invent a title, servings, cook time, ingredients, or steps.",
  "Leave a field null or empty when it is not in the source.",
  "Ingredient rawText must be the verbatim line when possible.",
  "Keep quantities and units as written; do not convert units.",
  "Steps should be in cooking order.",
].join(" ");

type LlmInput =
  | { kind: "text"; text: string }
  | { kind: "image"; imageBase64: string; contentType: string };

const rateHits = new Map<string, number[]>();

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function allowRequest(userId: string): boolean {
  const now = Date.now();
  const previous = rateHits.get(userId) ?? [];
  const recent = previous.filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateHits.set(userId, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(userId, recent);
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripBase64Prefix(value: string): { base64: string; contentType?: string } {
  const trimmed = value.trim().replace(/\s/g, "");
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(trimmed);
  if (match) return { contentType: match[1]?.toLowerCase(), base64: match[2] ?? "" };
  return { base64: trimmed };
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function parseRequest(body: unknown): LlmInput | { error: string } {
  if (!isPlainObject(body)) return { error: "Expected JSON body." };
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  if (kind !== "text" && kind !== "image") return { error: "kind must be text or image." };

  if (kind === "text") {
    if (typeof body.text !== "string") return { error: "text is required." };
    const text = body.text.trim();
    if (text.length < MIN_TEXT_CHARS) {
      return { error: `Paste at least ${MIN_TEXT_CHARS} characters of recipe text.` };
    }
    if (text.length > MAX_TEXT_CHARS) {
      return { error: `Recipe text must be ${MAX_TEXT_CHARS} characters or fewer.` };
    }
    return { kind: "text", text };
  }

  if (typeof body.imageBase64 !== "string" || !body.imageBase64.trim()) {
    return { error: "An image is required." };
  }
  const stripped = stripBase64Prefix(body.imageBase64);
  const contentTypeRaw =
    (typeof body.contentType === "string" ? body.contentType.trim().toLowerCase() : "") ||
    stripped.contentType ||
    "";
  const contentType = contentTypeRaw === "image/jpg" ? "image/jpeg" : contentTypeRaw;
  if (!ALLOWED_TYPES.has(contentType)) {
    return { error: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  if (!stripped.base64) return { error: "An image is required." };
  const bytes = estimateBase64Bytes(stripped.base64);
  if (bytes <= 0) return { error: "An image is required." };
  if (bytes > MAX_IMAGE_BYTES) return { error: "Image must be 4 MB or smaller." };
  return { kind: "image", imageBase64: stripped.base64, contentType };
}

function extractionLooksValid(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const source = isPlainObject(value.extracted)
    ? value.extracted
    : isPlainObject(value.recipe)
      ? value.recipe
      : value;
  if (!Array.isArray(source.ingredients) || !Array.isArray(source.steps)) return false;
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const hasIngredient = source.ingredients.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!isPlainObject(item)) return false;
    return Boolean(
      (typeof item.rawText === "string" && item.rawText.trim()) ||
        (typeof item.name === "string" && item.name.trim())
    );
  });
  const hasStep = source.steps.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!isPlainObject(item)) return false;
    return typeof item.text === "string" && item.text.trim().length > 0;
  });
  return Boolean(title || hasIngredient || hasStep);
}

function unwrapExtracted(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if (Array.isArray(value.ingredients) || Array.isArray(value.steps) || "title" in value) return value;
  if (isPlainObject(value.extracted)) return value.extracted;
  if (isPlainObject(value.recipe)) return value.recipe;
  return value;
}

async function callOpenAi(input: LlmInput, apiKey: string, model: string): Promise<unknown> {
  const userContent =
    input.kind === "text"
      ? input.text
      : [
          {
            type: "text",
            text: "Extract the recipe from this image. Do not invent missing fields.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${input.contentType};base64,${input.imageBase64}` },
          },
        ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_recipe",
          strict: true,
          schema: EXTRACTED_RECIPE_JSON_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI request failed.");
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty extraction.");
  }
  return JSON.parse(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    return json(401, { error: "Authentication required." });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json(401, { error: "Authentication required." });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!openaiKey) {
    return json(503, { error: "Recipe import is not configured." });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Expected JSON body." });
  }

  const parsed = parseRequest(body);
  if ("error" in parsed) {
    return json(400, { error: parsed.error });
  }

  if (!allowRequest(user.id)) {
    return json(429, { error: "Too many import requests. Try again later." });
  }

  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";

  try {
    let extracted = unwrapExtracted(await callOpenAi(parsed, openaiKey, model));
    if (!extractionLooksValid(extracted)) {
      extracted = unwrapExtracted(await callOpenAi(parsed, openaiKey, model));
    }
    if (!isPlainObject(extracted) || !Array.isArray(extracted.ingredients) || !Array.isArray(extracted.steps)) {
      return json(502, { error: "Could not read a recipe from that input." });
    }
    if (!extractionLooksValid(extracted)) {
      return json(422, { error: "No recipe data found. Try a clearer photo or paste the text." });
    }
    return json(200, { extracted });
  } catch {
    return json(502, { error: "Could not read a recipe from that input." });
  }
});
