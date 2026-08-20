import {
  countCompletedExercises,
  formatExerciseSummary,
  formatSessionDurationLabel,
  isWorkoutSessionInProgress,
  resolvePlanName,
} from "../../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { WorkoutFocusBadge } from "./WorkoutFocusBadge";

function formatWorkoutDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type WorkoutSessionCardProps = {
  session: WorkoutSession;
  plans: WorkoutPlan[];
  onOpen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkoutSessionCard({
  session,
  plans,
  onOpen,
  onEdit,
  onDelete,
}: WorkoutSessionCardProps) {
  const planName = resolvePlanName(session.planId, plans);
  const durationLabel = formatSessionDurationLabel(session);
  const inProgress = isWorkoutSessionInProgress(session);
  const completedCount = countCompletedExercises(session);

  return (
    <article style={styles.workoutCard}>
      <div style={styles.workoutCardAccent} aria-hidden="true" />
      <div style={styles.workoutCardBody}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ ...styles.workoutCardTitle, margin: 0 }}>{formatWorkoutDate(session.date)}</h3>
          <WorkoutFocusBadge focus={session.focus} />
          {inProgress && <span style={styles.statusPill}>In progress</span>}
        </div>

        <div style={{ ...styles.textMuted, fontSize: 13 }}>
          {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"}
          {inProgress ? ` · ${completedCount}/${session.exercises.length} complete` : ""}
          {durationLabel ? ` · ${durationLabel}` : ""}
          {planName ? ` · ${planName}` : ""}
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          {session.exercises.slice(0, 3).map((entry) => (
            <div key={entry.id} style={{ ...styles.textSecondary, fontSize: 13 }}>
              {formatExerciseSummary(entry)}
            </div>
          ))}
          {session.exercises.length > 3 ? (
            <div style={{ ...styles.textMuted, fontSize: 12 }}>
              +{session.exercises.length - 3} more
            </div>
          ) : null}
        </div>
      </div>

      <div style={styles.workoutCardActions}>
        {inProgress && onOpen && (
          <button type="button" onClick={onOpen} style={styles.actionBtn}>
            Resume
          </button>
        )}
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
