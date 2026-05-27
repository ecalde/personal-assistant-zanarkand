import { useMemo } from "react";
import {
  buildSkillDayRows,
  buildTimelineItems,
  totalMinutesToday,
} from "../core/dashboardStats";
import { buildGlobalProgression, buildSkillProgressions } from "../core/progression";
import {
  buildUnifiedTimelineRange,
  computeDailyWorkloadForDay,
  formatLocalDateKey,
} from "../core/timeline";
import { OverdueBehindSection } from "../components/dashboard/OverdueBehindSection";
import { ProgressionHero } from "../components/dashboard/ProgressionHero";
import { SkillProgressSection } from "../components/dashboard/SkillProgressSection";
import { TimelineSection } from "../components/dashboard/TimelineSection";
import {
  UnifiedTimelineSection,
  type ScheduleBlockEnrichment,
} from "../components/dashboard/UnifiedTimelineSection";
import { TodayHero } from "../components/dashboard/TodayHero";
import { WeeklyPreviewSection } from "../components/dashboard/WeeklyPreviewSection";
import type { LifeEvent, Session, Skill } from "../core/model";
import { styles } from "../ui/appStyles";

/** Toggle legacy schedule-only timeline during rollout. */
const USE_UNIFIED_TIMELINE = true;

export type DashboardPageProps = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  onAddSession: (skillId: string, minutes: number) => void;
};

export default function DashboardPage({
  skills,
  sessions,
  events,
  onAddSession,
}: DashboardPageProps) {
  const today = formatLocalDateKey(new Date());

  const rows = useMemo(
    () => buildSkillDayRows(skills, sessions),
    [skills, sessions]
  );

  const todayTotalMinutes = useMemo(
    () => totalMinutesToday(sessions),
    [sessions]
  );

  const legacyTimelineItems = useMemo(
    () => buildTimelineItems(skills, sessions),
    [skills, sessions]
  );

  const unifiedToday = useMemo(() => {
    const days = buildUnifiedTimelineRange(skills, events, today, today);
    return days[0] ?? { date: today, items: [], conflicts: [] };
  }, [skills, events, today]);

  const todayWorkload = useMemo(
    () => computeDailyWorkloadForDay(unifiedToday),
    [unifiedToday]
  );

  const scheduleEnrichmentByKey = useMemo(() => {
    const map: Record<string, ScheduleBlockEnrichment> = {};
    for (const item of legacyTimelineItems) {
      map[`${item.skill.id}:${item.block.id}`] = {
        blockStatus: item.status,
        loggedSoFar: item.loggedSoFar,
      };
    }
    return map;
  }, [legacyTimelineItems]);

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

      {USE_UNIFIED_TIMELINE && (
        <div style={{ marginTop: 12 }}>
          <UnifiedTimelineSection
            items={unifiedToday.items}
            workload={todayWorkload}
            scheduleEnrichmentByKey={scheduleEnrichmentByKey}
            onAddSession={onAddSession}
          />
        </div>
      )}

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8, marginTop: 12 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <OverdueBehindSection rows={rows} onAddSession={onAddSession} />

          {!USE_UNIFIED_TIMELINE && (
            <TimelineSection
              timelineItems={legacyTimelineItems}
              onAddSession={onAddSession}
            />
          )}

          <SkillProgressSection rows={rows} progressionsBySkillId={progressionsBySkillId} />

          <WeeklyPreviewSection rows={rows} sessions={sessions} />
        </div>
      )}
    </div>
  );
}
