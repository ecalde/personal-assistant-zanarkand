import type { CSSProperties } from "react";
import { styles } from "../../ui/appStyles";
import type { Weekday } from "../../core/model";
import {
  EVENT_RECURRENCE_WEEKDAY_SHORT,
  EVENT_RECURRENCE_WEEKDAYS,
  type EventRecurrenceFormState,
  type EventRecurrenceUiMode,
  type RecurrenceEndUiKind,
} from "./eventRecurrenceFormState";

// Future: support series splitting, occurrence exceptions, edit-this-occurrence vs
// edit-series, and drag/drop recurrence edits.

export type EventRecurrenceFieldsProps = {
  state: EventRecurrenceFormState;
  radioGroupName: string;
  endRadioGroupName: string;
  onChange: (state: EventRecurrenceFormState) => void;
  onModeChange: (mode: EventRecurrenceUiMode) => void;
  onEndKindChange: (endKind: RecurrenceEndUiKind) => void;
  onFieldBlur: () => void;
  error: string | null;
  disabled?: boolean;
};

const weekdayPillBase: CSSProperties = {
  ...styles.statusPill,
  cursor: "pointer",
  userSelect: "none",
  border: "1px solid var(--aether-panel-border, #ddd)",
  background: "var(--aether-surface, white)",
};

const weekdayPillSelected: CSSProperties = {
  ...weekdayPillBase,
  border: "1px solid var(--aether-accent, #b9e6c7)",
  background: "var(--aether-accent-soft, #ecfff1)",
};

const modes: { value: EventRecurrenceUiMode; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const endKinds: { value: RecurrenceEndUiKind; label: string }[] = [
  { value: "never", label: "Never ends" },
  { value: "onDate", label: "Ends on date" },
  { value: "afterCount", label: "Ends after N occurrences" },
];

function toggleWeekday(current: Weekday[], day: Weekday): Weekday[] {
  if (current.includes(day)) {
    return current.filter((value) => value !== day);
  }
  return [...current, day];
}

export function EventRecurrenceFields({
  state,
  radioGroupName,
  endRadioGroupName,
  onChange,
  onModeChange,
  onEndKindChange,
  onFieldBlur,
  error,
  disabled = false,
}: EventRecurrenceFieldsProps) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>Repeats</legend>
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

      {state.mode === "weekly" && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>On these days</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Weekdays">
            {EVENT_RECURRENCE_WEEKDAYS.map((day) => {
              const selected = state.byWeekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  style={selected ? weekdayPillSelected : weekdayPillBase}
                  onClick={() => onChange({ ...state, byWeekdays: toggleWeekday(state.byWeekdays, day) })}
                  onBlur={onFieldBlur}
                >
                  {EVENT_RECURRENCE_WEEKDAY_SHORT[day]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {state.mode === "monthly" && (
        <div style={{ marginTop: 10 }}>
          <label style={styles.label}>
            Day of month
            <input
              type="number"
              min={1}
              max={31}
              value={state.dayOfMonth}
              disabled={disabled}
              placeholder="Same as event date"
              onChange={(e) => onChange({ ...state, dayOfMonth: e.target.value })}
              onBlur={onFieldBlur}
              style={{ ...styles.input, minWidth: 120, width: 120 }}
            />
          </label>
        </div>
      )}

      {state.mode === "yearly" && (
        <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
          Repeats on the same month and day as the event date.
        </div>
      )}

      {state.mode !== "none" && (
        <fieldset style={{ border: "none", margin: "14px 0 0", padding: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Ends</legend>
          <div style={{ display: "grid", gap: 8 }}>
            {endKinds.map(({ value, label }) => (
              <label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name={endRadioGroupName}
                  value={value}
                  checked={state.endKind === value}
                  disabled={disabled}
                  onChange={() => onEndKindChange(value)}
                />
                {label}
              </label>
            ))}
          </div>

          {state.endKind === "onDate" && (
            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>
                End date
                <input
                  type="date"
                  value={state.endDate}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...state, endDate: e.target.value })}
                  onBlur={onFieldBlur}
                  style={styles.input}
                />
              </label>
            </div>
          )}

          {state.endKind === "afterCount" && (
            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>
                Occurrences
                <input
                  type="number"
                  min={1}
                  value={state.maxOccurrences}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...state, maxOccurrences: e.target.value })}
                  onBlur={onFieldBlur}
                  style={{ ...styles.input, minWidth: 120, width: 120 }}
                />
              </label>
            </div>
          )}
        </fieldset>
      )}

      {error && <div style={{ ...styles.errorInline, marginTop: 8 }}>{error}</div>}
    </fieldset>
  );
}
