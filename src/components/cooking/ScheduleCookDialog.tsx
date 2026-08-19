import { useEffect, useMemo, useState } from "react";
import { formatEstimatedMinutes, validateCookingSchedule } from "../../core/cooking";
import type { Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type ScheduleCookValues = {
  recipeId: string;
  cookDate: string;
  startTime?: string;
};

export type ScheduleCookDialogProps = {
  recipes: Recipe[];
  initialRecipeId?: string;
  initialDate: string;
  onConfirm: (values: ScheduleCookValues) => void;
  onCancel: () => void;
};

export function ScheduleCookDialog({
  recipes,
  initialRecipeId,
  initialDate,
  onConfirm,
  onCancel,
}: ScheduleCookDialogProps) {
  const sortedRecipes = useMemo(
    () => [...recipes].sort((a, b) => a.title.localeCompare(b.title)),
    [recipes]
  );
  const [recipeId, setRecipeId] = useState(initialRecipeId ?? sortedRecipes[0]?.id ?? "");
  const [cookDate, setCookDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedRecipe = recipes.find((recipe) => recipe.id === recipeId);
  const recipeLocked = Boolean(initialRecipeId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function handleSubmit() {
    const scheduleError = validateCookingSchedule(cookDate, startTime);
    if (scheduleError) {
      setError(scheduleError);
      return;
    }
    if (!recipeId || !selectedRecipe) {
      setError("Pick a recipe to schedule.");
      return;
    }

    const values: ScheduleCookValues = { recipeId, cookDate };
    if (startTime.trim()) values.startTime = startTime.trim();
    onConfirm(values);
  }

  return (
    <div style={styles.calendarModalOverlay} onClick={onCancel} role="presentation">
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-cook-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.cardTitle} id="schedule-cook-title">
          Schedule this cook
        </div>
        <div style={styles.textSecondary}>
          Add a planned cook to the calendar. Completing it later turns this into a cooked meal
          on the same calendar item.
        </div>

        <label style={styles.label}>
          Recipe
          {recipeLocked ? (
            <div style={{ ...styles.textSecondary, fontWeight: 700 }}>
              {selectedRecipe?.title ?? "Recipe"}
            </div>
          ) : (
            <select
              value={recipeId}
              onChange={(event) => setRecipeId(event.target.value)}
              style={styles.select}
            >
              {sortedRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </select>
          )}
        </label>

        <label style={styles.label}>
          Date
          <input
            type="date"
            value={cookDate}
            onChange={(event) => setCookDate(event.target.value)}
            style={styles.inputCompact}
          />
        </label>
        <label style={styles.label}>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            style={styles.inputCompact}
          />
        </label>
        <div style={styles.helpText}>
          Optional. Leave blank for an all-day cook
          {selectedRecipe?.estimatedMinutes
            ? ` · ${formatEstimatedMinutes(selectedRecipe.estimatedMinutes)} estimated`
            : ""}
          .
        </div>

        {error && <div style={styles.errorInline}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={recipes.length === 0}>
            Schedule cook
          </button>
        </div>
      </div>
    </div>
  );
}
