import type { RecipeMasteryView } from "../../core/cooking";
import type { Recipe, RecipeAvailability } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { RecipeCard } from "./RecipeCard";

export type RecipeGalleryProps = {
  recipes: Recipe[];
  masteryByRecipeId?: Map<string, RecipeMasteryView>;
  availabilityByRecipeId?: Map<string, RecipeAvailability>;
  showAvailability?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  onClearFilters?: () => void;
  onOpenRecipe: (recipeId: string) => void;
};

export function RecipeGallery({
  recipes,
  masteryByRecipeId,
  availabilityByRecipeId,
  showAvailability = false,
  emptyMessage = "No recipes yet.",
  loading = false,
  onClearFilters,
  onOpenRecipe,
}: RecipeGalleryProps) {
  if (loading) {
    return <div style={styles.helpText}>Loading recipes…</div>;
  }

  if (recipes.length === 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={styles.helpText}>{emptyMessage}</div>
        {onClearFilters && (
          <div>
            <button type="button" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.recipeGalleryGrid}>
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          mastery={masteryByRecipeId?.get(recipe.id)}
          availability={availabilityByRecipeId?.get(recipe.id)}
          showAvailability={showAvailability}
          onOpen={() => onOpenRecipe(recipe.id)}
        />
      ))}
    </div>
  );
}
