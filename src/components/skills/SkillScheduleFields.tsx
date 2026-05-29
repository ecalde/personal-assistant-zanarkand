import { styles } from "../../ui/appStyles";
import type { SkillScheduleFormState, SkillScheduleUiMode } from "./skillScheduleFormState";

export type SkillScheduleFieldsProps = {
  state: SkillScheduleFormState;
  radioGroupName: string;
  onChange: (state: SkillScheduleFormState) => void;
  onModeChange: (mode: SkillScheduleUiMode) => void;
  onDateBlur: () => void;
  error: string | null;
  disabled?: boolean;
};

export function SkillScheduleFields({
  state,
  radioGroupName,
  onChange,
  onModeChange,
  onDateBlur,
  error,
  disabled = false,
}: SkillScheduleFieldsProps) {
  const modes: { value: SkillScheduleUiMode; label: string }[] = [
    { value: "indefinite", label: "Indefinite" },
    { value: "date_range", label: "Date Range" },
    { value: "single_day", label: "Single Day" },
  ];

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>Schedule Availability</legend>
      <div style={{ display: "grid", gap: 8 }}>
        {modes.map(({ value, label }) => (
          <label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name={radioGroupName}
              value={value}
              checked={state.mode === value}
              disabled={disabled}
              onChange={() => onModeChange(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {state.mode === "date_range" && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <label style={styles.label}>
            Start Date
            <input
              type="date"
              value={state.startDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, startDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            End Date
            <input
              type="date"
              value={state.endDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, endDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.input}
            />
          </label>
        </div>
      )}

      {state.mode === "single_day" && (
        <div style={{ marginTop: 10 }}>
          <label style={styles.label}>
            Date
            <input
              type="date"
              value={state.singleDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, singleDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.input}
            />
          </label>
        </div>
      )}

      {error && <div style={{ ...styles.errorInline, marginTop: 8 }}>{error}</div>}
    </fieldset>
  );
}
