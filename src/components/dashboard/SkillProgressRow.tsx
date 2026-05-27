import type { SkillDayRow } from "../../core/dashboardStats";
import type { CompletionStatus } from "../../core/schedule";
import { styles } from "../../ui/appStyles";
import { formatMinutes, priorityEmoji } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";

export type SkillProgressRowProps = {
  row: SkillDayRow;
};

function statusLabel(status: CompletionStatus): string {
  if (status === "onTrack") return "🟢 On track";
  if (status === "overdue") return "🔴 Overdue";
  return "⚪ Idle";
}

function statusStyle(status: CompletionStatus) {
  if (status === "onTrack") return styles.statusOnTrack;
  if (status === "overdue") return styles.statusOverdue;
  return styles.statusIdle;
}

export function SkillProgressRow({ row }: SkillProgressRowProps) {
  const { skill, todayMinutes, expectedByNow, status, progressTargetMinutes } = row;
  const goalLabel =
    skill.dailyGoalMinutes !== undefined ? formatMinutes(skill.dailyGoalMinutes) : "—";

  const progressLabel =
    progressTargetMinutes !== null
      ? `${formatMinutes(todayMinutes)} of ${formatMinutes(progressTargetMinutes)}`
      : undefined;

  return (
    <div style={styles.listRow}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 16 }}>
          {priorityEmoji(skill.priority)} <b>{skill.name}</b>
        </div>

        <span style={{ ...styles.statusPill, ...statusStyle(status) }}>{statusLabel(status)}</span>
      </div>

      <p style={{ opacity: 0.8, margin: "4px 0 0 0" }}>
        Today: <b>{formatMinutes(todayMinutes)}</b> · Expected by now:{" "}
        <b>{formatMinutes(expectedByNow)}</b> · Goal: <b>{goalLabel}</b>
      </p>

      {progressTargetMinutes !== null && (
        <div style={{ marginTop: 10 }}>
          <ProgressBar
            value={todayMinutes}
            max={progressTargetMinutes}
            label={progressLabel}
          />
        </div>
      )}
    </div>
  );
}
