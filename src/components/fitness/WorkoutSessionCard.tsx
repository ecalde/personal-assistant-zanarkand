import { formatExerciseSummary, resolvePlanName } from "../../core/fitness";
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
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkoutSessionCard({
  session,
  plans,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: WorkoutSessionCardProps) {
  const planName = resolvePlanName(session.planId, plans);

  return (
    <div style={{ ...styles.listRow, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>{formatWorkoutDate(session.date)}</strong>
          <WorkoutFocusBadge focus={session.focus} />
        </div>

        <div style={{ opacity: 0.85, fontSize: 13 }}>
          {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"}
          {planName ? ` · from ${planName}` : ""}
        </div>

        {!expanded && (
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            {session.exercises.slice(0, 2).map((entry) => formatExerciseSummary(entry)).join(" · ")}
            {session.exercises.length > 2 ? " …" : ""}
          </div>
        )}

        {expanded && (
          <div style={{ display: "grid", gap: 6 }}>
            {session.exercises.map((entry) => (
              <div key={entry.id} style={{ fontSize: 13, opacity: 0.9 }}>
                {formatExerciseSummary(entry)}
              </div>
            ))}
            {session.notes && (
              <div style={{ fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                {session.notes}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onToggleExpand}>
            {expanded ? "Hide details" : "Details"}
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
