import type { CSSProperties } from "react";
import type { SanityImageRef } from "../../core/model";
import { recipeImageSrc, type RecipeImagePreset } from "../../lib/sanityImageUrl";
import { styles } from "../../ui/appStyles";

export function RecipeImagePlaceholder({
  label = "No photo",
  style,
}: {
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...styles.recipeImagePlaceholder, ...style }} aria-hidden="true">
      {label}
    </div>
  );
}

export function RecipeImage({
  image,
  alt,
  preset,
  style,
}: {
  image: SanityImageRef;
  alt: string;
  preset: RecipeImagePreset;
  style?: CSSProperties;
}) {
  const src = recipeImageSrc(image, preset);
  if (!src) return <RecipeImagePlaceholder style={style} />;

  return (
    <img
      src={src}
      alt={image.alt?.trim() || alt}
      style={style}
    />
  );
}
