import { styles } from "../../ui/appStyles";
import {
  emptyExerciseEntryFormRow,
  type ExerciseEntryFormRow,
} from "./workoutPlanFormState";

export type ExerciseEntryEditorProps = {
  exercises: ExerciseEntryFormRow[];
  onChange: (next: ExerciseEntryFormRow[]) => void;
};

export function ExerciseEntryEditor({ exercises, onChange }: ExerciseEntryEditorProps) {
  function updateRow(index: number, patch: Partial<ExerciseEntryFormRow>) {
    onChange(exercises.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    if (exercises.length <= 1) return;
    onChange(exercises.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...exercises, emptyExerciseEntryFormRow()]);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Exercises</div>
      {exercises.map((row, index) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gap: 10,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
          }}
        >
          <label style={styles.label}>
            Exercise name
            <input
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
              placeholder='e.g., "Bench press"'
              style={styles.input}
            />
          </label>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={styles.label}>
              Sets
              <input
                value={row.sets}
                onChange={(e) => updateRow(index, { sets: e.target.value })}
                placeholder="3"
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Reps
              <input
                value={row.reps}
                onChange={(e) => updateRow(index, { reps: e.target.value })}
                placeholder="10"
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Weight
              <input
                value={row.weight}
                onChange={(e) => updateRow(index, { weight: e.target.value })}
                placeholder="135"
                style={styles.input}
              />
            </label>
          </div>

          <label style={styles.label}>
            Notes (optional)
            <input
              value={row.notes}
              onChange={(e) => updateRow(index, { notes: e.target.value })}
              style={styles.input}
            />
          </label>

          {exercises.length > 1 && (
            <button type="button" onClick={() => removeRow(index)}>
              Remove exercise
            </button>
          )}
        </div>
      ))}

      <button type="button" onClick={addRow}>
        Add exercise
      </button>
    </div>
  );
}
