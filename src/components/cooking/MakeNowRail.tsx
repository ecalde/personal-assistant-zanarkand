import type { PantryRecipeSuggestion } from "../../core/cookingSuggestions";
import { RECIPE_CATEGORY_LABELS } from "../../core/cooking";
import { RECIPE_AVAILABILITY_LABELS } from "../../core/ingredients";
import { styles } from "../../ui/appStyles";

export type MakeNowRailProps = {
  suggestions: PantryRecipeSuggestion[];
  onOpenRecipe: (recipeId: string) => void;
};

export function MakeNowRail({ suggestions, onOpenRecipe }: MakeNowRailProps) {
  if (suggestions.length === 0) return null;

  return (
    <section style={{ ...styles.dashboardSection, marginBottom: 12 }} aria-label="Make now">
      <h2 style={{ fontWeight: 800, margin: "0 0 8px 0", fontSize: 16 }}>Make now</h2>
      <p style={{ margin: "0 0 10px 0", fontSize: 13, ...styles.textMuted }}>
        Ranked from your pantry. Suggestions are advisory — open a recipe to cook or edit it.
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
        {suggestions.map((item) => (
          <li key={item.recipeId} style={{ fontSize: 14, lineHeight: 1.45 }}>
            <button type="button" onClick={() => onOpenRecipe(item.recipeId)} style={styles.ghostBtn}>
              {item.recipeTitle}
            </button>{" "}
            <span style={styles.textMuted}>
              {RECIPE_CATEGORY_LABELS[item.category]} · {RECIPE_AVAILABILITY_LABELS[item.availability]}
            </span>
            <div style={{ fontSize: 13, ...styles.textSecondary }}>{item.reason}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
