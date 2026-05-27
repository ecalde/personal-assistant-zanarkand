import { useMemo } from "react";
import {
  buildSkillDayRows,
  buildTimelineItems,
  totalMinutesToday,
} from "../core/dashboardStats";
import { buildGlobalProgression, buildSkillProgressions } from "../core/progression";
import { OverdueBehindSection } from "../components/dashboard/OverdueBehindSection";
import { ProgressionHero } from "../components/dashboard/ProgressionHero";
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

  const globalProgression = useMemo(
    () => buildGlobalProgression(skills, sessions),
    [skills, sessions]
  );

  const progressionsBySkillId = useMemo(() => {
    const progressions = buildSkillProgressions(skills, sessions);
    return Object.fromEntries(progressions.map((p) => [p.skill.id, p]));
  }, [skills, sessions]);

  return (
    <div style={styles.card}>
      <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Today</h1>

      {skills.length > 0 && <ProgressionHero progression={globalProgression} />}

      <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} />

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <OverdueBehindSection rows={rows} onAddSession={onAddSession} />

          <TimelineSection timelineItems={timelineItems} onAddSession={onAddSession} />

          <SkillProgressSection rows={rows} progressionsBySkillId={progressionsBySkillId} />

          <WeeklyPreviewSection rows={rows} sessions={sessions} />
        </div>
      )}
    </div>
  );
}
