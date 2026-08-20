import {
  countCompletedExercises,
  formatExerciseSummary,
  isExerciseCompleted,
  isPlanSchedulable,
  isWorkoutSessionInProgress,
} from "../../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { formatWorkoutScheduleSeriesLabel } from "../../core/workoutSeries";
import { styles } from "../../ui/appStyles";
import { WorkoutFocusBadge } from "./WorkoutFocusBadge";

export type WorkoutPlanCardProps = {
  plan: WorkoutPlan;
  liveSession?: WorkoutSession;
  onOpen: () => void;
  onLogSession: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkoutPlanCard({
  plan,
  liveSession,
  onOpen,
  onLogSession,
  onEdit,
  onDelete,
}: WorkoutPlanCardProps) {
  const live =
    liveSession && isWorkoutSessionInProgress(liveSession) ? liveSession : undefined;
  const entries = live?.exercises ?? plan.exercises;
  const completed = live ? countCompletedExercises(live) : 0;
  const total = entries.length;
  const progressRatio = total > 0 ? completed / total : 0;

  return (
    <article style={styles.workoutCard}>
      <div style={styles.workoutCardAccent} aria-hidden="true" />
      <div style={styles.workoutCardBody}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ ...styles.workoutCardTitle, margin: 0 }}>{plan.name}</h3>
          <WorkoutFocusBadge focus={plan.focus} />
        </div>

        <div style={{ ...styles.textMuted, fontSize: 13 }}>
          {total} exercise{total === 1 ? "" : "s"}
          {isPlanSchedulable(plan) ? ` · ${formatWorkoutScheduleSeriesLabel(plan)}` : ""}
          {live ? ` · ${completed}/${total} in progress` : ""}
        </div>

        {live && (
          <div
            style={styles.workoutProgressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-label={`${completed} of ${total} exercises complete`}
          >
            <div style={{ ...styles.workoutProgressFill, width: `${Math.round(progressRatio * 100)}%` }} />
          </div>
        )}

        <div style={{ display: "grid", gap: 4 }}>
          {entries.slice(0, 3).map((entry) => (
            <div
              key={entry.id}
              style={{
                ...styles.textSecondary,
                fontSize: 13,
                textDecoration: isExerciseCompleted(entry) ? "line-through" : "none",
              }}
            >
              {isExerciseCompleted(entry) ? "✓ " : ""}
              {formatExerciseSummary(entry)}
            </div>
          ))}
          {entries.length > 3 ? (
            <div style={{ ...styles.textMuted, fontSize: 12 }}>+{entries.length - 3} more</div>
          ) : null}
        </div>
      </div>

      <div style={styles.workoutCardActions}>
        <button type="button" onClick={onOpen} style={styles.actionBtn}>
          Open
        </button>
        <button type="button" onClick={onLogSession} style={styles.actionBtn}>
          Log session
        </button>
        <button type="button" onClick={onEdit} style={styles.ghostBtn}>
          Edit
        </button>
        <button type="button" onClick={onDelete} style={styles.ghostBtn}>
          Delete
        </button>
      </div>
    </article>
  );
}
