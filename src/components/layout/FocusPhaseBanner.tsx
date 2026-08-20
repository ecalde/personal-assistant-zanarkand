import { focusPhaseLabel, type FocusPhaseKind } from "../../core/focusPhase";
import { styles } from "../../ui/appStyles";

export type FocusPhaseBannerProps = {
  kind: FocusPhaseKind;
  title: string;
  onResume: () => void;
  onExit: () => void;
};

export function FocusPhaseBanner({ kind, title, onResume, onExit }: FocusPhaseBannerProps) {
  return (
    <div style={styles.focusPhaseBanner} role="status">
      <div>
        <strong>{focusPhaseLabel(kind)}</strong>
        <div style={{ ...styles.textSecondary, fontSize: 13 }}>{title}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onResume} style={styles.actionBtn}>
          Resume
        </button>
        <button type="button" onClick={onExit} style={styles.ghostBtn}>
          Exit focus
        </button>
      </div>
    </div>
  );
}
