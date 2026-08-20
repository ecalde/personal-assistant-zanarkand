import { useEffect, useState } from "react";
import { styles } from "../../ui/appStyles";

export type WorkoutCompletionValues = {
  completedAtIso: string;
};

export type WorkoutCompletionDialogProps = {
  planName: string;
  defaultCompletedAtIso: string;
  onConfirm: (values: WorkoutCompletionValues) => void;
  onCancel: () => void;
};

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function WorkoutCompletionDialog({
  planName,
  defaultCompletedAtIso,
  onConfirm,
  onCancel,
}: WorkoutCompletionDialogProps) {
  const [finishedLocal, setFinishedLocal] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function handleSubmit() {
    const completedAtIso = fromDatetimeLocalValue(finishedLocal) ?? defaultCompletedAtIso;
    if (!completedAtIso) {
      setError("Could not read that completion time.");
      return;
    }
    onConfirm({ completedAtIso });
  }

  return (
    <div style={styles.calendarModalOverlay} onClick={onCancel} role="presentation">
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-completion-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.cardTitle} id="workout-completion-title">
          Finish {planName}?
        </div>
        <div style={styles.textSecondary}>
          Leave the time blank to log a 60-minute block at the first exercise you
          marked complete. Choosing a time records when you finished the whole
          session.
        </div>

        <label style={styles.label}>
          Completed at (optional)
          <input
            type="datetime-local"
            value={finishedLocal}
            onChange={(event) => setFinishedLocal(event.target.value)}
            placeholder={toDatetimeLocalValue(defaultCompletedAtIso)}
            style={styles.inputCompact}
          />
        </label>

        {error && <div style={styles.errorInline}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onCancel} style={styles.ghostBtn}>
            Keep going
          </button>
          <button type="button" onClick={handleSubmit} style={styles.actionBtn}>
            Save to calendar
          </button>
        </div>
      </div>
    </div>
  );
}
