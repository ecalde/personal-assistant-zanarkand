import type { SanityImageRef } from "../core/model";
import {
  RECIPE_GALLERY_MAX_IMAGES,
  SANITY_UPLOAD_ALLOWED_TYPES,
  SANITY_UPLOAD_MAX_BYTES,
  validateRecipeImageFile,
  type RecipeImageKind,
} from "../core/sanityUploadContract";
import { supabase } from "./supabaseClient";

export {
  RECIPE_GALLERY_MAX_IMAGES,
  SANITY_UPLOAD_ALLOWED_TYPES,
  SANITY_UPLOAD_MAX_BYTES,
  validateRecipeImageFile,
};
export type { RecipeImageKind };

export async function uploadRecipeImage(
  file: File,
  options: { kind: RecipeImageKind; recipeId?: string; alt?: string }
): Promise<SanityImageRef> {
  const fileError = validateRecipeImageFile(file);
  if (fileError) throw new Error(fileError);

  const body = new FormData();
  body.append("file", file);
  body.append("kind", options.kind);
  if (options.recipeId) body.append("recipeId", options.recipeId);
  if (options.alt?.trim()) body.append("alt", options.alt.trim());

  const { data, error } = await supabase.functions.invoke("sanity-upload", { body });
  if (error) {
    throw new Error(error.message || "Image upload failed.");
  }

  const image = (data as { image?: SanityImageRef } | null)?.image;
  if (!image?.assetRef?.trim() || !image.url?.trim()) {
    throw new Error("Image upload did not return a valid asset.");
  }
  return image;
}
