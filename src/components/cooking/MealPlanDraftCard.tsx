import { formatCookDate, RECIPE_CATEGORY_LABELS } from "../../core/cooking";
import type { MealPlanDraft } from "../../core/cookingSuggestions";
import { RECIPE_AVAILABILITY_LABELS } from "../../core/ingredients";
import { styles } from "../../ui/appStyles";

export type MealPlanDraftCardProps = {
  draft: MealPlanDraft;
  onSchedule: (slot: MealPlanDraft["slots"][number]) => void;
  scheduledRecipeIdsByDate?: ReadonlySet<string>;
};

export function MealPlanDraftCard({
  draft,
  onSchedule,
  scheduledRecipeIdsByDate,
}: MealPlanDraftCardProps) {
  if (draft.slots.length === 0 && draft.notes.length === 0) return null;

  return (
    <section style={{ ...styles.dashboardSection, marginBottom: 12 }} aria-label="Plan my week">
      <h2 style={{ fontWeight: 800, margin: "0 0 8px 0", fontSize: 16 }}>Plan my week</h2>
      <p style={{ margin: "0 0 10px 0", fontSize: 13, ...styles.textMuted }}>
        A pantry-aware draft. Nothing is saved until you schedule a cook.
      </p>
      {draft.slots.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, ...styles.textSecondary }}>{draft.notes[0]}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
          {draft.slots.map((slot) => {
            const key = `${slot.recipeId}:${slot.dateKey}`;
            const alreadyScheduled = scheduledRecipeIdsByDate?.has(key) ?? false;
            return (
              <li key={key} style={{ fontSize: 14, lineHeight: 1.45 }}>
                <strong>{formatCookDate(slot.dateKey)}</strong> — {slot.recipeTitle}{" "}
                <span style={styles.textMuted}>
                  {RECIPE_CATEGORY_LABELS[slot.category]} ·{" "}
                  {RECIPE_AVAILABILITY_LABELS[slot.availability]}
                </span>
                {slot.missingIngredientLabels.length > 0 && (
                  <div style={{ fontSize: 13, ...styles.textSecondary }}>
                    Missing {slot.missingIngredientLabels.join(", ")}
                  </div>
                )}
                {alreadyScheduled ? (
                  <div style={{ fontSize: 12, ...styles.textMuted }}>Already scheduled</div>
                ) : (
                  <button type="button" onClick={() => onSchedule(slot)} style={styles.ghostBtn}>
                    Schedule
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
