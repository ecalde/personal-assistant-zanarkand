import { useMemo } from "react";
import { minutesThisWeekForSkill, type SkillDayRow } from "../../core/dashboardStats";
import type { Priority, Session } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { formatMinutes, priorityEmoji } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";

export type WeeklyPreviewSectionProps = {
  rows: SkillDayRow[];
  sessions: Session[];
};

function sortRows(rows: SkillDayRow[]): SkillDayRow[] {
  const pr = (p?: Priority) => (p ?? 999);
  return [...rows].sort((a, b) => {
    const ap = pr(a.skill.priority);
    const bp = pr(b.skill.priority);
    if (ap !== bp) return ap - bp;
    return a.skill.name.localeCompare(b.skill.name);
  });
}

export function WeeklyPreviewSection({ rows, sessions }: WeeklyPreviewSectionProps) {
  const weeklyRows = useMemo(
    () =>
      sortRows(
        rows.filter(
          (r) =>
            r.skill.weeklyGoalMinutes !== undefined &&
            r.skill.weeklyGoalMinutes > 0
        )
      ),
    [rows]
  );

  if (weeklyRows.length === 0) {
    return null;
  }

  return (
    <section style={styles.dashboardSection} aria-label="Weekly preview">
      <h2 style={{ fontWeight: 800, margin: "0 0 4px 0", fontSize: 16 }}>Weekly preview</h2>
      <p style={{ margin: "0 0 10px 0", fontSize: 13, opacity: 0.8 }}>Logged this week</p>

      <div style={{ display: "grid", gap: 8 }}>
        {weeklyRows.map((row) => {
          const { skill } = row;
          const weeklyGoal = skill.weeklyGoalMinutes!;
          const loggedThisWeek = minutesThisWeekForSkill(sessions, skill.id);
          const progressLabel = `${formatMinutes(loggedThisWeek)} of ${formatMinutes(weeklyGoal)}`;

          return (
            <div key={skill.id} style={styles.listRow}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>
                {priorityEmoji(skill.priority)} <b>{skill.name}</b>
              </div>

              <p style={{ opacity: 0.8, margin: "0 0 10px 0", fontSize: 13 }}>
                Logged this week: <b>{formatMinutes(loggedThisWeek)}</b> /{" "}
                <b>{formatMinutes(weeklyGoal)}</b>
              </p>

              <ProgressBar value={loggedThisWeek} max={weeklyGoal} label={progressLabel} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
