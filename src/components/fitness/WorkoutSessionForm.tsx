import { getWorkoutFocusValues, WORKOUT_FOCUS_LABELS } from "../../core/fitness";
import type { WorkoutPlan } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { ExerciseEntryEditor } from "./ExerciseEntryEditor";
import type { WorkoutSessionFormState } from "./workoutSessionFormState";

export type WorkoutSessionFormProps = {
  editing: boolean;
  form: WorkoutSessionFormState;
  formError: string | null;
  plans: WorkoutPlan[];
  onChange: (next: WorkoutSessionFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function WorkoutSessionForm({
  editing,
  form,
  formError,
  plans,
  onChange,
  onSubmit,
  onCancel,
}: WorkoutSessionFormProps) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        {editing ? "Edit workout session" : "Log workout session"}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Workout date
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange({ ...form, date: e.target.value })}
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
                focus: e.target.value as WorkoutSessionFormState["focus"],
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

        {plans.length > 0 && (
          <label style={styles.label}>
            From plan (optional)
            <select
              value={form.planId}
              onChange={(e) => onChange({ ...form, planId: e.target.value })}
              style={styles.input}
            >
              <option value="">Manual entry</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={styles.label}>
          Duration in minutes (optional)
          <input
            value={form.durationMinutes}
            onChange={(e) => onChange({ ...form, durationMinutes: e.target.value })}
            placeholder="45"
            style={styles.input}
          />
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

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit}>
            {editing ? "Save session" : "Log session"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
