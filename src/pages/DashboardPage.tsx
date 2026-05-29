import { useMemo } from "react";
import { buildDailyBriefing } from "../core/briefing";
import {
  buildDailyFocusSummary,
  buildHeadline,
  FOCUS_DASHBOARD_MAX_ITEMS,
  rankFocusItems,
  type FocusItem,
} from "../core/focus";
import {
  buildHiddenFocusFeedbackItems,
  countSuppressedFocusItems,
  filterSuppressedFocusItems,
} from "../core/focusFeedback";
import {
  buildSkillDayRows,
  buildTimelineItems,
  totalMinutesToday,
} from "../core/dashboardStats";
import { buildGlobalProgression, buildSkillProgressions } from "../core/progression";
import { buildWeeklyReview } from "../core/review";
import { buildUpcomingEventItems } from "../core/events";
import {
  buildPeopleNeedingFollowUp,
  buildUpcomingBirthdayItems,
} from "../core/people";
import {
  buildUnifiedTimelineRange,
  computeDailyWorkloadForDay,
  formatLocalDateKey,
} from "../core/timeline";
import { CalendarPreviewSection } from "../components/dashboard/CalendarPreviewSection";
import { CareerActionsSection } from "../components/dashboard/CareerActionsSection";
import { DailyBriefingSection } from "../components/dashboard/DailyBriefingSection";
import { DailyFocusSection } from "../components/dashboard/DailyFocusSection";
import { FitnessSummarySection } from "../components/dashboard/FitnessSummarySection";
import { UpcomingEventsSection } from "../components/dashboard/UpcomingEventsSection";
import { PeopleRemindersSection } from "../components/dashboard/PeopleRemindersSection";
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
import { WeeklyReviewSection } from "../components/dashboard/WeeklyReviewSection";
import type {
  CalendarColorPreferences,
  CareerTarget,
  FocusFeedback,
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "../core/model";
import { styles } from "../ui/appStyles";

/** Toggle legacy schedule-only timeline during rollout. */
const USE_UNIFIED_TIMELINE = true;

const UPCOMING_EVENTS_WINDOW_DAYS = 14;
const UPCOMING_EVENTS_MAX_ITEMS = 10;
const PEOPLE_BIRTHDAY_WINDOW_DAYS = 30;
const PEOPLE_BIRTHDAY_MAX_ITEMS = 5;
const PEOPLE_FOLLOW_UP_MAX_ITEMS = 5;

export type DashboardPageProps = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  careerTarget?: CareerTarget;
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  focusFeedback: FocusFeedback[];
  onAddSession: (skillId: string, minutes: number) => void;
  onDismissFocusItem: (focusItemId: string, sourceSnapshot?: string) => void;
  onSnoozeFocusItem: (focusItemId: string, hours: number, sourceSnapshot?: string) => void;
  onSnoozeFocusItemUntilTomorrow: (focusItemId: string, sourceSnapshot?: string) => void;
  onRestoreAllFocusItems: () => void;
  onRestoreFocusFeedbackEntry: (feedbackId: string) => void;
  onRestoreFocusItemByFocusId: (focusItemId: string) => void;
  onOpenSkills?: () => void;
  onOpenEvents?: () => void;
  onOpenPeople?: () => void;
  onOpenCareer?: () => void;
  onOpenFitness?: () => void;
  onOpenReview?: () => void;
  onOpenCalendar?: () => void;
  calendarPreferences?: CalendarColorPreferences;
};

