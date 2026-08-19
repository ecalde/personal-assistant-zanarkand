// Phase 3: proxy recipe image uploads to Sanity.
// Secrets (supabase secrets set): SANITY_PROJECT_ID, SANITY_DATASET, SANITY_WRITE_TOKEN
// Mirrors src/core/sanityUploadContract.ts — keep validation aligned.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createClient as createSanityClient } from "npm:@sanity/client@7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANITY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const SANITY_UPLOAD_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SanityImageRef = {
  assetRef: string;
  url: string;
  lqip?: string;
  width?: number;
  height?: number;
  alt?: string;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function assetToImageRef(
  asset: {
    _id?: string;
    url?: string;
    metadata?: {
      lqip?: string;
      dimensions?: { width?: number; height?: number };
    };
  },
  alt?: string
): SanityImageRef {
  const assetRef = asset._id?.trim();
  const url = asset.url?.trim();
  if (!assetRef || !url) {
    throw new Error("Sanity upload did not return an asset reference.");
  }
  const ref: SanityImageRef = { assetRef, url };
  const lqip = asset.metadata?.lqip?.trim();
  if (lqip) ref.lqip = lqip;
  const width = asset.metadata?.dimensions?.width;
  const height = asset.metadata?.dimensions?.height;
  if (typeof width === "number" && Number.isInteger(width) && width > 0) ref.width = width;
  if (typeof height === "number" && Number.isInteger(height) && height > 0) ref.height = height;
  const trimmedAlt = alt?.trim();
  if (trimmedAlt) ref.alt = trimmedAlt;
  return ref;
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

  const projectId = Deno.env.get("SANITY_PROJECT_ID")?.trim();
  const dataset = Deno.env.get("SANITY_DATASET")?.trim() || "production";
  const token = Deno.env.get("SANITY_WRITE_TOKEN")?.trim();
  if (!projectId || !token) {
    return json(503, { error: "Sanity upload is not configured." });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Expected multipart form data." });
  }

  const kind = String(form.get("kind") ?? "").trim();
  if (kind !== "hero" && kind !== "gallery") {
    return json(400, { error: "kind must be hero or gallery." });
  }

  const recipeId = String(form.get("recipeId") ?? "").trim();
  if (recipeId && !UUID_RE.test(recipeId)) {
    return json(400, { error: "recipeId must be a UUID." });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json(400, { error: "An image file is required." });
  }
  const contentType = (file.type || "").trim().toLowerCase();
  if (!SANITY_UPLOAD_ALLOWED_TYPES.has(contentType)) {
    return json(400, { error: "Use a JPEG, PNG, WebP, or GIF image." });
  }
  if (file.size > SANITY_UPLOAD_MAX_BYTES) {
    return json(413, { error: "Image must be 4 MB or smaller." });
  }

  const alt = String(form.get("alt") ?? "").trim();
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const sanity = createSanityClient({
      projectId,
      dataset,
      apiVersion: "2026-01-01",
      token,
      useCdn: false,
    });
    const asset = await sanity.assets.upload("image", bytes, {
      filename: file.name || "recipe-image",
      contentType,
      source: recipeId ? { id: recipeId, name: "recipe" } : undefined,
    });
    const image = assetToImageRef(asset, alt);
    return json(200, { image });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sanity upload failed.";
    return json(502, { error: message });
  }
});
