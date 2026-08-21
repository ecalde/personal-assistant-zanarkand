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
  /** Defaults to "Schedule Availability". */
  legend?: string;
  /** When true, Date Range may omit end date (open-ended from start). */
  endDateOptional?: boolean;
};

export function SkillScheduleFields({
  state,
  radioGroupName,
  onChange,
  onModeChange,
  onDateBlur,
  error,
  disabled = false,
  legend = "Schedule Availability",
  endDateOptional = false,
}: SkillScheduleFieldsProps) {
  const modes: { value: SkillScheduleUiMode; label: string }[] = [
    { value: "indefinite", label: "Indefinite" },
    { value: "date_range", label: "Date Range" },
    { value: "single_day", label: "Single Day" },
  ];

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>{legend}</legend>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
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
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
            minWidth: 0,
          }}
        >
          <label style={{ ...styles.label, minWidth: 0 }}>
            Start Date
            <input
              type="date"
              value={state.startDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, startDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.inputFluid}
            />
          </label>
          <label style={{ ...styles.label, minWidth: 0 }}>
            {endDateOptional ? "End Date (optional)" : "End Date"}
            <input
              type="date"
              value={state.endDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, endDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.inputFluid}
            />
          </label>
        </div>
      )}

      {state.mode === "date_range" && endDateOptional && (
        <div style={{ ...styles.helpText, marginTop: 8 }}>
          Leave end date blank to keep this plan scheduled from the start date onward.
        </div>
      )}

      {state.mode === "single_day" && (
        <div style={{ marginTop: 10, minWidth: 0 }}>
          <label style={{ ...styles.label, minWidth: 0 }}>
            Date
            <input
              type="date"
              value={state.singleDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...state, singleDate: e.target.value })}
              onBlur={onDateBlur}
              style={styles.inputFluid}
            />
          </label>
        </div>
      )}

      {error && <div style={{ ...styles.errorInline, marginTop: 8 }}>{error}</div>}
    </fieldset>
  );
}
