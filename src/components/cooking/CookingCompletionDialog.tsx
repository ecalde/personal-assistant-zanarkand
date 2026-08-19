import { useEffect, useState } from "react";
import {
  defaultCookingWindow,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  validateCookingCompletion,
} from "../../core/cooking";
import type { Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CookingCompletionValues = {
  startedAtIso: string;
  finishedAtIso: string;
  servingsMade?: number;
  notes?: string;
};

export type CookingCompletionDialogProps = {
  recipe: Recipe;
  initialNotes?: string;
  initialStartedAtIso?: string;
  onConfirm: (values: CookingCompletionValues) => void;
  onCancel: () => void;
};

export function CookingCompletionDialog({
  recipe,
  initialNotes,
  initialStartedAtIso,
  onConfirm,
  onCancel,
}: CookingCompletionDialogProps) {
  const defaults = defaultCookingWindow(recipe.estimatedMinutes);
  const [startedLocal, setStartedLocal] = useState(
    toDatetimeLocalValue(initialStartedAtIso ?? defaults.startedAtIso)
  );
  const [finishedLocal, setFinishedLocal] = useState(
    toDatetimeLocalValue(defaults.finishedAtIso)
  );
  const [servings, setServings] = useState(
    recipe.servings !== undefined ? String(recipe.servings) : ""
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function handleSubmit() {
    const startedAtIso = fromDatetimeLocalValue(startedLocal);
    const finishedAtIso = fromDatetimeLocalValue(finishedLocal);
    if (!startedAtIso || !finishedAtIso) {
      setError("Start and finish times are required.");
      return;
    }
    const validationError = validateCookingCompletion(startedAtIso, finishedAtIso);
    if (validationError) {
      setError(validationError);
      return;
    }

    const trimmedServings = servings.trim();
    let servingsMade: number | undefined;
    if (trimmedServings) {
      const parsed = Number(trimmedServings);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError("Servings must be a positive whole number.");
        return;
      }
      servingsMade = parsed;
    }

    const values: CookingCompletionValues = { startedAtIso, finishedAtIso };
    if (servingsMade !== undefined) values.servingsMade = servingsMade;
    if (notes.trim()) values.notes = notes.trim();
    onConfirm(values);
  }

  return (
    <div style={styles.calendarModalOverlay} onClick={onCancel} role="presentation">
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cooking-completion-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.cardTitle} id="cooking-completion-title">
          Did you cook this?
        </div>
        <div style={styles.textSecondary}>
          Log a completed cook of {recipe.title}. Times default to the estimated duration
          ending now.
        </div>

        <label style={styles.label}>
          Started
          <input
            type="datetime-local"
            value={startedLocal}
            onChange={(event) => setStartedLocal(event.target.value)}
            style={styles.inputCompact}
          />
        </label>
        <label style={styles.label}>
          Finished
          <input
            type="datetime-local"
            value={finishedLocal}
            onChange={(event) => setFinishedLocal(event.target.value)}
            style={styles.inputCompact}
          />
        </label>
        <label style={styles.label}>
          Servings made
          <input
            value={servings}
            onChange={(event) => setServings(event.target.value)}
            inputMode="numeric"
            placeholder="Optional"
            style={styles.inputCompact}
          />
        </label>
        <label style={styles.label}>
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Optional"
            style={styles.inputCompact}
          />
        </label>

        {error && <div style={styles.errorInline}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit}>
            Log cook
          </button>
        </div>
      </div>
    </div>
  );
}
