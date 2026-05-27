import { useMemo } from "react";
import {
  buildSkillDayRows,
  buildTimelineItems,
  totalMinutesToday,
} from "../core/dashboardStats";
import { OverdueBehindSection } from "../components/dashboard/OverdueBehindSection";
import { SkillProgressSection } from "../components/dashboard/SkillProgressSection";
import { TodayHero } from "../components/dashboard/TodayHero";
import type { Session, Skill } from "../core/model";
import { styles } from "../ui/appStyles";
import { priorityEmoji } from "../ui/format";

export type DashboardPageProps = {
  skills: Skill[];
  sessions: Session[];
  onAddSession: (skillId: string, minutes: number) => void;
};

export default function DashboardPage({
  skills,
  sessions,
  onAddSession,
}: DashboardPageProps) {
  function commitLog(skillId: string, minutes: number) {
    if (!Number.isInteger(minutes) || minutes <= 0) return;
    onAddSession(skillId, minutes);
  }

  const rows = useMemo(
    () => buildSkillDayRows(skills, sessions),
    [skills, sessions]
  );

  const todayTotalMinutes = useMemo(
    () => totalMinutesToday(sessions),
    [sessions]
  );

  const timelineItems = useMemo(
    () => buildTimelineItems(skills, sessions),
    [skills, sessions]
  );

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>Dashboard (Phase 1)</div>
      <div style={{ opacity: 0.85, marginBottom: 12 }}>
        Next we’ll add: daily timeline, reminders, completion rules, and XP.
      </div>

      <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} />

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <OverdueBehindSection rows={rows} onAddSession={onAddSession} />

          {/* Timeline section */}
          <div style={{ background: "white", border: "1px solid #e5e5e5", padding: 12, borderRadius: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Today’s timeline</div>
              <div style={{ opacity: 0.8, marginBottom: 10 }}>
                Your scheduled blocks for today, sorted by time (based on your weekly template).
              </div>

              {timelineItems.length === 0 ? (
                <div style={{ opacity: 0.8 }}>No schedule blocks for today.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {timelineItems.map((it) => (
                    <div
                      key={`${it.skill.id}:${it.block.id}`}
                      style={{
                        background: "white",
                        border: "1px solid #e5e5e5",
                        padding: 10,
                        borderRadius: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {it.startTime}–{it.endTime} · {priorityEmoji(it.skill.priority)} {it.skill.name}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 13 }}>
                          Block: <b>{it.block.minutes}m</b> · Logged so far: <b>{it.loggedSoFar}m</b>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          style={{
                            ...styles.statusPill,
                            ...(it.status === "done"
                              ? styles.statusOnTrack
                              : it.status === "behind"
                                ? styles.statusOverdue
                                : it.status === "inProgress"
                                  ? styles.statusOnTrack
                                  : styles.statusIdle),
                          }}
                        >
                          {it.status === "done"
                            ? "✅ Done"
                            : it.status === "behind"
                              ? "🔴 Behind"
                              : it.status === "inProgress"
                                ? "🟢 In progress"
                                : "⏳ Upcoming"}
                        </span>

                        <button onClick={() => commitLog(it.skill.id, 15)} style={styles.smallBtn}>
                          +15
                        </button>
                        <button onClick={() => commitLog(it.skill.id, 30)} style={styles.smallBtn}>
                          +30
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          <SkillProgressSection rows={rows} />
        </div>
      )}
    </div>
  );
}