export default function DashboardPage({
  skills,
  sessions,
  events,
  people,
  jobApplications,
  careerTarget,
  workoutPlans,
  workoutSessions,
  focusFeedback,
  onAddSession,
  onDismissFocusItem,
  onSnoozeFocusItem,
  onSnoozeFocusItemUntilTomorrow,
  onRestoreAllFocusItems,
  onRestoreFocusFeedbackEntry,
  onOpenSkills,
  onOpenEvents,
  onOpenPeople,
  onOpenCareer,
  onOpenFitness,
  onOpenReview,
  onOpenCalendar,
  calendarPreferences,
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
    const days = buildUnifiedTimelineRange(skills, events, today, today, { people });
    return days[0] ?? { date: today, items: [], conflicts: [] };
  }, [skills, events, people, today]);

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

  const upcomingEventItems = useMemo(
    () =>
      buildUpcomingEventItems(
        events,
        today,
        UPCOMING_EVENTS_WINDOW_DAYS,
        UPCOMING_EVENTS_MAX_ITEMS
      ),
    [events, today]
  );

  const upcomingBirthdays = useMemo(
    () =>
      buildUpcomingBirthdayItems(
        people,
        today,
        PEOPLE_BIRTHDAY_WINDOW_DAYS,
        PEOPLE_BIRTHDAY_MAX_ITEMS
      ),
    [people, today]
  );

  const peopleNeedingFollowUp = useMemo(
    () => buildPeopleNeedingFollowUp(people, today, PEOPLE_FOLLOW_UP_MAX_ITEMS),
    [people, today]
  );

  const dailyFocusSummary = useMemo(
    () =>
      buildDailyFocusSummary({
        skills,
        sessions,
        events,
        people,
        jobApplications,
        careerTarget,
        workoutPlans,
        workoutSessions,
        todayKey: today,
      }),
    [
      skills,
      sessions,
      events,
      people,
      jobApplications,
      careerTarget,
      workoutPlans,
      workoutSessions,
      today,
    ]
  );

  const allRankedFocusItems = useMemo(
    () =>
      rankFocusItems(
        (Object.values(dailyFocusSummary.byCategory) as FocusItem[][]).flat()
      ),
    [dailyFocusSummary]
  );

  const visibleFocusSummary = useMemo(() => {
    const visible = filterSuppressedFocusItems(
      allRankedFocusItems,
      focusFeedback,
      dailyFocusSummary.generatedAtIso
    ).slice(0, FOCUS_DASHBOARD_MAX_ITEMS);

    return {
      ...dailyFocusSummary,
      items: visible,
      headline: buildHeadline(visible),
    };
  }, [dailyFocusSummary, focusFeedback, allRankedFocusItems]);

  const hiddenFocusCount = useMemo(
    () =>
      countSuppressedFocusItems(
        allRankedFocusItems,
        focusFeedback,
        dailyFocusSummary.generatedAtIso
      ),
    [allRankedFocusItems, focusFeedback, dailyFocusSummary.generatedAtIso]
  );

  const hiddenFocusItems = useMemo(
    () =>
      buildHiddenFocusFeedbackItems(
        focusFeedback,
        allRankedFocusItems,
        dailyFocusSummary.generatedAtIso
      ),
    [focusFeedback, allRankedFocusItems, dailyFocusSummary.generatedAtIso]
  );

  const dailyBriefing = useMemo(
    () =>
      buildDailyBriefing({
        skills,
        sessions,
        events,
        people,
        jobApplications,
        workoutPlans,
        workoutSessions,
        focusSummary: dailyFocusSummary,
        unifiedTimelineDay: unifiedToday,
        workload: todayWorkload,
        todayKey: today,
      }),
    [
      skills,
      sessions,
      events,
      people,
      jobApplications,
      workoutPlans,
      workoutSessions,
      dailyFocusSummary,
      unifiedToday,
      todayWorkload,
      today,
    ]
  );

  const weeklyReview = useMemo(
    () =>
      buildWeeklyReview({
        skills,
        sessions,
        events,
        people,
        jobApplications,
        workoutSessions,
        focusFeedback,
        todayKey: today,
      }),
    [
      skills,
      sessions,
      events,
      people,
      jobApplications,
      workoutSessions,
      focusFeedback,
      today,
    ]
  );

  return (
    <div style={styles.card}>
      <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Today</h1>

      {skills.length > 0 && <ProgressionHero progression={globalProgression} />}

      <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} />

      <div style={{ marginTop: 12 }}>
        <DailyBriefingSection briefing={dailyBriefing} />
      </div>

      <div style={{ marginTop: 12 }}>
        <WeeklyReviewSection review={weeklyReview} onOpenReview={onOpenReview} />
      </div>

      <div style={{ marginTop: 12 }}>
        <DailyFocusSection
          summary={visibleFocusSummary}
          hiddenCount={hiddenFocusCount}
          hiddenFocusItems={hiddenFocusItems}
          onDismissFocusItem={onDismissFocusItem}
          onSnoozeFocusItem={onSnoozeFocusItem}
          onSnoozeFocusItemUntilTomorrow={onSnoozeFocusItemUntilTomorrow}
          onRestoreAll={onRestoreAllFocusItems}
          onRestoreFocusFeedbackEntry={onRestoreFocusFeedbackEntry}
          onOpenSkills={onOpenSkills}
          onOpenEvents={onOpenEvents}
          onOpenPeople={onOpenPeople}
          onOpenCareer={onOpenCareer}
          onOpenFitness={onOpenFitness}
          onAddSession={onAddSession}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <UpcomingEventsSection
          items={upcomingEventItems}
          windowDays={UPCOMING_EVENTS_WINDOW_DAYS}
          people={people}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <PeopleRemindersSection
          birthdays={upcomingBirthdays}
          followUps={peopleNeedingFollowUp}
          birthdayWindowDays={PEOPLE_BIRTHDAY_WINDOW_DAYS}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <CareerActionsSection
          jobApplications={jobApplications}
          todayKey={today}
          onOpenCareer={onOpenCareer}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <FitnessSummarySection
          workoutPlans={workoutPlans}
          workoutSessions={workoutSessions}
          todayKey={today}
          onOpenFitness={onOpenFitness}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <CalendarPreviewSection
          skills={skills}
          events={events}
          people={people}
          workoutSessions={workoutSessions}
          workoutPlans={workoutPlans}
          todayKey={today}
          calendarPreferences={calendarPreferences}
          onOpenCalendar={onOpenCalendar}
        />
      </div>

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
