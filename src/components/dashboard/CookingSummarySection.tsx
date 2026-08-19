import {
  buildRecipeMasteryViews,
  formatCookDate,
  formatEstimatedMinutes,
  listCompletedCookingSessionsInWeek,
  listRecentCookingSessions,
  type RecipeMasteryView,
} from "../../core/cooking";
import type { CookingSession, Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { MasteryBadge } from "../cooking/MasteryBadge";

export type CookingSummarySectionProps = {
  recipes: Recipe[];
  cookingSessions: CookingSession[];
  todayKey: string;
  onOpenCooking?: () => void;
};

function masteryHighlights(
  recipes: Recipe[],
  masteryByRecipeId: Map<string, RecipeMasteryView>,
  limit: number
): Array<{ recipe: Recipe; mastery: RecipeMasteryView }> {
  return recipes
    .map((recipe) => ({ recipe, mastery: masteryByRecipeId.get(recipe.id) }))
    .filter(
      (item): item is { recipe: Recipe; mastery: RecipeMasteryView } =>
        item.mastery !== undefined && item.mastery.tier !== null
    )
    .sort((a, b) => {
      const byTier = (b.mastery.tier ?? 0) - (a.mastery.tier ?? 0);
      if (byTier !== 0) return byTier;
      return b.mastery.completionCount - a.mastery.completionCount;
    })
    .slice(0, limit);
}

export function CookingSummarySection({
  recipes,
  cookingSessions,
  todayKey,
  onOpenCooking,
}: CookingSummarySectionProps) {
  if (recipes.length === 0 && cookingSessions.length === 0) return null;

  const weekCooks = listCompletedCookingSessionsInWeek(cookingSessions, todayKey);
  const recent = listRecentCookingSessions(cookingSessions, 3);
  const masteryByRecipeId = buildRecipeMasteryViews(recipes, cookingSessions);
  const highlights = masteryHighlights(recipes, masteryByRecipeId, 3);

  return (
    <section style={styles.dashboardSection} aria-label="Cooking summary">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Cooking</h2>
        {onOpenCooking && (
          <button type="button" onClick={onOpenCooking}>
            View cooking
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>
        {weekCooks.length} cook{weekCooks.length === 1 ? "" : "s"} this week
        {recipes.length > 0
          ? ` · ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`
          : ""}
        .
      </p>

      {highlights.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {highlights.map(({ recipe, mastery }) => (
            <div key={recipe.id} style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{recipe.title}</span>{" "}
              <MasteryBadge mastery={mastery} />
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, ...styles.textSecondary }}>
          {recent.map((session) => {
            const duration =
              session.durationMinutes !== undefined
                ? formatEstimatedMinutes(session.durationMinutes)
                : undefined;
            return (
              <li key={session.id} style={{ marginBottom: 6 }}>
                {formatCookDate(session.cookDate)} — {session.recipeTitle}
                {duration ? ` · ${duration}` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
