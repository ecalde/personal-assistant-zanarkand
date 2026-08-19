import {
  formatEstimatedMinutes,
  formatRecipeCategory,
  formatRecipeDifficulty,
  formatRecipeExperienceLevel,
  formatServings,
  type RecipeMasteryView,
} from "../../core/cooking";
import type { Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { MasteryBadge } from "./MasteryBadge";
import { RecipeImage } from "./RecipeImage";

export type RecipeDetailProps = {
  recipe: Recipe;
  mastery?: RecipeMasteryView;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartCooking: () => void;
};

export function RecipeDetail({
  recipe,
  mastery,
  onBack,
  onEdit,
  onDelete,
  onStartCooking,
}: RecipeDetailProps) {
  const cookTime = formatEstimatedMinutes(recipe.estimatedMinutes);
  const servings = formatServings(recipe.servings);
  const orderedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);
  const heroImage = recipe.heroImage ?? recipe.gallery[0];
  const galleryImages = recipe.heroImage ? recipe.gallery : recipe.gallery.slice(1);

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
          Back to recipes
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onStartCooking}>
            Start Cooking
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
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
        {cookTime && <span style={{ ...styles.textMuted, fontSize: 13 }}>{cookTime}</span>}
        {servings && <span style={{ ...styles.textMuted, fontSize: 13 }}>{servings}</span>}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <section style={styles.recipeDetailSection}>
          <div style={{ fontWeight: 700 }}>Ingredients</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recipe.ingredients.map((line) => (
              <li key={line.id} style={{ ...styles.textSecondary, marginBottom: 4 }}>
                {line.rawText}
                {line.optional ? " (optional)" : ""}
              </li>
            ))}
          </ul>
        </section>

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
