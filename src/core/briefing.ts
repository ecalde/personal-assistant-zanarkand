/**
 * Pure Daily Briefing Engine — deterministic natural-language summaries.
 *
 * Reads derived dashboard state (focus summary, workload, timeline) and produces
 * read-only narrative output. No persistence, no AI.
 *
 * Future AI extension points (not implemented):
 * - BriefingContext bundle for "explain my day" prompts
 * - Personalized tone tuning from user feedback
 */

import { buildInterviewStageSummary } from "./career";
import { daysBetweenDateKeys } from "./events";
import { expandWorkoutOccurrencesForDate, getLastSession } from "./fitness";
import {
  EVENING_HOUR,
  FITNESS_LONG_GAP_DAYS,
  HIGH_BLOCKED_MINUTES,
  LOW_AVAILABLE_SKILL_MINUTES,
  MORNING_HOUR,
  rankFocusItems,
  type DailyFocusSummary,
  type FocusItem,
  type FocusReasonCode,
} from "./focus";
import type {
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import { buildPeopleNeedingFollowUp } from "./people";
import type { DailyWorkloadTotals, UnifiedTimelineDay } from "./timeline";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const BRIEFING_MAX_RECOMMENDATIONS = 5;

const MODERATE_BLOCKED_MINUTES = 180;
const HEAVY_BLOCKED_WITH_EVENTS_MINUTES = 300;
const BURNOUT_BLOCKED_MINUTES = 360;
const EXCESSIVE_CONFLICT_MINUTES = 60;
const MODERATE_PLANNED_SKILL_MINUTES = 120;
const OVERDUE_SKILLS_RISK_THRESHOLD = 3;
const BURNOUT_OVERDUE_SKILLS_THRESHOLD = 2;

const WORKLOAD_SUMMARY_TEMPLATES: Record<WorkloadLevel, string[]> = {
  light: [
    "Today looks light.",
    "You have breathing room today.",
    "A lighter day ahead.",
  ],
  moderate: [
    "Today looks moderately busy.",
    "You'll have a steady pace today.",
    "Expect a full but manageable day.",
  ],
  heavy: [
    "Today looks heavy — limited free time.",
    "Today's packed — protect your priorities.",
    "A demanding day — plan breaks where you can.",
  ],
};

const CLEAR_DAY_SUMMARY_TEMPLATES = [
  "Your schedule looks clear today.",
  "Not much on the calendar — a good day to choose your priorities.",
  "You have open space today.",
];

const BUSY_DAY_OPENERS: Record<Exclude<WorkloadLevel, "light">, string[]> = {
  moderate: [
    "Today looks moderately busy.",
    "You'll have a steady pace today.",
    "Expect a full but manageable day.",
  ],
  heavy: [
    "Today looks heavy — limited free time.",
    "Today's packed — protect your priorities.",
    "A demanding day — plan breaks where you can.",
  ],
};

const ON_TRACK_FOCUS_TEMPLATES = [
  "Skills, fitness, and people reminders look on track.",
  "You're in good shape on skills, fitness, and people follow-ups.",
  "Nothing urgent across skills, fitness, or people today.",
];

const RECOMMENDATION_FALLBACK_TEMPLATES = [
  (title: string) => (title.endsWith(".") ? title : `${title}.`),
  (title: string) => `Consider: ${title.endsWith(".") ? title.slice(0, -1) : title}.`,
  (title: string) => {
    const phrase = title.endsWith(".") ? title.slice(0, -1) : title;
    return `When you have a moment — ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}.`;
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BriefingTone = "neutral" | "encouraging" | "warning";

export type DailyBriefing = {
  greeting: string;
  summary: string;
  workloadSummary: string;
  focusSummary: string;
  recommendations: string[];
  riskFlags: string[];
  tone: BriefingTone;
  generatedAtIso: string;
};

export type WorkloadLevel = "light" | "moderate" | "heavy";

export type BuildDailyBriefingInput = {
  skills: Skill[];
  sessions: Session[];
  events: LifeEvent[];
  people: Person[];
  jobApplications: JobApplication[];
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  focusSummary: DailyFocusSummary;
  unifiedTimelineDay: UnifiedTimelineDay;
  workload: DailyWorkloadTotals;
  todayKey: string;
  now?: Date;
};

type BriefingSeedParts = {
  todayKey: string;
  workloadLevel: WorkloadLevel;
  eventsTodayCount: number;
  conflictCount: number;
  skillOverdueCount: number;
  applicationsNeedingAttention: number;
};

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

export function selectDeterministicTemplate<T>(templates: T[], seed: string): T {
  if (templates.length === 0) {
    throw new Error("selectDeterministicTemplate requires at least one template");
  }

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return templates[hash % templates.length];
}

export function buildBriefingSeed(parts: BriefingSeedParts, scope: string): string {
  return [
    parts.todayKey,
    scope,
    parts.workloadLevel,
    parts.eventsTodayCount,
    parts.conflictCount,
    parts.skillOverdueCount,
    parts.applicationsNeedingAttention,
  ].join("|");
}

function seedPartsFromInput(
  input: BuildDailyBriefingInput,
  workloadLevel: WorkloadLevel,
  conflictCount: number
): BriefingSeedParts {
  const { context } = input.focusSummary;
  return {
    todayKey: input.todayKey,
    workloadLevel,
    eventsTodayCount: context.eventsTodayCount,
    conflictCount,
    skillOverdueCount: context.skillOverdueCount,
    applicationsNeedingAttention: context.applicationsNeedingAttention,
  };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function scheduleConflictCount(day: UnifiedTimelineDay): number {
  return day.conflicts.filter((c) => c.reason === "eventBlocksSchedule").length;
}

function allFocusItemsFromSummary(summary: DailyFocusSummary): FocusItem[] {
  return rankFocusItems(Object.values(summary.byCategory).flat());
}

function primaryReasonCode(item: FocusItem): FocusReasonCode {
  return item.reasonCodes[0];
}

function timeOfDayLabel(now: Date): string {
  const hour = now.getHours();
  if (hour < MORNING_HOUR) return "morning";
  if (hour < EVENING_HOUR) return "afternoon";
  return "evening";
}

function parseSkillNameFromTitle(title: string): string | undefined {
  const catchUp = title.match(/^Catch up on (.+)$/);
  if (catchUp) return catchUp[1];
  const dailyGoal = title.match(/^Hit daily goal for (.+)$/);
  if (dailyGoal) return dailyGoal[1];
  const streak = title.match(/^Keep your \d+-day streak on (.+)$/);
  if (streak) return streak[1];
  const start = title.match(/^Start (.+)$/);
  if (start) return start[1];
  return undefined;
}

function parsePersonNameFromFollowUp(title: string): string | undefined {
  const match = title.match(/^Follow up with (.+)$/);
  return match?.[1];
}

function parseCompanyFromCareerTitle(title: string): string | undefined {
  const dashParts = title.split(" — ");
  if (dashParts.length >= 1 && dashParts[0]) return dashParts[0];
  const applyMatch = title.match(/^Apply to (.+)$/);
  if (applyMatch) return applyMatch[1];
  const prepMatch = title.match(/^Prepare for (.+) interview$/);
  if (prepMatch) return prepMatch[1];
  return undefined;
}

function hasFitnessData(plans: WorkoutPlan[], sessions: WorkoutSession[]): boolean {
  return plans.length > 0 || sessions.length > 0;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Workload classification
// ---------------------------------------------------------------------------

export function buildGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < MORNING_HOUR) return "Good morning.";
  if (hour < EVENING_HOUR) return "Good afternoon.";
  return "Good evening.";
}

export function classifyWorkloadLevel(
  workload: DailyWorkloadTotals,
  conflictCount: number,
  eventsTodayCount: number
): WorkloadLevel {
  const { blockedMinutes, plannedSkillMinutes } = workload;

  if (
    blockedMinutes >= HIGH_BLOCKED_MINUTES ||
    conflictCount >= 2 ||
    (blockedMinutes >= HEAVY_BLOCKED_WITH_EVENTS_MINUTES && eventsTodayCount >= 3)
  ) {
    return "heavy";
  }

  if (
    blockedMinutes >= MODERATE_BLOCKED_MINUTES ||
    conflictCount >= 1 ||
    eventsTodayCount >= 2 ||
    plannedSkillMinutes >= MODERATE_PLANNED_SKILL_MINUTES
  ) {
    return "moderate";
  }

  return "light";
}

export function formatWorkloadSummary(level: WorkloadLevel, seed: string): string {
  return selectDeterministicTemplate(WORKLOAD_SUMMARY_TEMPLATES[level], seed);
}

export function classifyBriefingTone(
  riskFlags: string[],
  workloadLevel: WorkloadLevel,
  visibleFocusItemCount: number
): BriefingTone {
  if (riskFlags.length > 0 || workloadLevel === "heavy") {
    return "warning";
  }
  if (visibleFocusItemCount === 0) {
    return "encouraging";
  }
  return "neutral";
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function buildMainSummary(
  level: WorkloadLevel,
  context: DailyFocusSummary["context"],
  conflictCount: number,
  seedParts: BriefingSeedParts
): string {
  const { eventsTodayCount, applicationsNeedingAttention } = context;
  const isClearDay =
    level === "light" &&
    eventsTodayCount === 0 &&
    conflictCount === 0 &&
    applicationsNeedingAttention === 0;

  if (isClearDay) {
    return selectDeterministicTemplate(
      CLEAR_DAY_SUMMARY_TEMPLATES,
      buildBriefingSeed(seedParts, "clear-summary")
    );
  }

  const parts: string[] = [];

  if (level === "light") {
    parts.push(
      selectDeterministicTemplate(
        CLEAR_DAY_SUMMARY_TEMPLATES,
        buildBriefingSeed(seedParts, "light-summary")
      )
    );
  } else {
    parts.push(
      selectDeterministicTemplate(
        BUSY_DAY_OPENERS[level],
        buildBriefingSeed(seedParts, "busy-summary")
      )
    );
  }

  const eventParts: string[] = [];
  if (eventsTodayCount > 0) {
    eventParts.push(`${eventsTodayCount} event${eventsTodayCount === 1 ? "" : "s"}`);
  }
  if (conflictCount > 0) {
    eventParts.push(`${conflictCount} schedule conflict${conflictCount === 1 ? "" : "s"}`);
  }
  if (eventParts.length > 0) {
    parts.push(`You have ${eventParts.join(" and ")}.`);
  }

  if (applicationsNeedingAttention > 0) {
    parts.push(
      `Your career pipeline has ${applicationsNeedingAttention} item${applicationsNeedingAttention === 1 ? "" : "s"} needing attention.`
    );
  }

  return parts.join(" ");
}

export function buildFocusSummaryParagraph(
  context: DailyFocusSummary["context"],
  people: Person[],
  workoutPlans: WorkoutPlan[],
  workoutSessions: WorkoutSession[],
  todayKey: string,
  seedParts: BriefingSeedParts
): string {
  const parts: string[] = [];
  const { skillOverdueCount, workoutsThisWeek } = context;

  if (skillOverdueCount > 0) {
    parts.push(
      `${skillOverdueCount} skill${skillOverdueCount === 1 ? " is" : "s are"} behind schedule`
    );
  }

  const scheduledToday = expandWorkoutOccurrencesForDate(workoutPlans, todayKey);
  if (scheduledToday.length > 0) {
    const first = scheduledToday[0]!;
    const timeSuffix = first.block.startTime ? ` (from ${first.block.startTime})` : "";
    parts.push(
      `${scheduledToday.length} workout${scheduledToday.length === 1 ? "" : "s"} scheduled today${timeSuffix}`
    );
  } else if (hasFitnessData(workoutPlans, workoutSessions) && workoutsThisWeek === 0) {
    parts.push("you haven't logged a workout this week");
  }

  const followUpCount = buildPeopleNeedingFollowUp(people, todayKey, 5).length;
  if (followUpCount > 0) {
    parts.push(`${followUpCount} contact${followUpCount === 1 ? "" : "s"} need follow-up`);
  }

  if (parts.length === 0) {
    return selectDeterministicTemplate(
      ON_TRACK_FOCUS_TEMPLATES,
      buildBriefingSeed(seedParts, "focus-on-track")
    );
  }

  if (parts.length === 1) {
    const clause = parts[0];
    if (clause.startsWith("you ")) {
      return capitalizeFirst(clause) + ".";
    }
    return `${capitalizeFirst(clause)}.`;
  }

  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1);
  const joined =
    rest.length === 1
      ? capitalizeFirst(rest[0])
      : rest.map((p, i) => (i === 0 ? capitalizeFirst(p) : p)).join(", ");
  return `${joined}, and ${last}.`;
}

// ---------------------------------------------------------------------------
// Recommendation builders
// ---------------------------------------------------------------------------

function formatFallbackRecommendation(title: string, seed: string): string {
  const formatter = selectDeterministicTemplate(RECOMMENDATION_FALLBACK_TEMPLATES, seed);
  return formatter(title);
}

export function focusItemToRecommendation(
  item: FocusItem,
  now: Date,
  seed?: string
): string {
  const code = primaryReasonCode(item);
  const skillName = parseSkillNameFromTitle(item.title);
  const personName = parsePersonNameFromFollowUp(item.title);
  const company = parseCompanyFromCareerTitle(item.title);
  const timeLabel = timeOfDayLabel(now);
  const fallbackSeed = seed ?? item.id;

  switch (code) {
    case "timeline_schedule_conflict":
      return `Resolve your ${timeLabel} timeline conflict.`;
    case "skill_overdue":
    case "skill_daily_goal_incomplete": {
      const minutes = item.estimatedMinutes ?? 30;
      const target = skillName ?? "your priority skill";
      return `Log ${minutes} minutes toward ${target}.`;
    }
    case "skill_streak_at_risk": {
      const target = skillName ?? "your skill";
      return `Log time today to keep your streak on ${target}.`;
    }
    case "skill_high_priority": {
      const target = skillName ?? "your priority skill";
      return `Start logging time on ${target}.`;
    }
    case "people_follow_up_overdue":
      return `Follow up with ${personName ?? "your contact"}.`;
    case "people_birthday_today":
    case "people_birthday_soon":
      return item.title.endsWith(".") ? item.title : `${item.title}.`;
    case "career_no_response":
    case "career_stuck_in_stage":
      return `Follow up with recruiter from ${company ?? "your active application"}.`;
    case "career_saved_not_applied":
      return `Apply to the saved role at ${company ?? "your target company"}.`;
    case "career_interview_active":
      return `Block prep time for your ${company ?? "upcoming"} interview.`;
    case "career_skill_gap":
      return `Study ${skillName ?? "a skill gap"} for your dream job target.`;
    case "fitness_no_workout_this_week":
    case "fitness_long_gap_since_last":
    case "fitness_log_from_plan":
    case "fitness_workout_scheduled_today":
    case "fitness_workout_missed_yesterday":
      return "Schedule a workout today.";
    case "timeline_high_blocked_time":
      return "Review your calendar — today is heavily blocked.";
    case "timeline_low_available_skill_time":
      return "Protect a short skill block before the day fills up.";
    case "event_today":
    case "event_tomorrow":
    case "event_urgent_upcoming":
    case "event_deadline":
      return item.title.endsWith(".") ? item.title : `Prepare for ${item.title.toLowerCase()}.`;
    default:
      return formatFallbackRecommendation(item.title, `${fallbackSeed}|fallback`);
  }
}

export function buildRecommendations(
  focusSummary: DailyFocusSummary,
  now: Date,
  todayKey: string
): string[] {
  const visibleIds = new Set(focusSummary.items.map((item) => item.id));
  const overflow = allFocusItemsFromSummary(focusSummary).filter(
    (item) => !visibleIds.has(item.id)
  );

  return overflow.slice(0, BRIEFING_MAX_RECOMMENDATIONS).map((item) =>
    focusItemToRecommendation(item, now, `${todayKey}|${item.id}|recommendation`)
  );
}

// ---------------------------------------------------------------------------
// Risk builders
// ---------------------------------------------------------------------------

export function collectRiskFlags(input: BuildDailyBriefingInput): string[] {
  const now = input.now ?? new Date();
  const { focusSummary, workload, unifiedTimelineDay, workoutPlans, workoutSessions, todayKey } =
    input;
  const context = focusSummary.context;
  const conflictCount = scheduleConflictCount(unifiedTimelineDay);
  const flags: string[] = [];

  if (workload.blockedMinutes >= HIGH_BLOCKED_MINUTES && context.eventsTodayCount >= 2) {
    flags.push("Overloaded day");
  }

  if (conflictCount >= 2 || workload.conflictMinutes >= EXCESSIVE_CONFLICT_MINUTES) {
    flags.push("Excessive schedule conflicts");
  }

  if (hasFitnessData(workoutPlans, workoutSessions)) {
    const lastSession = getLastSession(workoutSessions);
    if (lastSession) {
      const daysSince = daysBetweenDateKeys(lastSession.date, todayKey);
      if (daysSince !== null && daysSince >= FITNESS_LONG_GAP_DAYS) {
        flags.push("No workouts recently");
      }
    } else {
      flags.push("No workouts recently");
    }
  }

  if (context.skillOverdueCount >= OVERDUE_SKILLS_RISK_THRESHOLD) {
    flags.push("Too many overdue skills");
  }

  const interviewSummary = buildInterviewStageSummary(input.jobApplications);
  if (
    interviewSummary.applications.length > 0 &&
    workload.plannedSkillMinutes > 0 &&
    context.netAvailableSkillMinutes < LOW_AVAILABLE_SKILL_MINUTES
  ) {
    flags.push("Interview with no prep time");
  }

  if (
    context.skillOverdueCount >= BURNOUT_OVERDUE_SKILLS_THRESHOLD &&
    workload.blockedMinutes >= BURNOUT_BLOCKED_MINUTES &&
    now.getHours() >= EVENING_HOUR
  ) {
    flags.push("Burnout risk");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function buildDailyBriefing(input: BuildDailyBriefingInput): DailyBriefing {
  const now = input.now ?? new Date();
  const conflictCount = scheduleConflictCount(input.unifiedTimelineDay);
  const { context } = input.focusSummary;

  const workloadLevel = classifyWorkloadLevel(
    input.workload,
    conflictCount,
    context.eventsTodayCount
  );
  const seedParts = seedPartsFromInput(input, workloadLevel, conflictCount);
  const workloadSeed = buildBriefingSeed(seedParts, "workload-summary");
  const riskFlags = collectRiskFlags(input);

  return {
    greeting: buildGreeting(now),
    summary: buildMainSummary(workloadLevel, context, conflictCount, seedParts),
    workloadSummary: formatWorkloadSummary(workloadLevel, workloadSeed),
    focusSummary: buildFocusSummaryParagraph(
      context,
      input.people,
      input.workoutPlans,
      input.workoutSessions,
      input.todayKey,
      seedParts
    ),
    recommendations: buildRecommendations(input.focusSummary, now, input.todayKey),
    riskFlags,
    tone: classifyBriefingTone(riskFlags, workloadLevel, input.focusSummary.items.length),
    generatedAtIso: now.toISOString(),
  };
}
