import { styles } from "../../ui/appStyles";
import {
  emptyGradeCategoryFormRow,
  type SchoolGradeCategoryFormRow,
} from "./schoolCourseFormState";

export type SchoolGradeCategoriesFieldsProps = {
  rows: SchoolGradeCategoryFormRow[];
  error?: string | null;
  onChange: (rows: SchoolGradeCategoryFormRow[]) => void;
};

export function requiredWeightTotal(rows: readonly SchoolGradeCategoryFormRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.extraCredit) return sum;
    const weight = Number(row.weightPercent.trim());
    return Number.isFinite(weight) ? sum + weight : sum;
  }, 0);
}

export function SchoolGradeCategoriesFields({
  rows,
  error,
  onChange,
}: SchoolGradeCategoriesFieldsProps) {
  const total = requiredWeightTotal(rows);

  function patchRow(index: number, next: SchoolGradeCategoryFormRow) {
    const gradeCategories = [...rows];
    gradeCategories[index] = next;
    onChange(gradeCategories);
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {error ? (
        <div style={styles.errorBox} role="alert">
          {error}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No categories yet. Add Quizzes, Exercises, or whatever this class uses.
        </p>
      ) : null}
      {rows.map((row, index) => (
        <div
          key={row.id}
          style={{
            display: "grid",
            gap: 6,
            gridTemplateColumns: "minmax(0, 1fr) 72px auto auto",
            alignItems: "center",
          }}
        >
          <input
            value={row.name}
            placeholder="Category"
            onChange={(event) => patchRow(index, { ...row, name: event.target.value })}
            style={styles.inputCompact}
            aria-label={`Category ${index + 1} name`}
          />
          <input
            value={row.weightPercent}
            placeholder="%"
            inputMode="decimal"
            onChange={(event) => patchRow(index, { ...row, weightPercent: event.target.value })}
            style={styles.inputCompact}
            aria-label={`${row.name || `Category ${index + 1}`} weight percent`}
          />
          <label style={{ ...styles.captionText, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={row.extraCredit}
              onChange={(event) => patchRow(index, { ...row, extraCredit: event.target.checked })}
            />
            EC
          </label>
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          style={styles.ghostBtn}
          onClick={() => onChange([...rows, emptyGradeCategoryFormRow()])}
        >
          Add category
        </button>
        {rows.length > 0 ? (
          <span style={styles.captionText}>
            Required weights {total.toFixed(total % 1 === 0 ? 0 : 1)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
