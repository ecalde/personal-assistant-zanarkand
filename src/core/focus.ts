/**
 * Pure Daily Focus Engine — ranked read-only recommendations.
 *
 * Future AI extension points (not implemented):
 * - FocusContext bundle for "explain my day" prompts
 * - Natural-language summaries from reasonCodes + context
 * - Personalized weight tuning from user feedback
 *
 * Future: buildFocusContext(summary: DailyFocusSummary): FocusContext
 */

import { buildSkillDayRows } from "./dashboardStats";
import {
  addDaysToDateKey,
  buildUpcomingEventItems,
  daysBetweenDateKeys,
} from "./events";
import {
  addMinutesToHHMM,
  minutesSinceMidnight,
  parseHHMMToMinutes,
  weekdayFromDate,
} from "./schedule";
import {
  buildApplicationsNeedingAttention,
  buildInterviewStageSummary,
  buildSkillGapPriorityList,
  type ApplicationAttentionReason,
} from "./career";
import {
  buildWorkoutWeekSummary,
  getLastSession,
} from "./fitness";
import type {
  CareerTarget,
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import {
  buildPeopleNeedingFollowUp,
  buildUpcomingBirthdayItems,
  resolveEventPersonLabel,
} from "./people";
import { buildSkillProgressions } from "./progression";
import {
  buildUnifiedTimelineRange,
  computeDailyWorkloadForDay,
  formatLocalDateKey,
  type TimelineConflict,
} from "./timeline";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const FOCUS_DASHBOARD_MAX_ITEMS = 5;
export const FOCUS_PER_CATEGORY_CAP = 4;
export const STREAK_RISK_MIN_HOUR = 16;
export const EVENING_HOUR = 18;
export const MORNING_HOUR = 12;
export const HIGH_BLOCKED_MINUTES = 480;
export const LOW_AVAILABLE_SKILL_MINUTES = 30;
export const FITNESS_LONG_GAP_DAYS = 4;
export const PEOPLE_BIRTHDAY_SOON_DAYS = 7;

const CATEGORY_BASE: Partial<Record<FocusReasonCode, number>> = {
  timeline_schedule_conflict: 900,
  timeline_high_blocked_time: 650,
  timeline_low_available_skill_time: 550,
  event_today: 850,
  event_tomorrow: 800,
  event_urgent_upcoming: 720,
  event_deadline: 780,
  skill_overdue: 800,
  skill_streak_at_risk: 750,
  skill_daily_goal_incomplete: 620,
  skill_high_priority: 480,
  people_birthday_today: 700,
  people_birthday_soon: 520,
  people_follow_up_overdue: 680,
  career_stuck_in_stage: 760,
  career_no_response: 740,
  career_saved_not_applied: 600,
  career_interview_active: 580,
  career_skill_gap: 500,
  fitness_long_gap_since_last: 450,
  fitness_no_workout_this_week: 420,
  fitness_log_from_plan: 350,
};

const CATEGORY_TIEBREAK_ORDER: Record<FocusCategory, number> = {
  timeline: 0,
  event: 1,
  skill: 2,
  people: 3,
  career: 4,
  fitness: 5,
};

const FOCUS_CATEGORIES: FocusCategory[] = [
  "skill",
  "event",
  "people",
  "career",
  "fitness",
  "timeline",
];

const ATTENTION_REASON_TO_FOCUS: Record<ApplicationAttentionReason, FocusReasonCode> = {
  saved_not_applied: "career_saved_not_applied",
  no_response: "career_no_response",
  stuck_in_stage: "career_stuck_in_stage",
};

const FOCUS_CATEGORY_LABELS: Record<FocusCategory, string> = {
  skill: "Skill",
  event: "Event",
  people: "People",
  career: "Career",
  fitness: "Fitness",
  timeline: "Timeline",
};

const URGENCY_LABELS: Record<FocusPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FocusCategory =
  | "skill"
  | "event"
  | "people"
  | "career"
  | "fitness"
  | "timeline";

export type FocusPriority = "critical" | "high" | "medium" | "low";

export type FocusReasonCode =
  | "skill_overdue"
  | "skill_daily_goal_incomplete"
  | "skill_streak_at_risk"
  | "skill_high_priority"
  | "event_today"
  | "event_tomorrow"
  | "event_urgent_upcoming"
  | "event_deadline"
  | "people_birthday_today"
  | "people_birthday_soon"
  | "people_follow_up_overdue"
  | "career_saved_not_applied"
  | "career_no_response"
  | "career_stuck_in_stage"
  | "career_interview_active"
  | "career_skill_gap"
  | "fitness_no_workout_this_week"
  | "fitness_long_gap_since_last"
  | "fitness_log_from_plan"
  | "timeline_schedule_conflict"
  | "timeline_high_blocked_time"
  | "timeline_low_available_skill_time";

export type FocusActionType =
  | "open_skills"
  | "open_events"
  | "open_people"
  | "open_career"
  | "open_fitness"
  | "log_skill_minutes"
  | "contact_person"
  | "apply_to_job"
  | "schedule_workout"
  | "resolve_conflict";

export type FocusItem = {
  id: string;
  category: FocusCategory;
  title: string;
  description: string;
  priorityScore: number;
  urgency: FocusPriority;
  urgencyLabel: string;
  actionLabel?: string;
  sourceId?: string;
  estimatedMinutes?: number;
  reasonCodes: FocusReasonCode[];
  suggestedActionType?: FocusActionType;
  actionTargetId?: string;
  expiresAtIso?: string;
};

export type DailyFocusContext = {
  skillOverdueCount: number;
  eventsTodayCount: number;
  timelineConflictMinutes: number;
  netAvailableSkillMinutes: number;
  workoutsThisWeek: number;
  applicationsNeedingAttention: number;
};

export type DailyFocusSummary = {
  todayKey: string;
  generatedAtIso: string;
  items: FocusItem[];
  byCategory: Record<FocusCategory, FocusItem[]>;
  headline?: string;
  context: DailyFocusContext;
};

export type BuildDailyFocusInput = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  careerTarget?: CareerTarget;
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  todayKey: string;
  now?: Date;
  opts?: { maxItems?: number; perCategoryCap?: number };
};

