import type { RecipeMasteryView } from "../../core/cooking";
import type { Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { RecipeCard } from "./RecipeCard";

export type RecipeGalleryProps = {
  recipes: Recipe[];
  masteryByRecipeId?: Map<string, RecipeMasteryView>;
  emptyQuery?: string;
  onOpenRecipe: (recipeId: string) => void;
};

export function RecipeGallery({
  recipes,
  masteryByRecipeId,
  emptyQuery,
  onOpenRecipe,
}: RecipeGalleryProps) {
  if (recipes.length === 0) {
    return (
      <div style={styles.helpText}>
        {emptyQuery
          ? `No matches for “${emptyQuery}”.`
          : "No recipes yet."}
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
          onOpen={() => onOpenRecipe(recipe.id)}
        />
      ))}
    </div>
  );
}
