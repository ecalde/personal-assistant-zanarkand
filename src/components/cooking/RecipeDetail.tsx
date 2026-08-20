import {
  formatCookingMethod,
  formatEstimatedMinutes,
  formatRecipeCategory,
  formatRecipeDifficulty,
  formatRecipeExperienceLevel,
  formatServings,
  type RecipeMasteryView,
} from "../../core/cooking";
import { suggestSubstitutionsForRecipe } from "../../core/cookingSuggestions";
import type { IngredientCatalog } from "../../core/ingredientCatalog";
import {
  ingredientDisplayName,
  recipeLineIsInPantry,
} from "../../core/ingredients";
import type { CustomIngredient, PantryItem, Recipe, RecipeAvailability, RecipeNutrition } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { MasteryBadge } from "./MasteryBadge";
import { NutritionSummary } from "./NutritionSummary";
import { RecipeImage } from "./RecipeImage";

export type RecipeDetailProps = {
  recipe: Recipe;
  mastery?: RecipeMasteryView;
  availability?: RecipeAvailability;
  showAvailability?: boolean;
  pantry?: PantryItem[];
  catalog?: IngredientCatalog;
  customIngredients?: CustomIngredient[];
  nutrition?: RecipeNutrition;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStartCooking?: () => void;
  onLogCook?: () => void;
  onScheduleCook?: () => void;
  resumeLabel?: string;
  catalogActions?: {
    alreadyInLibrary: boolean;
    onClone: () => void;
    onOpenCloned?: () => void;
  };
};

export function RecipeDetail({
  recipe,
  mastery,
  availability,
  showAvailability = false,
  pantry = [],
  catalog,
  customIngredients = [],
  nutrition,
  onBack,
  onEdit,
  onDelete,
  onStartCooking,
  onLogCook,
  onScheduleCook,
  resumeLabel,
  catalogActions,
}: RecipeDetailProps) {
  const cookTime = formatEstimatedMinutes(recipe.estimatedMinutes);
  const servings = formatServings(recipe.servings);
  const orderedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);
  const heroImage = recipe.heroImage ?? recipe.gallery[0];
  const galleryImages = recipe.heroImage ? recipe.gallery : recipe.gallery.slice(1);
  const substitutions =
    showAvailability && catalog
      ? suggestSubstitutionsForRecipe(recipe, pantry, catalog)
      : [];

  return (
    <div style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button type="button" onClick={onBack}>
          {catalogActions ? "Back to catalog" : "Back to recipes"}
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {catalogActions ? (
            <>
              {catalogActions.alreadyInLibrary && catalogActions.onOpenCloned && (
                <button type="button" onClick={catalogActions.onOpenCloned}>
                  Open in library
                </button>
              )}
              <button type="button" onClick={catalogActions.onClone}>
                {catalogActions.alreadyInLibrary ? "Clone again" : "Add to my recipes"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onStartCooking}>
                {resumeLabel ?? "Start Cooking"}
              </button>
              <button type="button" onClick={onLogCook}>
                Log a past cook
              </button>
              <button type="button" onClick={onScheduleCook}>
                Schedule this cook
              </button>
              <button type="button" onClick={onEdit}>
                Edit
              </button>
              <button type="button" onClick={onDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div style={styles.cardTitle}>{recipe.title}</div>
      {heroImage && (
        <RecipeImage
          image={heroImage}
          alt={recipe.title}
          preset="hero"
          style={{ ...styles.recipeHero, marginBottom: 12 }}
        />
      )}
      {galleryImages.length > 0 && (
        <div style={{ ...styles.recipeGalleryStrip, marginBottom: 14 }}>
          {galleryImages.map((image) => (
            <RecipeImage
              key={image.assetRef}
              image={image}
              alt={recipe.title}
              preset="gallery"
              style={styles.recipeGalleryThumb}
            />
          ))}
        </div>
      )}
      <div style={{ ...styles.recipeMetaRow, marginBottom: 14 }}>
        <span style={styles.statusPill}>{formatRecipeCategory(recipe.category)}</span>
        <span style={styles.statusPill}>{formatRecipeDifficulty(recipe.difficulty)}</span>
        <span style={styles.statusPill}>
          {formatRecipeExperienceLevel(recipe.experienceLevel)}
        </span>
        {mastery && <MasteryBadge mastery={mastery} />}
        {showAvailability && availability && <AvailabilityBadge status={availability} />}
        {recipe.cookingMethod && (
          <span style={styles.statusPill}>{formatCookingMethod(recipe.cookingMethod)}</span>
        )}
        {cookTime && <span style={{ ...styles.textMuted, fontSize: 13 }}>{cookTime}</span>}
        {servings && <span style={{ ...styles.textMuted, fontSize: 13 }}>{servings}</span>}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <section style={styles.recipeDetailSection}>
          <div style={{ fontWeight: 700 }}>Ingredients</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.ingredients.map((line) => {
              const matchedName = catalog
                ? ingredientDisplayName(
                    line.ingredientId,
                    catalog,
                    customIngredients,
                    line.customIngredientId
                  )
                : undefined;
              const inPantry = showAvailability
                ? recipeLineIsInPantry(line, pantry, catalog)
                : false;
              const confidencePct =
                line.matchConfidence !== undefined
                  ? Math.round(line.matchConfidence * 100)
                  : undefined;
              return (
                <li key={line.id} style={{ ...styles.textSecondary, marginBottom: 4 }}>
                  {line.rawText}
                  {line.optional ? " (optional)" : ""}
                  {matchedName && (
                    <span style={{ ...styles.textMuted, marginLeft: 6, fontSize: 12 }}>
                      {matchedName}
                      {confidencePct !== undefined ? ` · ${confidencePct}%` : ""}
                    </span>
                  )}
                  {showAvailability && (
                    <span style={{ ...styles.textMuted, marginLeft: 6, fontSize: 12 }}>
                      {inPantry ? "in pantry" : "not in pantry"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {substitutions.length > 0 && (
          <section style={styles.recipeDetailSection}>
            <div style={{ fontWeight: 700 }}>Substitution ideas</div>
            <p style={{ margin: "4px 0 8px 0", fontSize: 13, ...styles.textMuted }}>
              Advisory pantry matches in the same ingredient category.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {substitutions.map((item) => (
                <li key={item.missingLineId} style={{ ...styles.textSecondary, marginBottom: 4 }}>
                  Out of {item.missingLabel}? Try{" "}
                  {item.candidates.map((candidate) => candidate.pantryLabel).join(" or ")}.
                </li>
              ))}
            </ul>
          </section>
        )}

        {nutrition && <NutritionSummary nutrition={nutrition} recipe={recipe} />}

        <section style={styles.recipeDetailSection}>
          <div style={{ fontWeight: 700 }}>Steps</div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {orderedSteps.map((step, index) => (
              <li key={step.id} style={styles.recipeStepItem}>
                <span style={{ fontWeight: 700, color: "var(--aether-text, inherit)" }}>
                  {index + 1}.
                </span>
                <span style={{ whiteSpace: "pre-wrap" }}>{step.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {recipe.equipment.length > 0 && (
          <section style={styles.recipeDetailSection}>
            <div style={{ fontWeight: 700 }}>Equipment</div>
            <div style={{ ...styles.textSecondary, fontSize: 14 }}>
              {recipe.equipment.join(" · ")}
            </div>
          </section>
        )}

        {recipe.notes && (
          <section style={styles.recipeDetailSection}>
            <div style={{ fontWeight: 700 }}>Notes</div>
            <div style={{ ...styles.textSecondary, whiteSpace: "pre-wrap", fontSize: 14 }}>
              {recipe.notes}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
