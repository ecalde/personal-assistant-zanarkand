import { styles } from "../../ui/appStyles";
import {
  emptyExerciseEntryFormRow,
  type ExerciseEntryFormRow,
} from "./workoutPlanFormState";
import { MuscleTargetPicker } from "./MuscleTargetPicker";

export type ExerciseEntryEditorProps = {
  exercises: ExerciseEntryFormRow[];
  onChange: (next: ExerciseEntryFormRow[]) => void;
};

const compactLabel = { ...styles.label, fontSize: 12 };

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
      <div style={styles.exerciseGrid}>
        {exercises.map((row, index) => (
          <div key={row.id} style={styles.exerciseCell}>
            <label style={compactLabel}>
              Exercise name
              <input
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                placeholder='e.g., "Bench press"'
                style={styles.inputCompact}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <label style={compactLabel}>
                Sets
                <input
                  value={row.sets}
                  onChange={(e) => updateRow(index, { sets: e.target.value })}
                  placeholder="3"
                  inputMode="numeric"
                  style={styles.inputCompact}
                />
              </label>
              <label style={compactLabel}>
                Reps
                <input
                  value={row.reps}
                  onChange={(e) => updateRow(index, { reps: e.target.value })}
                  placeholder="10"
                  inputMode="numeric"
                  style={styles.inputCompact}
                />
              </label>
              <label style={compactLabel}>
                Weight
                <input
                  value={row.weight}
                  onChange={(e) => updateRow(index, { weight: e.target.value })}
                  placeholder="135"
                  inputMode="decimal"
                  style={styles.inputCompact}
                />
              </label>
            </div>

            <label style={compactLabel}>
              Target muscles (optional)
              <MuscleTargetPicker
                value={row.targetMuscleIds}
                onChange={(targetMuscleIds) => updateRow(index, { targetMuscleIds })}
              />
            </label>

            <label style={compactLabel}>
              Notes (optional)
              <input
                value={row.notes}
                onChange={(e) => updateRow(index, { notes: e.target.value })}
                style={styles.inputCompact}
              />
            </label>

            {exercises.length > 1 && (
              <button type="button" onClick={() => removeRow(index)} style={styles.ghostBtn}>
                Remove
              </button>
            )}
          </div>
        ))}

        <button type="button" onClick={addRow} style={styles.exerciseAddCell}>
          Add exercise
        </button>
      </div>
    </div>
  );
}
