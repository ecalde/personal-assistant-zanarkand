import {
  formatEstimatedMinutes,
  formatIngredientCount,
  formatRecipeCategory,
  formatRecipeDifficulty,
  formatRecipeExperienceLevel,
  formatServings,
  formatStepCount,
  type RecipeMasteryView,
} from "../../core/cooking";
import type { Recipe, RecipeAvailability } from "../../core/model";
import { primaryRecipeImage } from "../../lib/sanityImageUrl";
import { styles } from "../../ui/appStyles";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { MasteryBadge } from "./MasteryBadge";
import { RecipeImage, RecipeImagePlaceholder } from "./RecipeImage";

export type RecipeCardProps = {
  recipe: Recipe;
  mastery?: RecipeMasteryView;
  availability?: RecipeAvailability;
  showAvailability?: boolean;
  onOpen: () => void;
};

export function RecipeCard({
  recipe,
  mastery,
  availability,
  showAvailability = false,
  onOpen,
}: RecipeCardProps) {
  const cookTime = formatEstimatedMinutes(recipe.estimatedMinutes);
  const servings = formatServings(recipe.servings);
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
        <div style={styles.recipeCardTitleRow}>
          <strong style={styles.recipeCardTitle}>{recipe.title}</strong>
          <span style={styles.statusPill}>{formatRecipeCategory(recipe.category)}</span>
        </div>
        {showAvailability && availability && <AvailabilityBadge status={availability} />}
        <div style={{ ...styles.recipeMetaRow, ...styles.textMuted, fontSize: 13 }}>
          <span>{formatRecipeDifficulty(recipe.difficulty)}</span>
          <span>{formatRecipeExperienceLevel(recipe.experienceLevel)}</span>
          {cookTime && <span>{cookTime}</span>}
        </div>
        <div style={{ ...styles.recipeMetaRow, ...styles.textMuted, fontSize: 13 }}>
          {servings && <span>{servings}</span>}
          <span>{formatIngredientCount(recipe)}</span>
          <span>{formatStepCount(recipe)}</span>
        </div>
        {mastery && <MasteryBadge mastery={mastery} showStreak={false} />}
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
