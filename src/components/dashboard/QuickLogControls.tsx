import { useState } from "react";
import { styles } from "../../ui/appStyles";

export type QuickLogControlsProps = {
  onLog: (minutes: number) => void;
  inputPlaceholder?: string;
  inputAriaLabel?: string;
};

export function QuickLogControls({
  onLog,
  inputPlaceholder = "minutes",
  inputAriaLabel = "Minutes to log",
}: QuickLogControlsProps) {
  const [value, setValue] = useState("");

  function setLogValue(next: string) {
    if (!/^\d*$/.test(next)) return;
    setValue(next);
  }

  function commit(minutes: number) {
    if (!Number.isInteger(minutes) || minutes <= 0) return;
    onLog(minutes);
    setValue("");
  }

  function commitTyped() {
    const raw = value.trim();
    if (!raw) return;
    const n = parseInt(raw, 10);
    commit(n);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => setLogValue(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTyped();
          }
        }}
        placeholder={inputPlaceholder}
        aria-label={inputAriaLabel}
        style={{ ...styles.input, minWidth: 120, width: 120 }}
      />

      <button type="button" onClick={commitTyped} aria-label="Log entered minutes">
        Log
      </button>

      <button
        type="button"
        onClick={() => commit(15)}
        style={styles.smallBtn}
        aria-label="Log 15 minutes"
      >
        +15
      </button>

      <button
        type="button"
        onClick={() => commit(30)}
        style={styles.smallBtn}
        aria-label="Log 30 minutes"
      >
        +30
      </button>
    </div>
  );
}
