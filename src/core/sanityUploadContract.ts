import type { SanityImageRef } from "./model";

export const SANITY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const RECIPE_GALLERY_MAX_IMAGES = 8;

export const SANITY_UPLOAD_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type RecipeImageKind = "hero" | "gallery";

const RECIPE_IMAGE_KINDS: readonly RecipeImageKind[] = ["hero", "gallery"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SanityAssetUploadResult = {
  _id: string;
  url: string;
  metadata?: {
    lqip?: string;
    dimensions?: {
      width?: number;
      height?: number;
    };
  };
};

export type SanityUploadFile = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
};

export type SanityUploadRequest = {
  userId: string | null | undefined;
  kind: string | null | undefined;
  recipeId?: string | null;
  alt?: string | null;
  file: SanityUploadFile | null | undefined;
};

export type SanityUploadDeps = {
  uploadAsset: (
    body: Uint8Array,
    options: { filename: string; contentType: string }
  ) => Promise<SanityAssetUploadResult>;
};

export type SanityUploadSuccess = { ok: true; image: SanityImageRef };
export type SanityUploadFailure = { ok: false; status: number; error: string };
export type SanityUploadResult = SanityUploadSuccess | SanityUploadFailure;

export function isRecipeImageKind(value: string | null | undefined): value is RecipeImageKind {
  return value != null && (RECIPE_IMAGE_KINDS as readonly string[]).includes(value);
}

export function validateRecipeImageFile(file: { size: number; type: string }): string | null {
  const contentType = file.type.trim().toLowerCase();
  if (!SANITY_UPLOAD_ALLOWED_TYPES.includes(contentType as (typeof SANITY_UPLOAD_ALLOWED_TYPES)[number])) {
    return "Use a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size <= 0) return "An image file is required.";
  if (file.size > SANITY_UPLOAD_MAX_BYTES) return "Image must be 4 MB or smaller.";
  return null;
}

export function sanityAssetToImageRef(
  asset: SanityAssetUploadResult,
  alt?: string | null
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
  if (typeof width === "number" && Number.isInteger(width) && width > 0) {
    ref.width = width;
  }
  if (typeof height === "number" && Number.isInteger(height) && height > 0) {
    ref.height = height;
  }

  const trimmedAlt = alt?.trim();
  if (trimmedAlt) ref.alt = trimmedAlt;

  return ref;
}

export async function handleSanityUpload(
  request: SanityUploadRequest,
  deps: SanityUploadDeps
): Promise<SanityUploadResult> {
  if (!request.userId || !request.userId.trim()) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  if (!isRecipeImageKind(request.kind)) {
    return { ok: false, status: 400, error: "kind must be hero or gallery." };
  }

  const recipeId = request.recipeId?.trim();
  if (recipeId && !UUID_RE.test(recipeId)) {
    return { ok: false, status: 400, error: "recipeId must be a UUID." };
  }

  const file = request.file;
  if (!file || file.bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "An image file is required." };
  }

  const fileError = validateRecipeImageFile({
    size: file.bytes.byteLength,
    type: file.contentType,
  });
  if (fileError) {
    const status = fileError.includes("4 MB") ? 413 : 400;
    return { ok: false, status, error: fileError };
  }

  try {
    const asset = await deps.uploadAsset(file.bytes, {
      filename: file.filename.trim() || "recipe-image",
      contentType: file.contentType.trim().toLowerCase(),
    });
    return { ok: true, image: sanityAssetToImageRef(asset, request.alt) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sanity upload failed.";
    return { ok: false, status: 502, error: message };
  }
}

export { RECIPE_IMAGE_KINDS };
