import { formatEstimatedMinutes, formatRecipeStepKind } from "../../core/cooking";
import { canAdvanceStep, currentRecipeStep, timerForStep } from "../../core/cookingSession";
import type { CookingSession, Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type StepViewProps = {
  recipe: Recipe;
  session: CookingSession;
  onStartTimer: (timerId: string) => void;
};

export function StepView({ recipe, session, onStartTimer }: StepViewProps) {
  const step = currentRecipeStep(session, recipe);
  if (!step) {
    return <div style={styles.helpText}>No steps on this recipe.</div>;
  }

  const timer = timerForStep(session, step.id);
  const canAdvance = canAdvanceStep(session, recipe);
  const duration =
    step.timerSeconds !== undefined
      ? formatEstimatedMinutes(Math.max(1, Math.round(step.timerSeconds / 60)))
      : undefined;

  return (
    <div style={styles.guidedStepCard}>
      <div style={{ ...styles.recipeMetaRow, marginBottom: 8 }}>
        <span style={styles.statusPill}>{formatRecipeStepKind(step.kind)}</span>
        {step.canRunInBackground && (
          <span style={{ ...styles.textMuted, fontSize: 12 }}>Can run in the background</span>
        )}
        {duration && <span style={{ ...styles.textMuted, fontSize: 13 }}>{duration}</span>}
      </div>
      <div style={{ fontSize: 16, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{step.text}</div>
      {(step.kind === "wait" || step.kind === "parallel") && (
        <div style={{ ...styles.helpText, marginTop: 8 }}>
          You can start this timer and move on to the next step while it runs.
        </div>
      )}
      {step.blocksProgress && !step.canRunInBackground && timer && timer.status !== "done" && (
        <div style={{ ...styles.helpText, marginTop: 8 }}>
          This step blocks progress until its timer finishes.
        </div>
      )}
      {timer && timer.status === "idle" && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => onStartTimer(timer.id)}>
            Start {timer.label} timer
          </button>
        </div>
      )}
      {!canAdvance && (
        <div style={{ ...styles.helpText, marginTop: 8 }}>Finish this timer before advancing.</div>
      )}
    </div>
  );
}
