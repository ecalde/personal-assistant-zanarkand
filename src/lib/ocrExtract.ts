import {
  OCR_EXTRACT_ALLOWED_IMAGE_TYPES,
  OCR_EXTRACT_MAX_IMAGE_BYTES,
  OCR_EXTRACT_MIN_TEXT_CHARS,
  validateOcrImageCapture,
  validateOcrImageFile,
  type OcrExtractImageType,
} from "../core/ocrExtractContract";
import { parseExtractedRecipe } from "../core/recipeImport";
import type { ExtractedRecipe } from "../core/model";
import { supabase } from "./supabaseClient";

export {
  OCR_EXTRACT_ALLOWED_IMAGE_TYPES,
  OCR_EXTRACT_MAX_IMAGE_BYTES,
  OCR_EXTRACT_MIN_TEXT_CHARS,
  validateOcrImageCapture,
  validateOcrImageFile,
};

const IMAGE_ACCEPT = OCR_EXTRACT_ALLOWED_IMAGE_TYPES.join(",");

export { IMAGE_ACCEPT };

function functionsErrorMessage(error: { message?: string }, data: unknown): string {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  return error.message || "Recipe import failed.";
}

async function invokeOcrExtract(body: Record<string, unknown>): Promise<ExtractedRecipe> {
  const { data, error } = await supabase.functions.invoke("ocr-extract", { body });
  if (error) {
    throw new Error(functionsErrorMessage(error, data));
  }
  const payload = data as { extracted?: unknown; error?: string } | null;
  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    throw new Error(payload.error.trim());
  }
  const parsed = parseExtractedRecipe(payload?.extracted ?? payload);
  if (typeof parsed === "string") {
    throw new Error(parsed);
  }
  return parsed;
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not compress the image."));
      },
      type,
      quality
    );
  });
}

/** Downscale large camera photos so the Edge Function stays under the 4 MB cap. */
export async function prepareOcrImage(
  file: File
): Promise<{ base64: string; contentType: OcrExtractImageType }> {
  const type = (file.type || "").trim().toLowerCase();
  const normalizedType = type === "image/jpg" ? "image/jpeg" : type;
  if (!(OCR_EXTRACT_ALLOWED_IMAGE_TYPES as readonly string[]).includes(normalizedType)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image.");
  }
  const contentType = normalizedType as OcrExtractImageType;

  if (file.size <= 1_500_000) {
    return { base64: await fileToBase64(file), contentType };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Could not compress the image.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outputType = contentType === "image/png" ? "image/jpeg" : contentType;
    const blob = await canvasToBlob(canvas, outputType, 0.82);
    if (blob.size > OCR_EXTRACT_MAX_IMAGE_BYTES) {
      throw new Error("Image must be 4 MB or smaller.");
    }
    return {
      base64: await fileToBase64(blob),
      contentType: outputType === "image/jpeg" ? "image/jpeg" : contentType,
    };
  } catch (err) {
    if (file.size <= OCR_EXTRACT_MAX_IMAGE_BYTES && err instanceof Error && err.message.includes("4 MB")) {
      throw err;
    }
    if (file.size <= OCR_EXTRACT_MAX_IMAGE_BYTES) {
      return { base64: await fileToBase64(file), contentType };
    }
    throw err instanceof Error ? err : new Error("Could not compress the image.");
  }
}

export async function extractRecipeFromText(text: string): Promise<ExtractedRecipe> {
  return invokeOcrExtract({ kind: "text", text });
}

export async function extractRecipeFromImage(file: File): Promise<ExtractedRecipe> {
  const prepared = await prepareOcrImage(file);
  return invokeOcrExtract({
    kind: "image",
    imageBase64: prepared.base64,
    contentType: prepared.contentType,
  });
}
