import type { LevelUpNotification } from "../../core/progressionModel";
import { globalLevelTitle } from "../../core/milestoneTables";
import { styles } from "../../ui/appStyles";

export type LevelUpToastProps = {
  notification: LevelUpNotification;
  onAcknowledge: (level: number) => void;
};

export function LevelUpToast({ notification, onAcknowledge }: LevelUpToastProps) {
  const { newLevel } = notification;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 12,
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid var(--aether-chip-warning-border, #f0d9a8)",
        background: "linear-gradient(135deg, var(--aether-chip-warning-bg, #fff8e8), #ffeec2)",
        color: "var(--aether-chip-warning-text)",
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <strong style={{ fontSize: 15 }}>🎉 Level up! You reached level {newLevel}</strong>
        <span style={{ fontSize: 13, ...styles.textMuted }}>{globalLevelTitle(newLevel)}</span>
      </div>
      <button
        type="button"
        onClick={() => onAcknowledge(newLevel)}
        style={{
          padding: "6px 14px",
          borderRadius: 10,
          border: "1px solid var(--aether-chip-warning-border, #d8b766)",
          background: "white",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Nice!
      </button>
    </div>
  );
}
