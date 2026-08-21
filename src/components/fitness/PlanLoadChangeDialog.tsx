import { styles } from "../../ui/appStyles";

export type PlanLoadChangeDialogProps = {
  exerciseName: string;
  summary: string;
  onSessionOnly: () => void;
  onUpdatePlan: () => void;
};

export function PlanLoadChangeDialog({
  exerciseName,
  summary,
  onSessionOnly,
  onUpdatePlan,
}: PlanLoadChangeDialogProps) {
  return (
    <div style={styles.calendarModalOverlay} onClick={onSessionOnly} role="presentation">
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-load-change-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.cardTitle} id="plan-load-change-title">
          Also update {exerciseName} on the plan?
        </div>
        <div style={styles.textSecondary}>
          This session already has {summary}. Keep that change here only, or also
          update the workout plan template for next time?
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onSessionOnly} style={styles.ghostBtn}>
            This session only
          </button>
          <button type="button" onClick={onUpdatePlan} style={styles.actionBtn}>
            Update plan too
          </button>
        </div>
      </div>
    </div>
  );
}
