/**
 * Pure Weekly Review Engine — deterministic cross-domain weekly summaries.
 *
 * Reads AppPayload slices and produces read-only WeeklyReview output.
 * No persistence, no AI, no mutations.
 *
 * Future AI extension points (not implemented):
 * - WeeklyReviewContext bundle for "explain my week" prompts
 * - Personalized tone tuning from focus feedback patterns
 * - Prior-week narrative diffs (thisWeek vs lastWeek)
 * - Suggested actions mapped to FocusActionType / page deep-links
 * - Persisted reflections per week (requires schema)
 * - Markdown export from WeeklyReview DTO
 */

import { selectDeterministicTemplate } from "./briefing";
import {
  buildApplicationsNeedingAttention,
  type ApplicationAttentionReason,
} from "./career";
import {
  isInLocalWeek,
  minutesThisWeekForSkill,
  plannedMinutesOnDate,
  startOfWeekLocal,
} from "./dashboardStats";
import {
  addDaysToDateKey,
  daysBetweenDateKeys,
  formatUpcomingEventUrgencyLabel,
  sortPastEvents,
  sortUpcomingEvents,
  type UpcomingEventItem,
} from "./events";
import {
  buildWorkoutWeekScheduleSummary,
  type WorkoutWeekScheduleSummary,
} from "./fitness";
import { resolveHiddenFocusDisplayLabel } from "./focusFeedback";
import {
  buildPeopleNeedingFollowUp,
  type PersonFollowUpItem,
} from "./people";
import {
  buildUnifiedTimelineRange,
  computeDailyWorkload,
  formatLocalDateKey,
  iterateDateRange,
  summarizeWeek,
} from "./timeline";
import { dayKeyFromIso } from "./progression";
import type {
  ApplicationStatus,
  FocusFeedback,
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "./model";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const REVIEW_MAX_WINS = 5;
export const REVIEW_MAX_RISKS = 5;
export const REVIEW_MAX_CONSISTENT_SKILLS = 3;
export const REVIEW_MAX_FOCUS_HIDDEN = 5;

const CONSISTENCY_WIN_THRESHOLD = 0.8;
const CONSISTENCY_RISK_THRESHOLD = 0.5;
const BEHIND_GOAL_RATIO = 0.5;
const FOCUS_REPEAT_RISK_THRESHOLD = 3;
const HEAVY_NEXT_WEEK_EVENTS = 3;
const FITNESS_WIN_SESSION_COUNT = 2;
const FITNESS_WIN_DURATION_MINUTES = 90;
const INTERVIEW_OR_OFFER_STATUSES: ApplicationStatus[] = [
  "screening",
  "technical",
  "onsite",
  "offer",
];

const WEEK_GREETING_TEMPLATES = [
  "Here's your week in review.",
  "A look back at your week.",
  "Your weekly snapshot.",
];

const WEEK_SUMMARY_OPENERS = [
  "This week you logged {skillMinutes} across skills",
  "You put in {skillMinutes} on skills this week",
  "Skill practice totaled {skillMinutes} this week",
];

const FITNESS_SUMMARY_TEMPLATES = [
  "{count} workout(s) logged ({duration}).",
  "Fitness: {count} session(s), {duration} total.",
  "You completed {count} workout(s) ({duration}).",
];

const EMPTY_WEEK_SUMMARY_TEMPLATES = [
  "A quiet week so far — room to build momentum.",
  "Light activity this week — a fresh start awaits.",
  "Not much logged yet this week.",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewTone = "neutral" | "encouraging" | "warning";

export type LocalWeekRange = {
  weekKey: string;
  weekStartKey: string;
  weekEndKey: string;
  weekStartDate: Date;
};

export type SkillWeekRow = {
  skillId: string;
  skillName: string;
  minutesLogged: number;
  weeklyGoalMinutes: number | null;
  goalPercent: number | null;
  activeDays: number;
  scheduledDays: number;
  /** Scheduled-day completion ratio (0–1), null when no scheduled days. */
  completionRate: number | null;
  consistencyScore: number | null;
};

export type SkillWeekSummary = {
  totalMinutes: number;
  skills: SkillWeekRow[];
  topConsistent: SkillWeekRow[];
  missedOrOverdue: SkillWeekRow[];
};

export type FitnessWeekSection = WorkoutWeekScheduleSummary & {
  summaryLine: string;
};

export type CareerWeekItem = {
  id: string;
  company: string;
  roleTitle: string;
  status: ApplicationStatus;
  reason: "updated_this_week" | "needs_attention";
  attentionReason?: ApplicationAttentionReason;
};

export type CareerWeekSection = {
  updatedThisWeek: CareerWeekItem[];
  stillNeedingAttention: CareerWeekItem[];
};

export type PeopleWeekSection = {
  followedUpThisWeek: PersonFollowUpItem[];
  stillNeedingFollowUp: PersonFollowUpItem[];
};

export type EventsWeekSection = {
  completedThisWeek: UpcomingEventItem[];
  upcomingNextWeek: UpcomingEventItem[];
};

export type FocusFeedbackWeekItem = {
  focusItemId: string;
  displayLabel: string;
  dismissCount: number;
  snoozeCount: number;
  totalCount: number;
};

export type FocusFeedbackWeekSection = {
  mostHidden: FocusFeedbackWeekItem[];
  totalDismissed: number;
  totalSnoozed: number;
};

export type WeeklyReview = {
  week: LocalWeekRange;
  greeting: string;
  headline: string;
  summary: string;
  tone: ReviewTone;
  wins: string[];
  risks: string[];
  skills: SkillWeekSummary;
  fitness: FitnessWeekSection;
  career: CareerWeekSection;
  people: PeopleWeekSection;
  events: EventsWeekSection;
  focusFeedback: FocusFeedbackWeekSection;
  generatedAtIso: string;
};

export type BuildWeeklyReviewInput = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  focusFeedback: FocusFeedback[];
  todayKey: string;
  now?: Date;
};

// ---------------------------------------------------------------------------
// Week range helpers
// ---------------------------------------------------------------------------

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

/** ISO-8601 week key (Monday-based), e.g. `2026-W22`. */
export function formatIsoWeekKey(weekStartDate: Date): string {
  const thursday = new Date(weekStartDate);
  thursday.setDate(thursday.getDate() + 3);

  const isoYear = thursday.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const daysSinceMonday = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - daysSinceMonday);

  const diffMs = weekStartDate.getTime() - week1Monday.getTime();
  const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function getLocalWeekRange(todayKey: string, now?: Date): LocalWeekRange {
  const anchor = parseDateKey(todayKey) ?? now ?? new Date();
  const weekStartDate = startOfWeekLocal(anchor);
  const weekStartKey = formatLocalDateKey(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndKey = formatLocalDateKey(weekEndDate);
  const weekKey = formatIsoWeekKey(weekStartDate);

  return { weekKey, weekStartKey, weekEndKey, weekStartDate };
}

export function isDateKeyInLocalWeek(dateKey: string, weekStartDate: Date): boolean {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return date >= weekStartDate && date < weekEnd;
}

export function isIsoInLocalWeek(iso: string, weekStartDate: Date): boolean {
  return isInLocalWeek(iso, weekStartDate);
}

export function buildWeeklyReviewSeed(
  weekStartKey: string,
  scope: string,
  ...parts: (string | number)[]
): string {
  return [weekStartKey, scope, ...parts.map(String)].join("|");
}

function formatMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} hr`;
  return `${hours} hr ${rem} min`;
}

// ---------------------------------------------------------------------------
// Skill week summary
// ---------------------------------------------------------------------------

function countActiveDaysInWeek(
  sessions: Session[],
  skillId: string,
  week: LocalWeekRange
): number {
  const weekDays = iterateDateRange(week.weekStartKey, week.weekEndKey);
  const activeDays = new Set<string>();

  for (const session of sessions) {
    if (session.skillId !== skillId) continue;
    if (!isIsoInLocalWeek(session.startedAtIso, week.weekStartDate)) continue;
    activeDays.add(dayKeyFromIso(session.startedAtIso));
  }

  return weekDays.filter((dayKey) => activeDays.has(dayKey)).length;
}

function countScheduledDaysInWeek(skill: Skill, week: LocalWeekRange): number {
  let count = 0;
  for (const dayKey of iterateDateRange(week.weekStartKey, week.weekEndKey)) {
    if (plannedMinutesOnDate(skill, dayKey) > 0) {
      count += 1;
    }
  }
  return count;
}

function hasMissedScheduledDay(
  skill: Skill,
  sessions: Session[],
  week: LocalWeekRange
): boolean {
  const minutesByDay = new Map<string, number>();
  for (const session of sessions) {
    if (session.skillId !== skill.id) continue;
    if (!isIsoInLocalWeek(session.startedAtIso, week.weekStartDate)) continue;
    const dayKey = dayKeyFromIso(session.startedAtIso);
    minutesByDay.set(dayKey, (minutesByDay.get(dayKey) ?? 0) + session.minutes);
  }

  for (const dayKey of iterateDateRange(week.weekStartKey, week.weekEndKey)) {
    if (plannedMinutesOnDate(skill, dayKey) > 0 && (minutesByDay.get(dayKey) ?? 0) === 0) {
      return true;
    }
  }

  return false;
}

function isSkillMissedOrOverdue(
  row: SkillWeekRow,
  skill: Skill,
  sessions: Session[],
  week: LocalWeekRange
): boolean {
  if (row.scheduledDays === 0) {
    return false;
  }
  if (
    row.weeklyGoalMinutes !== null &&
    row.weeklyGoalMinutes > 0 &&
    row.minutesLogged < row.weeklyGoalMinutes
  ) {
    return true;
  }
  return hasMissedScheduledDay(skill, sessions, week);
}

export function buildSkillWeekSummary(
  skills: Skill[],
  sessions: Session[],
  week: LocalWeekRange,
  now: Date = new Date()
): SkillWeekSummary {
  const rows: SkillWeekRow[] = skills.map((skill) => {
    const minutesLogged = minutesThisWeekForSkill(sessions, skill.id, now);
    const weeklyGoalMinutes =
      skill.weeklyGoalMinutes !== undefined && skill.weeklyGoalMinutes > 0
        ? skill.weeklyGoalMinutes
        : null;
    const goalPercent =
      weeklyGoalMinutes !== null
        ? Math.min(100, Math.round((minutesLogged / weeklyGoalMinutes) * 100))
        : null;
    const activeDays = countActiveDaysInWeek(sessions, skill.id, week);
    const scheduledDays = countScheduledDaysInWeek(skill, week);
    const completionRate =
      scheduledDays > 0 ? activeDays / scheduledDays : null;
    const consistencyScore =
      completionRate !== null ? Math.round(completionRate * 100) / 100 : null;

    return {
      skillId: skill.id,
      skillName: skill.name,
      minutesLogged,
      weeklyGoalMinutes,
      goalPercent,
      activeDays,
      scheduledDays,
      completionRate,
      consistencyScore,
    };
  });

  const totalMinutes = rows.reduce((sum, row) => sum + row.minutesLogged, 0);

  const topConsistent = [...rows]
    .filter((row) => row.scheduledDays >= 1 && row.consistencyScore !== null)
    .sort((a, b) => {
      const scoreDiff = (b.consistencyScore ?? 0) - (a.consistencyScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const scheduledDiff = b.scheduledDays - a.scheduledDays;
      if (scheduledDiff !== 0) return scheduledDiff;
      return a.skillName.localeCompare(b.skillName);
    })
    .slice(0, REVIEW_MAX_CONSISTENT_SKILLS);

  const missedOrOverdue = rows.filter((row) => {
    const skill = skills.find((s) => s.id === row.skillId);
    if (!skill) return false;
    return isSkillMissedOrOverdue(row, skill, sessions, week);
  });

  return { totalMinutes, skills: rows, topConsistent, missedOrOverdue };
}

// ---------------------------------------------------------------------------
// Domain section builders
// ---------------------------------------------------------------------------

export function buildFitnessWeekSection(
  workoutPlans: WorkoutPlan[],
  workoutSessions: WorkoutSession[],
  todayKey: string,
  weekStartKey: string
): FitnessWeekSection {
  const summary = buildWorkoutWeekScheduleSummary(workoutPlans, workoutSessions, todayKey);
  const duration =
    summary.totalDurationMinutes > 0
      ? formatMinutesLabel(summary.totalDurationMinutes)
      : "no duration logged";
  const seed = buildWeeklyReviewSeed(weekStartKey, "fitness-summary", summary.count);
  const template = selectDeterministicTemplate(FITNESS_SUMMARY_TEMPLATES, seed);
  const summaryLine = template
    .replace("{count}", String(summary.count))
    .replace("{duration}", duration);

  return { ...summary, summaryLine };
}

function toCareerWeekItem(
  app: JobApplication,
  reason: CareerWeekItem["reason"],
  attentionReason?: ApplicationAttentionReason
): CareerWeekItem {
  return {
    id: app.id,
    company: app.company,
    roleTitle: app.roleTitle,
    status: app.status,
    reason,
    attentionReason,
  };
}

export function buildCareerWeekSection(
  jobApplications: JobApplication[],
  week: LocalWeekRange,
  todayKey: string
): CareerWeekSection {
  const updatedThisWeek = jobApplications
    .filter((app) => isIsoInLocalWeek(app.updatedAtIso, week.weekStartDate))
    .map((app) => toCareerWeekItem(app, "updated_this_week"))
    .sort((a, b) => a.company.localeCompare(b.company));

  const attentionItems = buildApplicationsNeedingAttention(jobApplications, todayKey);
  const stillNeedingAttention = attentionItems.map((item) =>
    toCareerWeekItem(
      item.application,
      "needs_attention",
      item.reasons[0]
    )
  );

  return { updatedThisWeek, stillNeedingAttention };
}

export function buildPeopleWeekSection(
  people: Person[],
  week: LocalWeekRange,
  todayKey: string
): PeopleWeekSection {
  const followedUpThisWeek: PersonFollowUpItem[] = [];

  for (const person of people) {
    if (!person.lastContactDate) continue;
    if (!isDateKeyInLocalWeek(person.lastContactDate, week.weekStartDate)) continue;

    const daysSinceContact = daysBetweenDateKeys(person.lastContactDate, todayKey);
    if (daysSinceContact === null) continue;

    followedUpThisWeek.push({
      person,
      daysSinceContact,
      cadenceDays: person.contactCadenceDays ?? daysSinceContact,
    });
  }

  followedUpThisWeek.sort((a, b) => a.person.name.localeCompare(b.person.name));

  const stillNeedingFollowUp = buildPeopleNeedingFollowUp(people, todayKey, 20);

  return { followedUpThisWeek, stillNeedingFollowUp };
}

function toUpcomingEventItem(event: LifeEvent, todayKey: string): UpcomingEventItem {
  const daysUntil = daysBetweenDateKeys(todayKey, event.date) ?? 0;
  return {
    event,
    daysUntil,
    urgencyLabel: formatUpcomingEventUrgencyLabel(Math.max(0, daysUntil)),
  };
}

export function buildEventsWeekSection(
  events: LifeEvent[],
  week: LocalWeekRange,
  todayKey: string
): EventsWeekSection {
  const completedEvents = events.filter(
    (event) =>
      event.date >= week.weekStartKey &&
      event.date <= week.weekEndKey &&
      event.date <= todayKey
  );

  const nextWeekEndKey = addDaysToDateKey(week.weekEndKey, 7);
  const upcomingEvents = events.filter(
    (event) =>
      nextWeekEndKey !== null &&
      event.date > week.weekEndKey &&
      event.date <= nextWeekEndKey
  );

  const completedThisWeek = sortPastEvents(completedEvents)
    .slice(0, 10)
    .map((event) => toUpcomingEventItem(event, todayKey));

  const upcomingNextWeek = sortUpcomingEvents(upcomingEvents)
    .slice(0, 10)
    .map((event) => toUpcomingEventItem(event, todayKey));

  return { completedThisWeek, upcomingNextWeek };
}

export function buildFocusFeedbackWeekSection(
  focusFeedback: FocusFeedback[],
  week: LocalWeekRange
): FocusFeedbackWeekSection {
  const inWeek = focusFeedback.filter((entry) =>
    isIsoInLocalWeek(entry.createdAtIso, week.weekStartDate)
  );

  let totalDismissed = 0;
  let totalSnoozed = 0;

  const byFocusId = new Map<
    string,
    { dismissCount: number; snoozeCount: number; latestEntry: FocusFeedback }
  >();

  for (const entry of inWeek) {
    if (entry.action === "dismissed") {
      totalDismissed += 1;
    } else {
      totalSnoozed += 1;
    }

    const existing = byFocusId.get(entry.focusItemId);
    if (!existing) {
      byFocusId.set(entry.focusItemId, {
        dismissCount: entry.action === "dismissed" ? 1 : 0,
        snoozeCount: entry.action === "snoozed" ? 1 : 0,
        latestEntry: entry,
      });
    } else {
      if (entry.action === "dismissed") {
        existing.dismissCount += 1;
      } else {
        existing.snoozeCount += 1;
      }
      if (entry.createdAtIso.localeCompare(existing.latestEntry.createdAtIso) > 0) {
        existing.latestEntry = entry;
      }
    }
  }

  const mostHidden = [...byFocusId.entries()]
    .map(([focusItemId, counts]) => ({
      focusItemId,
      displayLabel: resolveHiddenFocusDisplayLabel(counts.latestEntry),
      dismissCount: counts.dismissCount,
      snoozeCount: counts.snoozeCount,
      totalCount: counts.dismissCount + counts.snoozeCount,
    }))
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.displayLabel.localeCompare(b.displayLabel);
    })
    .slice(0, REVIEW_MAX_FOCUS_HIDDEN);

  return { mostHidden, totalDismissed, totalSnoozed };
}

// ---------------------------------------------------------------------------
// Wins, risks, summary, tone
// ---------------------------------------------------------------------------

function aggregateWeeklyGoalMinutes(skills: SkillWeekRow[]): number {
  return skills.reduce((sum, row) => sum + (row.weeklyGoalMinutes ?? 0), 0);
}

export function collectWeeklyWins(review: WeeklyReview): string[] {
  const wins: string[] = [];

  const goalTotal = aggregateWeeklyGoalMinutes(review.skills.skills);
  if (goalTotal > 0 && review.skills.totalMinutes >= goalTotal) {
    wins.push(
      `Hit your combined weekly skill goal (${formatMinutesLabel(review.skills.totalMinutes)} logged).`
    );
  }

  for (const row of review.skills.topConsistent) {
    if (
      row.consistencyScore !== null &&
      row.consistencyScore >= CONSISTENCY_WIN_THRESHOLD &&
      row.scheduledDays >= 2
    ) {
      wins.push(
        `Strong consistency on ${row.skillName} (${Math.round(row.consistencyScore * 100)}% of scheduled days).`
      );
    }
  }

  if (
    review.fitness.count >= FITNESS_WIN_SESSION_COUNT ||
    review.fitness.totalDurationMinutes >= FITNESS_WIN_DURATION_MINUTES
  ) {
    wins.push(review.fitness.summaryLine.replace(/\.$/, "") + ".");
  }

  const careerAdvance = review.career.updatedThisWeek.filter((item) =>
    INTERVIEW_OR_OFFER_STATUSES.includes(item.status)
  );
  if (careerAdvance.length > 0) {
    const names = careerAdvance.map((item) => `${item.company} (${item.roleTitle})`).join(", ");
    wins.push(`Career progress this week: ${names}.`);
  }

  if (review.people.followedUpThisWeek.length > 0) {
    const names = review.people.followedUpThisWeek.map((item) => item.person.name).join(", ");
    wins.push(`Followed up with ${names}.`);
  }

  if (review.events.completedThisWeek.length > 0) {
    const count = review.events.completedThisWeek.length;
    wins.push(
      count === 1
        ? `Completed 1 life event this week (${review.events.completedThisWeek[0].event.title}).`
        : `Completed ${count} life events this week.`
    );
  }

  return wins.slice(0, REVIEW_MAX_WINS);
}

function daysLeftInWeek(todayKey: string, weekEndKey: string): number | null {
  return daysBetweenDateKeys(todayKey, weekEndKey);
}

function daysElapsedInWeek(weekStartKey: string, todayKey: string): number {
  const elapsed = daysBetweenDateKeys(weekStartKey, todayKey);
  return elapsed !== null ? elapsed + 1 : 1;
}

export function collectWeeklyRisks(review: WeeklyReview, todayKey: string): string[] {
  const risks: string[] = [];
  const daysLeft = daysLeftInWeek(todayKey, review.week.weekEndKey);
  const daysElapsed = daysElapsedInWeek(review.week.weekStartKey, todayKey);

  for (const row of review.skills.skills) {
    if (row.weeklyGoalMinutes !== null && row.weeklyGoalMinutes > 0) {
      const ratio = row.minutesLogged / row.weeklyGoalMinutes;
      const projected = (row.minutesLogged / Math.max(1, daysElapsed)) * 7;
      const behindPace =
        (daysLeft !== null &&
          daysLeft <= 1 &&
          ratio < BEHIND_GOAL_RATIO) ||
        (daysElapsed >= 3 && projected < row.weeklyGoalMinutes);

      if (behindPace) {
        risks.push(
          `${row.skillName} is behind weekly pace (${formatMinutesLabel(row.minutesLogged)} of ${formatMinutesLabel(row.weeklyGoalMinutes)}).`
        );
      }
    }

    if (
      row.scheduledDays >= 2 &&
      row.consistencyScore !== null &&
      row.consistencyScore < CONSISTENCY_RISK_THRESHOLD
    ) {
      risks.push(
        `${row.skillName} missed most scheduled days (${Math.round(row.consistencyScore * 100)}% consistency).`
      );
    }
  }

  if (review.career.stillNeedingAttention.length > 0) {
    const count = review.career.stillNeedingAttention.length;
    risks.push(
      count === 1
        ? "1 job application needs attention."
        : `${count} job applications need attention.`
    );
  }

  if (review.people.stillNeedingFollowUp.length > 0) {
    const count = review.people.stillNeedingFollowUp.length;
    risks.push(
      count === 1
        ? "1 contact is overdue for follow-up."
        : `${count} contacts are overdue for follow-up.`
    );
  }

  if (review.events.upcomingNextWeek.length >= HEAVY_NEXT_WEEK_EVENTS) {
    risks.push(
      `${review.events.upcomingNextWeek.length} events coming up next week — plan ahead.`
    );
  }

  for (const item of review.focusFeedback.mostHidden) {
    if (item.totalCount >= FOCUS_REPEAT_RISK_THRESHOLD) {
      risks.push(
        `Focus item hidden repeatedly: "${item.displayLabel.split("\n")[0]}" (${item.totalCount}×).`
      );
    }
  }

  return risks.slice(0, REVIEW_MAX_RISKS);
}

export function classifyReviewTone(review: WeeklyReview): ReviewTone {
  if (review.risks.length > 0 || review.skills.missedOrOverdue.length >= 2) {
    return "warning";
  }
  if (review.wins.length >= 3 && review.risks.length === 0) {
    return "encouraging";
  }
  return "neutral";
}

export function buildWeeklyHeadline(review: WeeklyReview): string {
  if (review.risks.length > 0) {
    const count = review.risks.length;
    return `${count} risk${count === 1 ? "" : "s"} for next week`;
  }
  if (review.wins.length >= 3) {
    return `${review.wins.length} wins this week`;
  }
  if (review.wins.length > 0) {
    return `${review.wins.length} win${review.wins.length === 1 ? "" : "s"} this week`;
  }
  if (review.skills.totalMinutes > 0) {
    return `${formatMinutesLabel(review.skills.totalMinutes)} logged on skills`;
  }
  return "Quiet week so far";
}

// ---------------------------------------------------------------------------
// Section visibility helpers
// ---------------------------------------------------------------------------

export function isWinsSectionVisible(review: WeeklyReview): boolean {
  return review.wins.length > 0;
}

export function isRisksSectionVisible(review: WeeklyReview): boolean {
  return review.risks.length > 0;
}

export function isSkillsSectionVisible(section: SkillWeekSummary): boolean {
  return section.skills.length > 0;
}

export function isFitnessSectionVisible(section: FitnessWeekSection): boolean {
  return section.count > 0;
}

export function isCareerSectionVisible(section: CareerWeekSection): boolean {
  return (
    section.updatedThisWeek.length > 0 || section.stillNeedingAttention.length > 0
  );
}

export function isPeopleSectionVisible(section: PeopleWeekSection): boolean {
  return (
    section.followedUpThisWeek.length > 0 || section.stillNeedingFollowUp.length > 0
  );
}

export function isEventsSectionVisible(section: EventsWeekSection): boolean {
  return section.completedThisWeek.length > 0 || section.upcomingNextWeek.length > 0;
}

export function isFocusFeedbackSectionVisible(section: FocusFeedbackWeekSection): boolean {
  return section.mostHidden.length > 0;
}

function buildWeeklyGreeting(week: LocalWeekRange): string {
  const seed = buildWeeklyReviewSeed(week.weekStartKey, "greeting");
  return selectDeterministicTemplate(WEEK_GREETING_TEMPLATES, seed);
}

function buildWeeklyReviewSummary(
  review: WeeklyReview,
  skills: Skill[],
  events: LifeEvent[]
): string {
  const parts: string[] = [];
  const seed = buildWeeklyReviewSeed(
    review.week.weekStartKey,
    "summary",
    review.skills.totalMinutes,
    review.fitness.count
  );

  if (review.skills.totalMinutes === 0 && review.fitness.count === 0) {
    parts.push(selectDeterministicTemplate(EMPTY_WEEK_SUMMARY_TEMPLATES, seed));
  } else {
    const openerTemplate = selectDeterministicTemplate(WEEK_SUMMARY_OPENERS, seed);
    parts.push(
      openerTemplate.replace("{skillMinutes}", formatMinutesLabel(review.skills.totalMinutes)) + "."
    );
  }

  if (review.fitness.count > 0) {
    parts.push(review.fitness.summaryLine);
  }

  const timelineDays = buildUnifiedTimelineRange(
    skills,
    events,
    review.week.weekStartKey,
    review.week.weekEndKey
  );
  const weekWorkload = summarizeWeek(computeDailyWorkload(timelineDays));
  if (weekWorkload.totalPlanned > 0) {
    parts.push(
      `Planned skill time this week: ${formatMinutesLabel(weekWorkload.totalPlanned)} across your schedule.`
    );
  }

  if (review.events.upcomingNextWeek.length > 0) {
    parts.push(
      `${review.events.upcomingNextWeek.length} event(s) on the calendar for next week.`
    );
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function buildWeeklyReview(input: BuildWeeklyReviewInput): WeeklyReview {
  const now = input.now ?? new Date();
  const week = getLocalWeekRange(input.todayKey, now);

  const skills = buildSkillWeekSummary(input.skills, input.sessions, week, now);
  const fitness = buildFitnessWeekSection(
    input.workoutPlans,
    input.workoutSessions,
    input.todayKey,
    week.weekStartKey
  );
  const career = buildCareerWeekSection(
    input.jobApplications,
    week,
    input.todayKey
  );
  const people = buildPeopleWeekSection(input.people, week, input.todayKey);
  const events = buildEventsWeekSection(input.events, week, input.todayKey);
  const focusFeedback = buildFocusFeedbackWeekSection(
    input.focusFeedback,
    week
  );

  const partial: WeeklyReview = {
    week,
    greeting: "",
    headline: "",
    summary: "",
    tone: "neutral",
    wins: [],
    risks: [],
    skills,
    fitness,
    career,
    people,
    events,
    focusFeedback,
    generatedAtIso: now.toISOString(),
  };

  partial.wins = collectWeeklyWins(partial);
  partial.risks = collectWeeklyRisks(partial, input.todayKey);
  partial.greeting = buildWeeklyGreeting(week);
  partial.headline = buildWeeklyHeadline(partial);
  partial.summary = buildWeeklyReviewSummary(
    partial,
    input.skills,
    input.events
  );
  partial.tone = classifyReviewTone(partial);

  return partial;
}
