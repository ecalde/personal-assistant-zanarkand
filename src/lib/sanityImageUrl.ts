import type { Recipe, SanityImageRef } from "../core/model";
import {
  imageUrlFor,
  readSanityPublicConfig,
  type SanityPublicConfig,
} from "./sanityClient";

export type RecipeImagePreset = "thumb" | "hero" | "gallery";

const PRESETS: Record<
  RecipeImagePreset,
  { width: number; height?: number; fit: "crop" | "max"; quality: number }
> = {
  thumb: { width: 480, height: 320, fit: "crop", quality: 70 },
  hero: { width: 1200, fit: "max", quality: 80 },
  gallery: { width: 720, height: 720, fit: "crop", quality: 75 },
};

export function primaryRecipeImage(
  recipe: Pick<Recipe, "heroImage" | "gallery">
): SanityImageRef | undefined {
  return recipe.heroImage ?? recipe.gallery[0];
}

/**
 * Sized CDN URL via @sanity/image-url when configured; otherwise the stored
 * canonical URL; otherwise null (caller should render a placeholder).
 */
export function recipeImageSrc(
  ref: SanityImageRef | null | undefined,
  preset: RecipeImagePreset,
  config: SanityPublicConfig | null = readSanityPublicConfig()
): string | null {
  if (!ref) return null;

  const builder = imageUrlFor(ref, config);
  if (builder) {
    const options = PRESETS[preset];
    let next = builder.width(options.width).quality(options.quality).auto("format");
    if (options.height !== undefined) next = next.height(options.height);
    next = next.fit(options.fit);
    const transformed = next.url();
    if (transformed) return transformed;
  }

  const fallback = ref.url.trim();
  return fallback.length > 0 ? fallback : null;
}
