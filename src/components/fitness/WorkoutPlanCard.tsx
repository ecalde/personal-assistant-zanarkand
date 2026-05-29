import { formatExerciseSummary, isPlanSchedulable } from "../../core/fitness";
import type { WorkoutPlan } from "../../core/model";
import { formatWorkoutScheduleSeriesLabel } from "../../core/workoutSeries";
import { styles } from "../../ui/appStyles";
import { WorkoutFocusBadge } from "./WorkoutFocusBadge";

export type WorkoutPlanCardProps = {
  plan: WorkoutPlan;
  expanded: boolean;
  onToggleExpand: () => void;
  onLogSession: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkoutPlanCard({
  plan,
  expanded,
  onToggleExpand,
  onLogSession,
  onEdit,
  onDelete,
}: WorkoutPlanCardProps) {
  return (
    <div style={{ ...styles.listRow, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>{plan.name}</strong>
          <WorkoutFocusBadge focus={plan.focus} />
          <span style={{ opacity: 0.8, fontSize: 13 }}>
            {plan.exercises.length} exercise{plan.exercises.length === 1 ? "" : "s"}
          </span>
          {isPlanSchedulable(plan) && (
            <span style={{ opacity: 0.75, fontSize: 12 }}>
              {formatWorkoutScheduleSeriesLabel(plan)}
            </span>
          )}
        </div>

        {!expanded && (
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            {plan.exercises.slice(0, 2).map((entry) => formatExerciseSummary(entry)).join(" · ")}
            {plan.exercises.length > 2 ? " …" : ""}
          </div>
        )}

        {expanded && (
          <div style={{ display: "grid", gap: 6 }}>
            {plan.exercises.map((entry) => (
              <div key={entry.id} style={{ fontSize: 13, opacity: 0.9 }}>
                {formatExerciseSummary(entry)}
              </div>
            ))}
            {plan.notes && (
              <div style={{ fontSize: 13, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                {plan.notes}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onToggleExpand}>
            {expanded ? "Hide details" : "Details"}
          </button>
          <button type="button" onClick={onLogSession}>
            Log session
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