type FocusScoreComponents = {
  categoryBase: number;
  urgencyBonus: number;
  severityBonus: number;
  skillPriorityBonus: number;
  timeOfDayBonus: number;
};

export type FocusItemDraft = {
  id: string;
  category: FocusCategory;
  title: string;
  description: string;
  actionLabel?: string;
  sourceId?: string;
  estimatedMinutes?: number;
  reasonCodes: FocusReasonCode[];
  score: FocusScoreComponents;
  suggestedActionType?: FocusActionType;
  actionTargetId?: string;
  expiresAtIso?: string;
};

function emptyByCategory(): Record<FocusCategory, FocusItem[]> {
  return {
    skill: [],
    event: [],
    people: [],
    career: [],
    fitness: [],
    timeline: [],
  };
}

// ---------------------------------------------------------------------------
// Time helpers (pure, derived expiration timestamps)
// ---------------------------------------------------------------------------

function parseDateKeyToLocalDate(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function endOfLocalDayIso(dateKey: string): string {
  const date = parseDateKeyToLocalDate(dateKey);
  if (!date) return new Date().toISOString();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return end.toISOString();
}

export function addHoursIso(iso: string, hours: number): string {
  const date = new Date(iso);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function localDateTimeIso(dateKey: string, hhmm: string): string | null {
  const date = parseDateKeyToLocalDate(dateKey);
  if (!date) return null;
  const minutes = parseHHMMToMinutes(hhmm);
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, 0, 0).toISOString();
}

function startOfNextLocalDayIso(dateKey: string): string {
  const nextKey = addDaysToDateKey(dateKey, 1);
  if (!nextKey) return addDaysIso(endOfLocalDayIso(dateKey), 0);
  const date = parseDateKeyToLocalDate(nextKey);
  if (!date) return addDaysIso(endOfLocalDayIso(dateKey), 0);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
}

function skillBlockEndExpirationIso(skill: Skill, todayKey: string, now: Date): string {
  const dayKey = weekdayFromDate(now);
  const blocks = skill.schedule[dayKey] ?? [];
  const nowMin = minutesSinceMidnight(now);
  let latestEndMin = -1;
  let latestEndHhmm: string | null = null;

  for (const block of blocks) {
    const startMin = parseHHMMToMinutes(block.startTime);
    const endMin = startMin + block.minutes;
    if (nowMin >= startMin && endMin > latestEndMin) {
      latestEndMin = endMin;
      latestEndHhmm = addMinutesToHHMM(block.startTime, block.minutes);
    }
  }

  if (latestEndHhmm) {
    const iso = localDateTimeIso(todayKey, latestEndHhmm);
    if (iso) return iso;
  }

  return endOfLocalDayIso(todayKey);
}

function eventExpirationIso(event: LifeEvent, todayKey: string): string {
  if (event.endTime) {
    const iso = localDateTimeIso(event.date, event.endTime);
    if (iso) return iso;
  }
  if (event.startTime && !event.endTime) {
    const iso = localDateTimeIso(event.date, event.startTime);
    if (iso) return addHoursIso(iso, 1);
  }
  return endOfLocalDayIso(event.date || todayKey);
}

function laterIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function formatFocusActionLabel(actionType: FocusActionType): string {
  switch (actionType) {
    case "log_skill_minutes":
      return "Log minutes";
    case "open_events":
      return "Open event";
    case "open_people":
      return "Open people";
    case "contact_person":
      return "Contact";
    case "apply_to_job":
      return "Apply";
    case "open_career":
      return "View career";
    case "schedule_workout":
      return "Start workout";
    case "resolve_conflict":
      return "Review conflict";
    case "open_skills":
      return "Open skills";
    case "open_fitness":
      return "View fitness";
  }
}

export function formatFocusExpirationHint(
  expiresAtIso: string,
  nowIso?: string
): string | undefined {
  const nowMs = new Date(nowIso ?? new Date().toISOString()).getTime();
  const expiresMs = new Date(expiresAtIso).getTime();
  const diffMs = expiresMs - nowMs;
  if (diffMs <= 0) return undefined;

  const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return diffHours <= 1 ? "Expires within an hour" : `Expires in ~${diffHours}h`;
  }

  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return diffDays === 1 ? "Expires tomorrow" : `Expires in ~${diffDays} days`;
}

export function filterExpiredFocusItems(items: FocusItem[], nowIso?: string): FocusItem[] {
  const now = nowIso ?? new Date().toISOString();
  return items.filter((item) => !item.expiresAtIso || item.expiresAtIso > now);
}

// ---------------------------------------------------------------------------
// Scoring utilities
// ---------------------------------------------------------------------------

export function priorityFromScore(score: number): FocusPriority {
  if (score >= 950) return "critical";
  if (score >= 750) return "high";
  if (score >= 500) return "medium";
  return "low";
}

