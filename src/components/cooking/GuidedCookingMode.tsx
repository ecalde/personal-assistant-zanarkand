import {
  canAdvanceStep,
  canRetreatStep,
  currentStepIndex,
  stepProgress,
} from "../../core/cookingSession";
import type { CookingSession, Recipe } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { StepView } from "./StepView";
import { TimerPanel } from "./TimerPanel";
import { useCookingSession } from "./useCookingSession";

export type GuidedCookingModeProps = {
  recipe: Recipe;
  session: CookingSession;
  focusActive?: boolean;
  onChange: (next: CookingSession) => void;
  onFinish: () => void;
  onAbandon: () => void;
  onLeave: () => void;
  onExitFocus?: () => void;
};

export function GuidedCookingMode({
  recipe,
  session,
  focusActive = false,
  onChange,
  onFinish,
  onAbandon,
  onLeave,
  onExitFocus,
}: GuidedCookingModeProps) {
  const { now, alerts, dismissAlert, start, pause, resume, restart, next, back } =
    useCookingSession({ session, recipe, onChange });
  const progress = stepProgress(session, recipe);
  const canNext = canAdvanceStep(session, recipe);
  const canBack = canRetreatStep(session);
  const stepNumber = currentStepIndex(session) + 1;

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
          <button type="button" onClick={onLeave}>
            Back to recipes
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {focusActive && onExitFocus && (
              <button type="button" onClick={onExitFocus}>
                Exit focus mode
              </button>
            )}
            <button type="button" onClick={onFinish}>
              Finish cook
            </button>
            <button type="button" onClick={onAbandon}>
              Abandon
            </button>
          </div>
        </div>
        <div style={styles.cardTitle}>{recipe.title}</div>
        {focusActive && (
          <div style={{ ...styles.textMuted, fontSize: 13, marginBottom: 8 }}>
            Focus is on — closing the tab will resume this cook when you return.
          </div>
        )}
        <div style={{ ...styles.textMuted, fontSize: 13, marginBottom: 10 }}>
          Step {stepNumber} of {progress.total}
        </div>
        <div style={styles.guidedProgressTrack} aria-hidden="true">
          <div
            style={{
              ...styles.guidedProgressFill,
              width: `${Math.round(progress.ratio * 100)}%`,
            }}
          />
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={styles.timerDoneAlert} role="alert">
          {alerts.map((timer) => (
            <div
              key={timer.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>{timer.label} is done</strong>
              <button type="button" onClick={() => dismissAlert(timer.id)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <StepView recipe={recipe} session={session} onStartTimer={start} />
      <TimerPanel
        timers={session.timers}
        now={now}
        onStart={start}
        onPause={pause}
        onResume={resume}
        onRestart={restart}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={back} disabled={!canBack}>
          Back
        </button>
        <button type="button" onClick={next} disabled={!canNext}>
          Next
        </button>
      </div>
    </div>
  );
}
