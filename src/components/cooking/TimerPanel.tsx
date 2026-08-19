import {
  formatTimerRemaining,
  remainingSeconds,
} from "../../core/cookingSession";
import type { CookingTimer } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type TimerPanelProps = {
  timers: CookingTimer[];
  now: Date;
  onStart: (timerId: string) => void;
  onPause: (timerId: string) => void;
  onResume: (timerId: string) => void;
  onRestart: (timerId: string) => void;
};

function statusLabel(status: CookingTimer["status"]): string {
  switch (status) {
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "idle":
    default:
      return "Idle";
  }
}

export function TimerPanel({
  timers,
  now,
  onStart,
  onPause,
  onResume,
  onRestart,
}: TimerPanelProps) {
  if (timers.length === 0) {
    return (
      <div style={styles.timerPanel}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Timers</div>
        <div style={styles.helpText}>No timers on this recipe.</div>
      </div>
    );
  }

  return (
    <div style={styles.timerPanel}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Timers</div>
      <div style={{ display: "grid", gap: 8 }}>
        {timers.map((timer) => {
          const remaining = remainingSeconds(timer, now);
          return (
            <div key={timer.id} style={styles.timerRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{timer.label}</div>
                <div style={{ ...styles.textMuted, fontSize: 13 }}>
                  {statusLabel(timer.status)} · {formatTimerRemaining(remaining)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {timer.status === "idle" && (
                  <button type="button" onClick={() => onStart(timer.id)}>
                    Start
                  </button>
                )}
                {timer.status === "running" && (
                  <button type="button" onClick={() => onPause(timer.id)}>
                    Pause
                  </button>
                )}
                {timer.status === "paused" && (
                  <button type="button" onClick={() => onResume(timer.id)}>
                    Resume
                  </button>
                )}
                {timer.status !== "idle" && (
                  <button type="button" onClick={() => onRestart(timer.id)}>
                    Restart
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
