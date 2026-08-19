import {
  formatEstimatedMinutes,
  formatIngredientCount,
  formatRecipeCategory,
  formatRecipeDifficulty,
  type RecipeMasteryView,
} from "../../core/cooking";
import type { Recipe } from "../../core/model";
import { primaryRecipeImage } from "../../lib/sanityImageUrl";
import { styles } from "../../ui/appStyles";
import { MasteryBadge } from "./MasteryBadge";
import { RecipeImage, RecipeImagePlaceholder } from "./RecipeImage";

export type RecipeCardProps = {
  recipe: Recipe;
  mastery?: RecipeMasteryView;
  onOpen: () => void;
};

export function RecipeCard({ recipe, mastery, onOpen }: RecipeCardProps) {
  const cookTime = formatEstimatedMinutes(recipe.estimatedMinutes);
  const preview = recipe.ingredients
    .slice(0, 2)
    .map((line) => line.rawText)
    .join(" · ");
  const image = primaryRecipeImage(recipe);

  return (
    <button type="button" onClick={onOpen} style={styles.recipeCard}>
      {image ? (
        <RecipeImage
          image={image}
          alt={recipe.title}
          preset="thumb"
          style={styles.recipeCardThumb}
        />
      ) : (
        <RecipeImagePlaceholder />
      )}
      <div style={styles.recipeCardBody}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>{recipe.title}</strong>
          <span style={styles.statusPill}>{formatRecipeCategory(recipe.category)}</span>
          {mastery && <MasteryBadge mastery={mastery} showCount={false} />}
        </div>
        <div style={{ ...styles.recipeMetaRow, ...styles.textMuted, fontSize: 13 }}>
          <span>{formatRecipeDifficulty(recipe.difficulty)}</span>
          {cookTime && <span>{cookTime}</span>}
          <span>{formatIngredientCount(recipe)}</span>
        </div>
        {preview && (
          <div style={{ ...styles.textSecondary, fontSize: 13 }}>
            {preview}
            {recipe.ingredients.length > 2 ? " …" : ""}
          </div>
        )}
      </div>
    </button>
  );
}