function primaryReasonCode(codes: FocusReasonCode[]): FocusReasonCode {
  let best = codes[0];
  let bestBase = CATEGORY_BASE[best] ?? 0;
  for (const code of codes.slice(1)) {
    const base = CATEGORY_BASE[code] ?? 0;
    if (base > bestBase) {
      best = code;
      bestBase = base;
    }
  }
  return best;
}

function sumScoreComponents(score: FocusScoreComponents): number {
  return (
    score.categoryBase +
    score.urgencyBonus +
    score.severityBonus +
    score.skillPriorityBonus +
    score.timeOfDayBonus
  );
}

export function scoreFocusItem(draft: FocusItemDraft): FocusItem {
  const priorityScore = sumScoreComponents(draft.score);
  const urgency = priorityFromScore(priorityScore);
  const actionLabel =
    draft.actionLabel ??
    (draft.suggestedActionType ? formatFocusActionLabel(draft.suggestedActionType) : undefined);

  return {
    id: draft.id,
    category: draft.category,
    title: draft.title,
    description: draft.description,
    priorityScore,
    urgency,
    urgencyLabel: URGENCY_LABELS[urgency],
    actionLabel,
    sourceId: draft.sourceId,
    estimatedMinutes: draft.estimatedMinutes,
    reasonCodes: draft.reasonCodes,
    suggestedActionType: draft.suggestedActionType,
    actionTargetId: draft.actionTargetId,
    expiresAtIso: draft.expiresAtIso,
  };
}

function mergeKey(item: FocusItemDraft): string {
  return `${item.category}:${item.sourceId ?? item.id}`;
}

function maxScore(a: FocusScoreComponents, b: FocusScoreComponents): FocusScoreComponents {
  return {
    categoryBase: Math.max(a.categoryBase, b.categoryBase),
    urgencyBonus: Math.max(a.urgencyBonus, b.urgencyBonus),
    severityBonus: Math.max(a.severityBonus, b.severityBonus),
    skillPriorityBonus: Math.max(a.skillPriorityBonus, b.skillPriorityBonus),
    timeOfDayBonus: Math.max(a.timeOfDayBonus, b.timeOfDayBonus),
  };
}

export function mergeFocusItems(drafts: FocusItemDraft[]): FocusItemDraft[] {
  const byKey = new Map<string, FocusItemDraft>();

  for (const draft of drafts) {
    const key = mergeKey(draft);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...draft,
        reasonCodes: [...draft.reasonCodes],
        score: { ...draft.score },
      });
      continue;
    }

    const mergedCodes = [...new Set([...existing.reasonCodes, ...draft.reasonCodes])];
    const primary = primaryReasonCode(mergedCodes);
    const primaryBase = CATEGORY_BASE[primary] ?? existing.score.categoryBase;

    byKey.set(key, {
      ...existing,
      title: draft.score.categoryBase >= existing.score.categoryBase ? draft.title : existing.title,
      description:
        draft.score.categoryBase >= existing.score.categoryBase
          ? draft.description
          : existing.description,
      actionLabel: draft.actionLabel ?? existing.actionLabel,
      suggestedActionType:
        draft.score.categoryBase >= existing.score.categoryBase
          ? (draft.suggestedActionType ?? existing.suggestedActionType)
          : (existing.suggestedActionType ?? draft.suggestedActionType),
      actionTargetId:
        draft.score.categoryBase >= existing.score.categoryBase
          ? (draft.actionTargetId ?? existing.actionTargetId)
          : (existing.actionTargetId ?? draft.actionTargetId),
      expiresAtIso: laterIso(existing.expiresAtIso, draft.expiresAtIso),
      estimatedMinutes: Math.max(draft.estimatedMinutes ?? 0, existing.estimatedMinutes ?? 0) || undefined,
      reasonCodes: mergedCodes,
      score: {
        ...maxScore(existing.score, draft.score),
        categoryBase: Math.max(existing.score.categoryBase, draft.score.categoryBase, primaryBase),
      },
    });
  }

  return [...byKey.values()];
}

