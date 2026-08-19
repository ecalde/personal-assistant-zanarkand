import { formatNutritionConfidence } from "../../core/nutrition";
import type { Recipe, RecipeIngredientLine, RecipeNutrition } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type NutritionSummaryProps = {
  nutrition: RecipeNutrition;
  recipe: Recipe;
};

function lineLabel(recipe: Recipe, lineId: string): string {
  const line: RecipeIngredientLine | undefined = recipe.ingredients.find((item) => item.id === lineId);
  return line?.rawText?.trim() || "Unknown ingredient";
}

export function NutritionSummary({ nutrition, recipe }: NutritionSummaryProps) {
  const { perServing, confidenceLabel, unresolvedLineIds, missingDataLineIds } = nutrition;
  const flagged = [...unresolvedLineIds, ...missingDataLineIds];
  const uniqueFlagged = [...new Set(flagged)];
  const tone =
    confidenceLabel === "high"
      ? "var(--aether-chip-success-text, #1b5e20)"
      : confidenceLabel === "medium"
        ? "var(--aether-text, inherit)"
        : "var(--aether-chip-danger-text, #8a1f1f)";

  return (
    <section style={styles.recipeDetailSection}>
      <div style={{ fontWeight: 700 }}>Nutrition (per serving)</div>
      <div style={{ ...styles.textSecondary, fontSize: 14 }}>
        {perServing.kcal} kcal · {perServing.proteinG}g protein · {perServing.fatG}g fat ·{" "}
        {perServing.carbG}g carb
      </div>
      {(perServing.fiberG !== undefined ||
        perServing.sugarG !== undefined ||
        perServing.sodiumMg !== undefined) && (
        <div style={{ ...styles.textMuted, fontSize: 12 }}>
          {perServing.fiberG !== undefined ? `${perServing.fiberG}g fiber` : null}
          {perServing.fiberG !== undefined && (perServing.sugarG !== undefined || perServing.sodiumMg !== undefined)
            ? " · "
            : null}
          {perServing.sugarG !== undefined ? `${perServing.sugarG}g sugar` : null}
          {perServing.sugarG !== undefined && perServing.sodiumMg !== undefined ? " · " : null}
          {perServing.sodiumMg !== undefined ? `${perServing.sodiumMg}mg sodium` : null}
        </div>
      )}
      <div style={{ ...styles.recipeMetaRow, marginTop: 4 }}>
        <span
          style={{
            ...styles.statusPill,
            color: tone,
            borderColor: "currentColor",
          }}
        >
          Confidence: {formatNutritionConfidence(confidenceLabel)}
        </span>
      </div>
      {uniqueFlagged.length > 0 && (
        <div style={{ ...styles.helpText, marginTop: 4 }}>
          Improve accuracy: {uniqueFlagged.map((id) => lineLabel(recipe, id)).join(", ")}
        </div>
      )}
    </section>
  );
}
