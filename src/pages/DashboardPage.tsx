import { useMemo } from "react";
import {
  buildSkillDayRows,
  buildTimelineItems,
  totalMinutesToday,
} from "../core/dashboardStats";
import { OverdueBehindSection } from "../components/dashboard/OverdueBehindSection";
import { SkillProgressSection } from "../components/dashboard/SkillProgressSection";
import { TimelineSection } from "../components/dashboard/TimelineSection";
import { TodayHero } from "../components/dashboard/TodayHero";
import { WeeklyPreviewSection } from "../components/dashboard/WeeklyPreviewSection";
import type { Session, Skill } from "../core/model";
import { styles } from "../ui/appStyles";

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
      <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Today</h1>

      <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} />

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <OverdueBehindSection rows={rows} onAddSession={onAddSession} />

          <TimelineSection timelineItems={timelineItems} onAddSession={onAddSession} />

          <SkillProgressSection rows={rows} />

          <WeeklyPreviewSection rows={rows} sessions={sessions} />
        </div>
      )}
    </div>
  );
}
