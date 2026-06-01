import { useMemo } from "react";
import type { SkillDayRow } from "../../core/dashboardStats";
import { styles } from "../../ui/appStyles";
import { formatMinutes, priorityEmoji } from "../../ui/format";
import { QuickLogControls } from "./QuickLogControls";

export type OverdueBehindSectionProps = {
  rows: SkillDayRow[];
  onAddSession: (skillId: string, minutes: number) => void;
};

export function OverdueBehindSection({ rows, onAddSession }: OverdueBehindSectionProps) {
  const overdue = useMemo(
    () => rows.filter((r) => r.status === "overdue"),
    [rows]
  );

  return (
    <section style={styles.dashboardSection} aria-label="Overdue right now">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Overdue right now</h2>

      {overdue.length === 0 ? (
        <p style={{ margin: 0, ...styles.textMuted }}>Nothing overdue 🎉</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {overdue.map((r) => (
            <div key={r.skill.id} style={styles.listRow}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 16 }}>
                  {priorityEmoji(r.skill.priority)} <b>{r.skill.name}</b>
                </div>

                <span style={{ ...styles.statusPill, ...styles.statusOverdue }}>🔴 Overdue</span>
              </div>

              <p style={{ ...styles.textMuted, margin: "4px 0 0 0" }}>
                Today: <b>{formatMinutes(r.todayMinutes)}</b> · Expected by now:{" "}
                <b>{formatMinutes(r.expectedByNow)}</b>
              </p>

              <div style={{ marginTop: 10 }}>
                <QuickLogControls
                  onLog={(minutes) => onAddSession(r.skill.id, minutes)}
                  inputAriaLabel={`Minutes to log for ${r.skill.name}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
