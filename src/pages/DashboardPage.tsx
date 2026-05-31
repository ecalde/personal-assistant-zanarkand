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
import { buildSkillProgressions } from "../core/progression";
import { buildProgressionSnapshot } from "../core/progressionSnapshot";
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
import { CalendarCategorySidebar } from "../components/calendar/CalendarCategorySidebar";
import { useCalendarController } from "../components/calendar/useCalendarController";
import { CareerActionsSection } from "../components/dashboard/CareerActionsSection";
import { DashboardCalendarWidget } from "../components/dashboard/DashboardCalendarWidget";
import { DashboardQuickActions } from "../components/dashboard/DashboardQuickActions";
import { DailyBriefingSection } from "../components/dashboard/DailyBriefingSection";
import { DailyFocusSection } from "../components/dashboard/DailyFocusSection";
import { FitnessSummarySection } from "../components/dashboard/FitnessSummarySection";
import { UpcomingEventsSection } from "../components/dashboard/UpcomingEventsSection";
import { PeopleRemindersSection } from "../components/dashboard/PeopleRemindersSection";
import { OverdueBehindSection } from "../components/dashboard/OverdueBehindSection";
import { ProgressionPanel } from "../components/dashboard/ProgressionPanel";
import { ActiveQuestsCard } from "../components/dashboard/ActiveQuestsCard";
import { AchievementShowcase } from "../components/dashboard/AchievementShowcase";
import { LevelUpToast } from "../components/dashboard/LevelUpToast";
import { SkillProgressSection } from "../components/dashboard/SkillProgressSection";
import { TimelineSection } from "../components/dashboard/TimelineSection";
import {
  UnifiedTimelineSection,
  type ScheduleBlockEnrichment,
} from "../components/dashboard/UnifiedTimelineSection";
import { TodayHero } from "../components/dashboard/TodayHero";
import { WeeklyPreviewSection } from "../components/dashboard/WeeklyPreviewSection";
import { WeeklyReviewSection } from "../components/dashboard/WeeklyReviewSection";
import { useIsDesktopViewport } from "../ui/useMediaQuery";
import type {
  AppPayload,
  CalendarColorPreferences,
  CareerTarget,
  FocusFeedback,
  GamificationState,
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

/** UI-only preference key: dashboard calendar month/week view, client-local (not synced). */
const DASHBOARD_CALENDAR_VIEW_MODE_KEY = "pa.dashboardCalendar.viewMode.v1";

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
  gamificationState?: GamificationState;
  onAcknowledgeGlobalLevel?: (level: number) => void;
  onDismissAchievement?: (definitionId: string) => void;
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
  gamificationState,
  onAcknowledgeGlobalLevel,
  onDismissAchievement,
}: DashboardPageProps) {
  const today = formatLocalDateKey(new Date());
  const isDesktop = useIsDesktopViewport();

  const calendar = useCalendarController({
    skills,
    events,
    people,
    workoutSessions,
    workoutPlans,
    todayKey: today,
    viewModePersistenceKey: DASHBOARD_CALENDAR_VIEW_MODE_KEY,
  });

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

  const progressionSnapshot = useMemo(() => {
    const payload: AppPayload = {
      skills,
      sessions,
      overrides: [],
      events,
      people,
      jobApplications,
      careerTarget,
      workoutPlans,
      workoutSessions,
      focusFeedback,
      gamificationState,
    };
    return buildProgressionSnapshot(payload, gamificationState);
  }, [
    skills,
    sessions,
    events,
    people,
    jobApplications,
    careerTarget,
    workoutPlans,
    workoutSessions,
    focusFeedback,
    gamificationState,
  ]);

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
        workoutPlans,
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
      workoutPlans,
      workoutSessions,
      focusFeedback,
      today,
    ]
  );

  // Section blocks composed differently for desktop (three columns) vs. mobile (stacked).
  const todayStrip = <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} />;

  const calendarWidget = (
    <DashboardCalendarWidget
      controller={calendar}
      todayKey={today}
      calendarPreferences={calendarPreferences}
      onOpenCalendar={onOpenCalendar}
    />
  );

  const dailyFocus = (
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
  );

  const categoryFilters = (
    <CalendarCategorySidebar
      hiddenCategories={calendar.hiddenCategories}
      onToggleCategory={calendar.toggleCategory}
      preferences={calendarPreferences}
    />
  );

  const quickActions = (
    <DashboardQuickActions
      onOpenSkills={onOpenSkills}
      onOpenEvents={onOpenEvents}
      onOpenPeople={onOpenPeople}
      onOpenCareer={onOpenCareer}
      onOpenFitness={onOpenFitness}
      onOpenReview={onOpenReview}
      onOpenCalendar={onOpenCalendar}
    />
  );

  const dailyBriefingBlock = <DailyBriefingSection briefing={dailyBriefing} />;

  const upcomingEvents = (
    <UpcomingEventsSection
      items={upcomingEventItems}
      windowDays={UPCOMING_EVENTS_WINDOW_DAYS}
      people={people}
    />
  );

  const weeklyReviewSection = (
    <WeeklyReviewSection review={weeklyReview} onOpenReview={onOpenReview} />
  );

  const careerAlerts = (
    <CareerActionsSection
      jobApplications={jobApplications}
      todayKey={today}
      onOpenCareer={onOpenCareer}
    />
  );

  const fitnessAlerts = (
    <FitnessSummarySection
      workoutPlans={workoutPlans}
      workoutSessions={workoutSessions}
      todayKey={today}
      onOpenFitness={onOpenFitness}
    />
  );

  const peopleAlerts = (
    <PeopleRemindersSection
      birthdays={upcomingBirthdays}
      followUps={peopleNeedingFollowUp}
      birthdayWindowDays={PEOPLE_BIRTHDAY_WINDOW_DAYS}
    />
  );

  const showProgression =
    skills.length > 0 || progressionSnapshot.global.totalXp > 0;

  const pendingLevelUp = progressionSnapshot.pendingLevelUps[0];
  const levelUpToast =
    pendingLevelUp && onAcknowledgeGlobalLevel ? (
      <LevelUpToast notification={pendingLevelUp} onAcknowledge={onAcknowledgeGlobalLevel} />
    ) : null;

  const progressionPanel = showProgression ? (
    <ProgressionPanel
      global={progressionSnapshot.global}
      axes={progressionSnapshot.axes}
      xpToday={progressionSnapshot.xpToday}
      milestones={progressionSnapshot.milestones}
      layout={isDesktop ? "compact" : "wide"}
    />
  ) : null;

  const questsCard = showProgression ? (
    <ActiveQuestsCard
      daily={progressionSnapshot.quests.daily}
      weekly={progressionSnapshot.quests.weekly}
    />
  ) : null;

  const achievementShowcase = showProgression ? (
    <AchievementShowcase
      unlocked={progressionSnapshot.achievements.unlocked}
      newlyUnlocked={progressionSnapshot.achievements.newlyUnlocked}
      inProgress={progressionSnapshot.achievements.inProgress}
      onDismissAchievement={onDismissAchievement}
    />
  ) : null;

  const detailsBand = (
    <div style={styles.dashboardDetails}>
      {USE_UNIFIED_TIMELINE && (
        <UnifiedTimelineSection
          items={unifiedToday.items}
          workload={todayWorkload}
          scheduleEnrichmentByKey={scheduleEnrichmentByKey}
          onAddSession={onAddSession}
        />
      )}

      {/* CalendarPreviewSection is intentionally NOT rendered here (Phase 32 follow-up):
          DashboardCalendarWidget is the calendar centerpiece. The preview component file
          is retained for now but no longer mounted on the dashboard. */}

      {skills.length === 0 ? (
        <div style={{ opacity: 0.8 }}>
          No skills yet. Go to Skills and add “Learn SQL”, “Blender”, etc.
        </div>
      ) : (
        <>
          <OverdueBehindSection rows={rows} onAddSession={onAddSession} />

          {!USE_UNIFIED_TIMELINE && (
            <TimelineSection
              timelineItems={legacyTimelineItems}
              onAddSession={onAddSession}
            />
          )}

          <SkillProgressSection rows={rows} progressionsBySkillId={progressionsBySkillId} />

          <WeeklyPreviewSection rows={rows} sessions={sessions} />
        </>
      )}
    </div>
  );

  return (
    <div style={styles.card}>
      <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Today</h1>

      {levelUpToast}

      {isDesktop ? (
        <div style={styles.dashboardLayout}>
          <div style={styles.dashboardLeftRail}>
            {progressionPanel}
            {dailyFocus}
            {questsCard}
            {quickActions}
          </div>
          <div style={styles.dashboardCenter}>
            {categoryFilters}
            {calendarWidget}
            {detailsBand}
          </div>
          <div style={styles.dashboardRightRail}>
            <TodayHero rows={rows} totalMinutesToday={todayTotalMinutes} layout="compact" />
            {dailyBriefingBlock}
            {weeklyReviewSection}
            {upcomingEvents}
            {achievementShowcase}
            {careerAlerts}
            {fitnessAlerts}
            {peopleAlerts}
          </div>
        </div>
      ) : (
        <>
          {progressionPanel}
          <div style={styles.dashboardStack}>
            {todayStrip}
            {categoryFilters}
            {calendarWidget}
            {dailyFocus}
            {questsCard}
            {achievementShowcase}
            {dailyBriefingBlock}
            {weeklyReviewSection}
            {upcomingEvents}
            {quickActions}
            {careerAlerts}
            {fitnessAlerts}
            {peopleAlerts}
          </div>
          {detailsBand}
        </>
      )}
    </div>
  );
}
