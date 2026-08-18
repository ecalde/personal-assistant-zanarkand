import type { SupplementIntakeLog, SupplementProtocol } from "../../core/model";
import {
  SUPPLEMENT_FORM_LABELS,
  currentAdherenceStreak,
  formatDoseSummary,
  resolvePhaseForDate,
} from "../../core/supplements";
import { styles } from "../../ui/appStyles";

export type SupplementProtocolCardProps = {
  protocol: SupplementProtocol;
  logs: readonly SupplementIntakeLog[];
  todayKey: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function SupplementProtocolCard({
  protocol,
  logs,
  todayKey,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: SupplementProtocolCardProps) {
  const currentPhase = resolvePhaseForDate(protocol, todayKey);
  const maintenance = [...protocol.phases].reverse().find((phase) => phase.kind === "maintenance");
  const summaryPhase = currentPhase ?? maintenance ?? protocol.phases[0];
  const hasLoading = protocol.phases.some((phase) => phase.kind === "loading");
  const streak = currentAdherenceStreak(protocol, logs, todayKey);

  return (
    <div style={{ ...styles.listRow, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>{protocol.name}</strong>
          {!protocol.active && <span style={styles.statusPill}>Paused</span>}
          {hasLoading && <span style={styles.statusPill}>Loading + maintenance</span>}
          {streak.current > 0 && (
            <span
              style={streak.activeToday ? styles.streakPill : styles.streakPillMuted}
              title={
                streak.activeToday
                  ? `${streak.current}-day supplement streak`
                  : "Log today's doses to extend this streak"
              }
            >
              {streak.current}-day streak
            </span>
          )}
          {protocol.form && (
            <span style={{ ...styles.textMuted, fontSize: 13 }}>
              {SUPPLEMENT_FORM_LABELS[protocol.form]}
            </span>
          )}
        </div>

        {summaryPhase && (
          <div style={{ ...styles.textSecondary, fontSize: 13 }}>
            {formatDoseSummary(summaryPhase, protocol.unit)}
            {currentPhase && currentPhase.kind === "loading" ? " · loading now" : ""}
          </div>
        )}

        {expanded && protocol.notes && (
          <div style={{ fontSize: 13, ...styles.textSecondary, whiteSpace: "pre-wrap" }}>
            {protocol.notes}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {protocol.notes ? (
            <button type="button" onClick={onToggleExpand}>
              {expanded ? "Hide notes" : "Notes"}
            </button>
          ) : null}
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