export function rankFocusItems(items: FocusItem[]): FocusItem[] {
  return [...items].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    const catOrder =
      CATEGORY_TIEBREAK_ORDER[a.category] - CATEGORY_TIEBREAK_ORDER[b.category];
    if (catOrder !== 0) return catOrder;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function capByCategory(
  drafts: FocusItemDraft[],
  perCategoryCap: number
): FocusItemDraft[] {
  const counts: Record<FocusCategory, number> = {
    skill: 0,
    event: 0,
    people: 0,
    career: 0,
    fitness: 0,
    timeline: 0,
  };

  const sorted = [...drafts].sort((a, b) => {
    const scoreA = sumScoreComponents(a.score);
    const scoreB = sumScoreComponents(b.score);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return CATEGORY_TIEBREAK_ORDER[a.category] - CATEGORY_TIEBREAK_ORDER[b.category];
  });

  const kept: FocusItemDraft[] = [];
  for (const draft of sorted) {
    if (counts[draft.category] >= perCategoryCap) continue;
    counts[draft.category] += 1;
    kept.push(draft);
  }
  return kept;
}

function localHour(now: Date): number {
  return now.getHours();
}

function isEvening(now: Date): boolean {
  return localHour(now) >= EVENING_HOUR;
}

function isMorning(now: Date): boolean {
  return localHour(now) < MORNING_HOUR;
}

function makeDraft(
  partial: Omit<FocusItemDraft, "score"> & { score?: Partial<FocusScoreComponents> }
): FocusItemDraft {
  const primary = primaryReasonCode(partial.reasonCodes);
  const defaultBase = CATEGORY_BASE[primary] ?? 400;
  return {
    ...partial,
    score: {
      categoryBase: partial.score?.categoryBase ?? defaultBase,
      urgencyBonus: partial.score?.urgencyBonus ?? 0,
      severityBonus: partial.score?.severityBonus ?? 0,
      skillPriorityBonus: partial.score?.skillPriorityBonus ?? 0,
      timeOfDayBonus: partial.score?.timeOfDayBonus ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

export function collectSkillFocusItems(
  skills: Skill[],
  sessions: Session[],
  now: Date
): FocusItemDraft[] {
  const drafts: FocusItemDraft[] = [];
  const todayKey = formatLocalDateKey(now);
  const rows = buildSkillDayRows(skills, sessions, now);
  const progressions = buildSkillProgressions(skills, sessions, now);
  const progressionBySkillId = new Map(progressions.map((p) => [p.skill.id, p]));
  const evening = isEvening(now);
  const streakGate = localHour(now) >= STREAK_RISK_MIN_HOUR;

  for (const row of rows) {
    const { skill } = row;
    const progression = progressionBySkillId.get(skill.id);
    const skillPriorityBonus = (skill.priority ?? 0) * 25;
    const minutesBehind = Math.max(0, row.expectedByNow - row.todayMinutes);

    if (row.status === "overdue") {
      drafts.push(
        makeDraft({
          id: `skill:${skill.id}`,
          category: "skill",
          sourceId: skill.id,
          title: `Catch up on ${skill.name}`,
          description: `${minutesBehind}m behind schedule today.`,
          estimatedMinutes: minutesBehind,
          suggestedActionType: "log_skill_minutes",
          actionTargetId: skill.id,
          expiresAtIso: skillBlockEndExpirationIso(skill, todayKey, now),
          reasonCodes: ["skill_overdue"],
          score: {
            categoryBase: CATEGORY_BASE.skill_overdue!,
            severityBonus: Math.min(minutesBehind, 120),
            skillPriorityBonus,
            timeOfDayBonus: evening ? 40 : 0,
          },
        })
      );
    }

    if (
      row.progressTargetMinutes !== null &&
      row.todayMinutes < row.progressTargetMinutes &&
      row.status !== "overdue"
    ) {
      const remaining = row.progressTargetMinutes - row.todayMinutes;
      drafts.push(
        makeDraft({
          id: `skill:${skill.id}`,
          category: "skill",
          sourceId: skill.id,
          title: `Hit daily goal for ${skill.name}`,
          description: `${remaining}m left to reach today's goal.`,
          estimatedMinutes: remaining,
          suggestedActionType: "log_skill_minutes",
          actionTargetId: skill.id,
          expiresAtIso: endOfLocalDayIso(todayKey),
          reasonCodes: ["skill_daily_goal_incomplete"],
          score: {
            categoryBase: CATEGORY_BASE.skill_daily_goal_incomplete!,
            severityBonus: Math.min(remaining, 60),
            skillPriorityBonus,
            timeOfDayBonus: evening ? 80 : 0,
          },
        })
      );
    }

    if (
      progression &&
      progression.currentStreak > 0 &&
      !progression.streakActiveToday &&
      streakGate
    ) {
      drafts.push(
        makeDraft({
          id: `skill:${skill.id}`,
          category: "skill",
          sourceId: skill.id,
          title: `Keep your ${progression.currentStreak}-day streak on ${skill.name}`,
          description: "Log time today before the day ends.",
          suggestedActionType: "log_skill_minutes",
          actionTargetId: skill.id,
          expiresAtIso: endOfLocalDayIso(todayKey),
          reasonCodes: ["skill_streak_at_risk"],
          score: {
            categoryBase: CATEGORY_BASE.skill_streak_at_risk!,
            severityBonus: Math.min(progression.currentStreak * 5, 50),
            skillPriorityBonus,
            timeOfDayBonus: evening ? 80 : 20,
          },
        })
      );
    }

    if (
      evening &&
      (skill.priority ?? 0) >= 3 &&
      row.plannedTodayMinutes > 0 &&
      row.status === "idle"
    ) {
      drafts.push(
        makeDraft({
          id: `skill:${skill.id}`,
          category: "skill",
          sourceId: skill.id,
          title: `Start ${skill.name}`,
          description: "High-priority skill with no time logged yet today.",
          suggestedActionType: "log_skill_minutes",
          actionTargetId: skill.id,
          expiresAtIso: endOfLocalDayIso(todayKey),
          reasonCodes: ["skill_high_priority"],
          score: {
            categoryBase: CATEGORY_BASE.skill_high_priority!,
            skillPriorityBonus,
            timeOfDayBonus: 30,
          },
        })
      );
    }
  }

  return drafts;
}

export function collectEventFocusItems(
  events: LifeEvent[],
  people: Person[],
  todayKey: string,
  now: Date
): FocusItemDraft[] {
  const drafts: FocusItemDraft[] = [];
  const upcoming = buildUpcomingEventItems(events, todayKey, 3, 20);
  const morning = isMorning(now);

  for (const item of upcoming) {
    const { event, daysUntil } = item;
    const personLabel = resolveEventPersonLabel(event, new Map(people.map((p) => [p.id, p])));
    const personSuffix = personLabel ? ` · ${personLabel}` : "";

    if (daysUntil === 0) {
      const timePart = event.startTime ? ` at ${event.startTime}` : "";
      drafts.push(
        makeDraft({
          id: `event:${event.id}`,
          category: "event",
          sourceId: event.id,
          title: `${event.title} today`,
          description: `${event.type}${timePart}${personSuffix}`,
          suggestedActionType: "open_events",
          actionTargetId: event.id,
          expiresAtIso: eventExpirationIso(event, todayKey),
          reasonCodes: ["event_today"],
          score: {
            categoryBase: CATEGORY_BASE.event_today!,
            urgencyBonus: 100,
            severityBonus: event.reminder ? 30 : 0,
            timeOfDayBonus: morning && event.startTime ? 40 : 0,
          },
        })
      );
      continue;
    }

    if (daysUntil === 1) {
      drafts.push(
        makeDraft({
          id: `event:${event.id}`,
          category: "event",
          sourceId: event.id,
          title: `${event.title} tomorrow`,
          description: `${event.type}${personSuffix}`,
          suggestedActionType: "open_events",
          actionTargetId: event.id,
          expiresAtIso: endOfLocalDayIso(event.date),
          reasonCodes: ["event_tomorrow"],
          score: {
            categoryBase: CATEGORY_BASE.event_tomorrow!,
            urgencyBonus: 50,
          },
        })
      );
      continue;
    }

    if (daysUntil <= 2) {
      drafts.push(
        makeDraft({
          id: `event:${event.id}`,
          category: "event",
          sourceId: event.id,
          title: `${event.title} in ${daysUntil} days`,
          description: `${event.type}${personSuffix}`,
          suggestedActionType: "open_events",
          actionTargetId: event.id,
          expiresAtIso: endOfLocalDayIso(event.date),
          reasonCodes: ["event_urgent_upcoming"],
          score: {
            categoryBase: CATEGORY_BASE.event_urgent_upcoming!,
            urgencyBonus: 30,
          },
        })
      );
    }

    if (event.type === "deadline" && daysUntil <= 3) {
      drafts.push(
        makeDraft({
          id: `event:${event.id}`,
          category: "event",
          sourceId: event.id,
          title: `Deadline: ${event.title}`,
          description: `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}${personSuffix}`,
          suggestedActionType: "open_events",
          actionTargetId: event.id,
          expiresAtIso: endOfLocalDayIso(event.date),
          reasonCodes: ["event_deadline"],
          score: {
            categoryBase: CATEGORY_BASE.event_deadline!,
            urgencyBonus: daysUntil === 0 ? 100 : daysUntil === 1 ? 50 : 20,
          },
        })
      );
    }
  }

  return drafts;
}

export function collectPeopleFocusItems(
  people: Person[],
  todayKey: string
): FocusItemDraft[] {
  const drafts: FocusItemDraft[] = [];

  const birthdays = buildUpcomingBirthdayItems(
    people,
    todayKey,
    PEOPLE_BIRTHDAY_SOON_DAYS,
    10
  );
  for (const item of birthdays) {
    if (item.daysUntil === 0) {
      drafts.push(
        makeDraft({
          id: `people:${item.person.id}`,
          category: "people",
          sourceId: item.person.id,
          title: `${item.person.name}'s birthday today`,
          description: "Reach out or send a message.",
          suggestedActionType: "contact_person",
          actionTargetId: item.person.id,
          expiresAtIso: endOfLocalDayIso(todayKey),
          reasonCodes: ["people_birthday_today"],
          score: {
            categoryBase: CATEGORY_BASE.people_birthday_today!,
            urgencyBonus: 100,
          },
        })
      );
    } else if (item.daysUntil <= PEOPLE_BIRTHDAY_SOON_DAYS) {
      drafts.push(
        makeDraft({
          id: `people:${item.person.id}`,
          category: "people",
          sourceId: item.person.id,
          title: `${item.person.name}'s birthday ${item.urgencyLabel.toLowerCase()}`,
          description: "Plan a gift or message ahead of time.",
          suggestedActionType: "contact_person",
          actionTargetId: item.person.id,
          expiresAtIso: endOfLocalDayIso(item.nextDateKey),
          reasonCodes: ["people_birthday_soon"],
          score: {
            categoryBase: CATEGORY_BASE.people_birthday_soon!,
            urgencyBonus: Math.max(0, 40 - item.daysUntil * 5),
          },
        })
      );
    }
  }

  const followUps = buildPeopleNeedingFollowUp(people, todayKey, 10);
  for (const item of followUps) {
    const daysOverdue = item.daysSinceContact - item.cadenceDays;
    drafts.push(
      makeDraft({
        id: `people:${item.person.id}`,
        category: "people",
        sourceId: item.person.id,
        title: `Follow up with ${item.person.name}`,
        description: `${item.daysSinceContact} days since last contact (cadence: every ${item.cadenceDays} days).`,
        suggestedActionType: "contact_person",
        actionTargetId: item.person.id,
        expiresAtIso: startOfNextLocalDayIso(todayKey),
        reasonCodes: ["people_follow_up_overdue"],
        score: {
          categoryBase: CATEGORY_BASE.people_follow_up_overdue!,
          severityBonus: Math.min(Math.max(daysOverdue, 0) * 5, 50),
        },
      })
    );
  }

  return drafts;
}

export function collectCareerFocusItems(
  skills: Skill[],
  jobApplications: JobApplication[],
  careerTarget: CareerTarget | undefined,
  todayKey: string
): FocusItemDraft[] {
  const drafts: FocusItemDraft[] = [];

  const attentionItems = buildApplicationsNeedingAttention(jobApplications, todayKey);
  const attentionAppIds = new Set<string>();

  for (const status of attentionItems) {
    attentionAppIds.add(status.application.id);
    const reasonCodes = status.reasons.map((r) => ATTENTION_REASON_TO_FOCUS[r]);
    const primary = primaryReasonCode(reasonCodes);
    const isApplyAction = status.reasons.includes("saved_not_applied");

    drafts.push(
      makeDraft({
        id: `career:${status.application.id}`,
        category: "career",
        sourceId: status.application.id,
        title: `${status.application.company} — ${status.application.roleTitle}`,
        description: status.reasons
          .map((r) => {
            if (r === "saved_not_applied") return "Saved but not applied yet.";
            if (r === "no_response") return `No response for ${status.daysSinceApplied ?? 0} days.`;
            return `In ${status.application.status} stage for ${status.daysInStage ?? 0} days.`;
          })
          .join(" "),
        suggestedActionType: isApplyAction ? "apply_to_job" : "open_career",
        actionTargetId: status.application.id,
        expiresAtIso: addDaysIso(endOfLocalDayIso(todayKey), 7),
        reasonCodes,
        score: {
          categoryBase: CATEGORY_BASE[primary] ?? 600,
          severityBonus: status.priority,
        },
      })
    );
  }

  const savedApps = jobApplications
    .filter((app) => app.status === "saved" && !attentionAppIds.has(app.id))
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso))
    .slice(0, 2);

  for (const app of savedApps) {
    drafts.push(
      makeDraft({
        id: `career:${app.id}`,
        category: "career",
        sourceId: app.id,
        title: `Apply to ${app.company}`,
        description: `${app.roleTitle} is saved and ready to apply.`,
        suggestedActionType: "apply_to_job",
        actionTargetId: app.id,
        expiresAtIso: addDaysIso(endOfLocalDayIso(todayKey), 7),
        reasonCodes: ["career_saved_not_applied"],
        score: {
          categoryBase: CATEGORY_BASE.career_saved_not_applied!,
        },
      })
    );
  }

  const interviewSummary = buildInterviewStageSummary(jobApplications);
  for (const app of interviewSummary.applications) {
    if (attentionAppIds.has(app.id)) continue;
    drafts.push(
      makeDraft({
        id: `career:${app.id}`,
        category: "career",
        sourceId: app.id,
        title: `Prepare for ${app.company} interview`,
        description: `${app.roleTitle} is in ${app.status} stage.`,
        suggestedActionType: "open_career",
        actionTargetId: app.id,
        expiresAtIso: addDaysIso(endOfLocalDayIso(todayKey), 7),
        reasonCodes: ["career_interview_active"],
        score: {
          categoryBase: CATEGORY_BASE.career_interview_active!,
        },
      })
    );
  }

  if (careerTarget) {
    const gapItems = buildSkillGapPriorityList(skills, careerTarget);
    const topLinked = gapItems.find((item) => item.kind === "linked");
    if (topLinked && topLinked.kind === "linked") {
      drafts.push(
        makeDraft({
          id: `career:skill-gap:${topLinked.skillId}`,
          category: "career",
          sourceId: topLinked.skillId,
          title: `Study ${topLinked.skillName} for dream job`,
          description: careerTarget.roleTitle
            ? `Skill gap for ${careerTarget.roleTitle}.`
            : "Close a skill gap for your dream job target.",
          suggestedActionType: "open_skills",
          actionTargetId: topLinked.skillId,
          expiresAtIso: addDaysIso(endOfLocalDayIso(todayKey), 7),
          reasonCodes: ["career_skill_gap"],
          score: {
            categoryBase: CATEGORY_BASE.career_skill_gap!,
            skillPriorityBonus: (topLinked.skillPriority ?? 0) * 25,
          },
        })
      );
    }
  }

  return drafts;
}

export function collectFitnessFocusItems(
  workoutPlans: WorkoutPlan[],
  workoutSessions: WorkoutSession[],
  todayKey: string
): FocusItemDraft[] {
  const drafts: FocusItemDraft[] = [];
  const hasFitnessData = workoutPlans.length > 0 || workoutSessions.length > 0;
  if (!hasFitnessData) return drafts;

  const dayEnd = endOfLocalDayIso(todayKey);

  const weekSummary = buildWorkoutWeekSummary(workoutSessions, todayKey);
  const lastSession = getLastSession(workoutSessions);
  const sessionToday = workoutSessions.some((s) => s.date === todayKey);
  let hasHigherFitnessSignal = false;

  if (weekSummary.count === 0) {
    drafts.push(
      makeDraft({
        id: "fitness:no-workout-week",
        category: "fitness",
        title: "No workouts logged this week",
        description: "Log a session to stay on track.",
        suggestedActionType: "open_fitness",
        expiresAtIso: dayEnd,
        reasonCodes: ["fitness_no_workout_this_week"],
        score: {
          categoryBase: CATEGORY_BASE.fitness_no_workout_this_week!,
        },
      })
    );
    hasHigherFitnessSignal = true;
  }

  if (lastSession) {
    const daysSince = daysBetweenDateKeys(lastSession.date, todayKey);
    if (daysSince !== null && daysSince >= FITNESS_LONG_GAP_DAYS) {
      drafts.push(
        makeDraft({
          id: "fitness:long-gap",
          category: "fitness",
          sourceId: lastSession.id,
          title: "Time to work out again",
          description: `Last workout was ${daysSince} days ago.`,
          suggestedActionType: "open_fitness",
          actionTargetId: lastSession.id,
          expiresAtIso: dayEnd,
          reasonCodes: ["fitness_long_gap_since_last"],
          score: {
            categoryBase: CATEGORY_BASE.fitness_long_gap_since_last!,
            severityBonus: Math.min((daysSince - FITNESS_LONG_GAP_DAYS) * 10, 50),
          },
        })
      );
      hasHigherFitnessSignal = true;
    }
  }

  if (workoutPlans.length > 0 && !sessionToday && !hasHigherFitnessSignal) {
    const plan = workoutPlans[0];
    drafts.push(
      makeDraft({
        id: `fitness:plan:${plan.id}`,
        category: "fitness",
        sourceId: plan.id,
        title: `Log ${plan.name}`,
        description: "Use a saved workout plan today.",
        suggestedActionType: "schedule_workout",
        actionTargetId: plan.id,
        expiresAtIso: dayEnd,
        reasonCodes: ["fitness_log_from_plan"],
        score: {
          categoryBase: CATEGORY_BASE.fitness_log_from_plan!,
        },
      })
    );
  }

  return drafts;
}

function conflictTitle(conflicts: TimelineConflict[]): string {
  if (conflicts.length === 1) {
    return "Schedule conflict today";
  }
  return `${conflicts.length} schedule conflicts today`;
}

function conflictDescription(conflicts: TimelineConflict[]): string {
  if (conflicts.length === 1) {
    const c = conflicts[0];
    return `${c.overlapMinutes}m overlap at ${c.overlapStartTime}–${c.overlapEndTime}.`;
  }
  const totalMinutes = conflicts.reduce((sum, c) => sum + c.overlapMinutes, 0);
  return `${totalMinutes}m total overlap across ${conflicts.length} conflicts.`;
}

function conflictExpirationIso(todayKey: string, conflict: TimelineConflict): string {
  const iso = localDateTimeIso(todayKey, conflict.overlapEndTime);
  if (iso) return iso;
  return endOfLocalDayIso(todayKey);
}

function conflictActionTargetId(conflict: TimelineConflict): string {
  return conflict.bId;
}

export function collectTimelineFocusItems(
  skills: Skill[],
  events: LifeEvent[],
  people: Person[],
  todayKey: string,
  now: Date
): { drafts: FocusItemDraft[]; workload: ReturnType<typeof computeDailyWorkloadForDay> } {
  const drafts: FocusItemDraft[] = [];
  const days = buildUnifiedTimelineRange(skills, events, todayKey, todayKey, { people });
  const day = days[0] ?? { date: todayKey, items: [], conflicts: [] };
  const workload = computeDailyWorkloadForDay(day);
  const morning = isMorning(now);

  const scheduleConflicts = day.conflicts.filter((c) => c.reason === "eventBlocksSchedule");

  if (scheduleConflicts.length > 0) {
    if (scheduleConflicts.length > 2) {
      const leadConflict = scheduleConflicts[0];
      drafts.push(
        makeDraft({
          id: "timeline:conflicts-aggregated",
          category: "timeline",
          title: conflictTitle(scheduleConflicts),
          description: conflictDescription(scheduleConflicts),
          estimatedMinutes: scheduleConflicts.reduce((sum, c) => sum + c.overlapMinutes, 0),
          suggestedActionType: "resolve_conflict",
          actionTargetId: conflictActionTargetId(leadConflict),
          expiresAtIso: conflictExpirationIso(todayKey, leadConflict),
          reasonCodes: ["timeline_schedule_conflict"],
          score: {
            categoryBase: CATEGORY_BASE.timeline_schedule_conflict!,
            severityBonus: Math.min(
              scheduleConflicts.reduce((sum, c) => sum + c.overlapMinutes, 0),
              120
            ),
            timeOfDayBonus: morning ? 40 : 0,
          },
        })
      );
    } else {
      for (const conflict of scheduleConflicts) {
        drafts.push(
          makeDraft({
            id: `timeline:conflict:${conflict.aId}:${conflict.bId}`,
            category: "timeline",
            title: "Schedule conflict today",
            description: `${conflict.overlapMinutes}m overlap at ${conflict.overlapStartTime}–${conflict.overlapEndTime}.`,
            estimatedMinutes: conflict.overlapMinutes,
            suggestedActionType: "resolve_conflict",
            actionTargetId: conflictActionTargetId(conflict),
            expiresAtIso: conflictExpirationIso(todayKey, conflict),
            reasonCodes: ["timeline_schedule_conflict"],
            score: {
              categoryBase: CATEGORY_BASE.timeline_schedule_conflict!,
              severityBonus: Math.min(conflict.overlapMinutes, 120),
              timeOfDayBonus: morning ? 40 : 0,
            },
          })
        );
      }
    }
  }

  if (workload.blockedMinutes >= HIGH_BLOCKED_MINUTES) {
    drafts.push(
      makeDraft({
        id: "timeline:high-blocked",
        category: "timeline",
        title: "Heavy calendar today",
        description: `${workload.blockedMinutes}m blocked by timed events.`,
        suggestedActionType: "open_events",
        expiresAtIso: endOfLocalDayIso(todayKey),
        reasonCodes: ["timeline_high_blocked_time"],
        score: {
          categoryBase: CATEGORY_BASE.timeline_high_blocked_time!,
          severityBonus: Math.min(workload.blockedMinutes - HIGH_BLOCKED_MINUTES, 60),
        },
      })
    );
  }

  if (
    workload.plannedSkillMinutes > 0 &&
    workload.netAvailableForSkillsMinutes < LOW_AVAILABLE_SKILL_MINUTES
  ) {
    drafts.push(
      makeDraft({
        id: "timeline:low-available",
        category: "timeline",
        title: "Limited skill time today",
        description: `Only ${Math.max(workload.netAvailableForSkillsMinutes, 0)}m available after conflicts.`,
        suggestedActionType: "open_skills",
        expiresAtIso: endOfLocalDayIso(todayKey),
        reasonCodes: ["timeline_low_available_skill_time"],
        score: {
          categoryBase: CATEGORY_BASE.timeline_low_available_skill_time!,
          severityBonus: Math.min(
            LOW_AVAILABLE_SKILL_MINUTES - workload.netAvailableForSkillsMinutes,
            40
          ),
        },
      })
    );
  }

  return { drafts, workload };
}

// ---------------------------------------------------------------------------
// Context + headline helpers
// ---------------------------------------------------------------------------

export function formatFocusCategory(category: FocusCategory): string {
  return FOCUS_CATEGORY_LABELS[category];
}

export function formatFocusContextLine(context: DailyFocusContext): string {
  const parts: string[] = [];
  if (context.timelineConflictMinutes > 0) {
    parts.push(`${context.timelineConflictMinutes}m conflicts`);
  }
  if (context.netAvailableSkillMinutes >= 0) {
    parts.push(`${context.netAvailableSkillMinutes}m available for skills`);
  }
  if (context.workoutsThisWeek > 0) {
    parts.push(
      `${context.workoutsThisWeek} workout${context.workoutsThisWeek === 1 ? "" : "s"} this week`
    );
  }
  if (context.applicationsNeedingAttention > 0) {
    parts.push(
      `${context.applicationsNeedingAttention} career item${context.applicationsNeedingAttention === 1 ? "" : "s"}`
    );
  }
  return parts.join(" · ");
}

function buildHeadline(items: FocusItem[]): string | undefined {
  const highCount = items.filter(
    (item) => item.urgency === "critical" || item.urgency === "high"
  ).length;
  if (highCount > 0) {
    return `${highCount} high-priority item${highCount === 1 ? "" : "s"} today`;
  }
  if (items.length > 0) {
    return `${items.length} focus item${items.length === 1 ? "" : "s"} today`;
  }
  return undefined;
}

function buildContext(
  skills: Skill[],
  sessions: Session[],
  events: LifeEvent[],
  jobApplications: JobApplication[],
  workoutSessions: WorkoutSession[],
  todayKey: string,
  now: Date,
  workload: ReturnType<typeof computeDailyWorkloadForDay>
): DailyFocusContext {
  const rows = buildSkillDayRows(skills, sessions, now);
  const skillOverdueCount = rows.filter((r) => r.status === "overdue").length;
  const eventsTodayCount = buildUpcomingEventItems(events, todayKey, 0, 100).filter(
    (item) => item.daysUntil === 0
  ).length;
  const weekSummary = buildWorkoutWeekSummary(workoutSessions, todayKey);
  const applicationsNeedingAttention = buildApplicationsNeedingAttention(
    jobApplications,
    todayKey
  ).length;

  return {
    skillOverdueCount,
    eventsTodayCount,
    timelineConflictMinutes: workload.conflictMinutes,
    netAvailableSkillMinutes: workload.netAvailableForSkillsMinutes,
    workoutsThisWeek: weekSummary.count,
    applicationsNeedingAttention,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function buildDailyFocusSummary(input: BuildDailyFocusInput): DailyFocusSummary {
  const now = input.now ?? new Date();
  const maxItems = input.opts?.maxItems ?? FOCUS_DASHBOARD_MAX_ITEMS;
  const perCategoryCap = input.opts?.perCategoryCap ?? FOCUS_PER_CATEGORY_CAP;

  const { drafts: timelineDrafts, workload } = collectTimelineFocusItems(
    input.skills,
    input.events,
    input.people,
    input.todayKey,
    now
  );

  const allDrafts = [
    ...collectSkillFocusItems(input.skills, input.sessions, now),
    ...collectEventFocusItems(input.events, input.people, input.todayKey, now),
    ...collectPeopleFocusItems(input.people, input.todayKey),
    ...collectCareerFocusItems(input.skills, input.jobApplications, input.careerTarget, input.todayKey),
    ...collectFitnessFocusItems(input.workoutPlans, input.workoutSessions, input.todayKey),
    ...timelineDrafts,
  ];

  const capped = capByCategory(allDrafts, perCategoryCap);
  const merged = mergeFocusItems(capped);
  const scored = merged.map(scoreFocusItem);
  const ranked = rankFocusItems(scored);
  const active = filterExpiredFocusItems(ranked, now.toISOString());
  const items = active.slice(0, maxItems);

  const byCategory = emptyByCategory();
  for (const item of active) {
    byCategory[item.category].push(item);
  }

  const context = buildContext(
    input.skills,
    input.sessions,
    input.events,
    input.jobApplications,
    input.workoutSessions,
    input.todayKey,
    now,
    workload
  );

  return {
    todayKey: input.todayKey,
    generatedAtIso: now.toISOString(),
    items,
    byCategory,
    headline: buildHeadline(items),
    context,
  };
}

export function getFocusCategories(): FocusCategory[] {
  return [...FOCUS_CATEGORIES];
}
