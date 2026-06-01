import type { SkillDayRow } from "../../core/dashboardStats";
import type { SkillProgression } from "../../core/progression";
import type { CompletionStatus } from "../../core/schedule";
import { styles } from "../../ui/appStyles";
import { formatLevel, formatMinutes, formatXp, priorityEmoji } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";

export type SkillProgressRowProps = {
  row: SkillDayRow;
  progression?: SkillProgression;
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

export function SkillProgressRow({ row, progression }: SkillProgressRowProps) {
  const { skill, todayMinutes, expectedByNow, status, progressTargetMinutes } = row;
  const goalLabel =
    skill.dailyGoalMinutes !== undefined ? formatMinutes(skill.dailyGoalMinutes) : "—";

  const progressLabel =
    progressTargetMinutes !== null
      ? `${formatMinutes(todayMinutes)} of ${formatMinutes(progressTargetMinutes)}`
      : undefined;

  const levelBarLabel =
    progression !== undefined
      ? `${skill.name} ${formatLevel(progression.level)}: ${progression.xpIntoLevel} of ${progression.xpToNextLevel} XP to next level`
      : undefined;

  return (
    <div style={styles.listRow}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 16 }}>
          {priorityEmoji(skill.priority)} <b>{skill.name}</b>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {progression !== undefined && (
            <>
              <span style={styles.levelBadge}>{formatLevel(progression.level)}</span>
              {progression.currentStreak > 0 && (
                <span
                  style={styles.streakPill}
                  title={`Longest: ${progression.longestStreak} day${progression.longestStreak === 1 ? "" : "s"}`}
                >
                  🔥 {progression.currentStreak}
                </span>
              )}
            </>
          )}
          <span style={{ ...styles.statusPill, ...statusStyle(status) }}>{statusLabel(status)}</span>
        </div>
      </div>

      {progression !== undefined && (
        <p style={{ ...styles.textMuted, margin: "6px 0 0 0", fontSize: 13 }}>
          {formatXp(progression.totalXp)} lifetime
          {!progression.streakActiveToday && progression.currentStreak > 0 && (
            <> · <span style={{ ...styles.textSecondary }}>Log today to extend streak</span></>
          )}
        </p>
      )}

      <p style={{ ...styles.textMuted, margin: "4px 0 0 0" }}>
        Today: <b>{formatMinutes(todayMinutes)}</b> · Expected by now:{" "}
        <b>{formatMinutes(expectedByNow)}</b> · Goal: <b>{goalLabel}</b>
      </p>

      {progression !== undefined && (
        <div style={{ marginTop: 10 }}>
          <ProgressBar
            value={progression.xpIntoLevel}
            max={progression.xpToNextLevel}
            label={levelBarLabel}
            variant="xp"
          />
        </div>
      )}

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
