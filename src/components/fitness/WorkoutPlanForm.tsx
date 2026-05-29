import { getWorkoutFocusValues, WORKOUT_FOCUS_LABELS } from "../../core/fitness";
import { styles } from "../../ui/appStyles";
import { ExerciseEntryEditor } from "./ExerciseEntryEditor";
import { WorkoutPlanScheduleSection } from "./WorkoutPlanScheduleSection";
import type { WorkoutPlanFormState } from "./workoutPlanFormState";
import {
  workoutScheduleFormFromSeries,
  workoutScheduleSeriesFromForm,
} from "./workoutScheduleFormState";

export type WorkoutPlanFormProps = {
  editing: boolean;
  form: WorkoutPlanFormState;
  formError: string | null;
  onChange: (next: WorkoutPlanFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function WorkoutPlanForm({
  editing,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
}: WorkoutPlanFormProps) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{editing ? "Edit workout plan" : "Add workout plan"}</div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Plan name
          <input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder='e.g., "Push A"'
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Focus (optional)
          <select
            value={form.focus}
            onChange={(e) =>
              onChange({
                ...form,
                focus: e.target.value as WorkoutPlanFormState["focus"],
              })
            }
            style={styles.input}
          >
            <option value="">None</option>
            {getWorkoutFocusValues().map((focus) => (
              <option key={focus} value={focus}>
                {WORKOUT_FOCUS_LABELS[focus]}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            rows={3}
            style={styles.input}
          />
        </label>

        <ExerciseEntryEditor
          exercises={form.exercises}
          onChange={(exercises) => onChange({ ...form, exercises })}
        />

        <WorkoutPlanScheduleSection
          schedule={form.schedule}
          scheduleSeries={
            form.scheduleAvailability.mode === "indefinite"
              ? undefined
              : workoutScheduleSeriesFromForm(form.scheduleAvailability)
          }
          radioGroupName={editing ? "workout-plan-schedule-edit" : "workout-plan-schedule-create"}
          onScheduleChange={(schedule) => onChange({ ...form, schedule })}
          onScheduleSeriesChange={(series) =>
            onChange({
              ...form,
              scheduleAvailability: workoutScheduleFormFromSeries(series),
            })
          }
        />

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit}>
            {editing ? "Save plan" : "Add plan"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
