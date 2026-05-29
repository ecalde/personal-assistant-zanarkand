/**
 * Pure helpers for the Fitness domain.
 *
 * Future AI extension points (not implemented in v1):
 * - FitnessContext bundle for prompts (recent sessions, plan templates, volume trends)
 * - Workout plan generation from goals or equipment list
 * - Form-check notes and progressive overload suggestions
 *
 * Future: buildFitnessContext(payload: AppPayload): FitnessContext
 */

import { startOfWeekLocal } from "./dashboardStats";
import type {
  ExerciseEntry,
  ScheduleBlock,
  WeeklySchedule,
  WorkoutFocus,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import { defaultWeeklySchedule } from "./state";
import { formatLocalDateKey, weekdayFromDateString } from "./timeline";
import { isWorkoutPlanActiveOnDate } from "./workoutSeries";

export const WORKOUT_FOCUS_LABELS: Record<WorkoutFocus, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  full_body: "Full body",
  cardio: "Cardio",
  mobility: "Mobility",
};

export type PlansSortMode = "recent" | "name" | "focus";
export type SessionsSortMode = "recent" | "date" | "focus";
export type WorkoutFocusFilter = WorkoutFocus | "all";

export type WorkoutWeekSummary = {
  count: number;
  byFocus: Partial<Record<WorkoutFocus, number>>;
  totalDurationMinutes: number;
  sessionsWithDuration: number;
};

export type WorkoutWeekScheduleSummary = WorkoutWeekSummary & {
  scheduledCount: number;
  completedScheduledCount: number;
  adherenceRate: number | null;
};

export type WorkoutOccurrence = {
  planId: string;
  planName: string;
  dateKey: string;
  blockId: string;
  block: ScheduleBlock;
  focus?: WorkoutFocus;
};

export type WorkoutDayStatus = "planned" | "completed" | "missed" | "not_scheduled";

const WORKOUT_FOCUSES: WorkoutFocus[] = [
  "push",
  "pull",
  "legs",
  "full_body",
  "cardio",
  "mobility",
];

const FOCUS_SORT_ORDER: Record<WorkoutFocus, number> = {
  push: 0,
  pull: 1,
  legs: 2,
  full_body: 3,
  cardio: 4,
  mobility: 5,
};

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isDateKeyInLocalWeek(dateKey: string, weekStart: Date): boolean {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return date >= weekStart && date < weekEnd;
}

export function getWorkoutFocusValues(): WorkoutFocus[] {
  return [...WORKOUT_FOCUSES];
}

export function formatWorkoutFocus(focus?: WorkoutFocus): string {
  if (!focus) return "General";
  return WORKOUT_FOCUS_LABELS[focus];
}

export function formatExerciseSummary(entry: ExerciseEntry): string {
  const parts: string[] = [entry.name];

  if (entry.sets !== undefined && entry.reps !== undefined) {
    parts.push(`${entry.sets}×${entry.reps}`);
  } else if (entry.sets !== undefined) {
    parts.push(`${entry.sets} sets`);
  } else if (entry.reps !== undefined) {
    parts.push(`${entry.reps} reps`);
  }

  if (entry.weight !== undefined) {
    parts.push(`@ ${entry.weight}`);
  }

  return parts.join(" · ");
}

export function formatSessionHeadline(session: WorkoutSession): string {
  const focusLabel = formatWorkoutFocus(session.focus);
  const firstExercise = session.exercises[0];
  const exercisePart = firstExercise ? formatExerciseSummary(firstExercise) : "Workout";
  if (session.exercises.length > 1) {
    return `${focusLabel} · ${exercisePart} +${session.exercises.length - 1} more`;
  }
  return `${focusLabel} · ${exercisePart}`;
}

export function sumSessionDurationMinutes(sessions: WorkoutSession[]): number {
  return sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
}

export function countSessionsWithDuration(sessions: WorkoutSession[]): number {
  return sessions.filter((session) => session.durationMinutes !== undefined).length;
}

export function formatSessionDurationLabel(session: WorkoutSession): string | undefined {
  if (session.durationMinutes === undefined) return undefined;
  return `${session.durationMinutes} min`;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function exerciseMatchesQuery(entry: ExerciseEntry, query: string): boolean {
  if (entry.name.toLowerCase().includes(query)) return true;
  if (entry.notes?.toLowerCase().includes(query)) return true;
  return false;
}

export function planMatchesQuery(plan: WorkoutPlan, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;

  if (plan.name.toLowerCase().includes(normalized)) return true;
  if (plan.notes?.toLowerCase().includes(normalized)) return true;
  if (plan.focus && formatWorkoutFocus(plan.focus).toLowerCase().includes(normalized)) {
    return true;
  }
  return plan.exercises.some((entry) => exerciseMatchesQuery(entry, normalized));
}

export function sessionMatchesQuery(session: WorkoutSession, query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) return true;

  if (session.date.includes(normalized)) return true;
  if (session.notes?.toLowerCase().includes(normalized)) return true;
  if (session.focus && formatWorkoutFocus(session.focus).toLowerCase().includes(normalized)) {
    return true;
  }
  return session.exercises.some((entry) => exerciseMatchesQuery(entry, normalized));
}

function compareIsoDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function filterAndSortPlans(
  plans: WorkoutPlan[],
  opts: {
    query?: string;
    sortMode: PlansSortMode;
    focusFilter?: WorkoutFocusFilter;
  }
): WorkoutPlan[] {
  const query = opts.query ?? "";
  const focusFilter = opts.focusFilter ?? "all";

  let filtered = plans.filter((plan) => planMatchesQuery(plan, query));
  if (focusFilter !== "all") {
    filtered = filtered.filter((plan) => plan.focus === focusFilter);
  }

  const sorted = [...filtered];
  switch (opts.sortMode) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "focus":
      sorted.sort((a, b) => {
        const aOrder = a.focus !== undefined ? FOCUS_SORT_ORDER[a.focus] : 99;
        const bOrder = b.focus !== undefined ? FOCUS_SORT_ORDER[b.focus] : 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
      break;
    case "recent":
    default:
      sorted.sort((a, b) => compareIsoDesc(a.updatedAtIso, b.updatedAtIso));
      break;
  }

  return sorted;
}

export function filterAndSortSessions(
  sessions: WorkoutSession[],
  opts: {
    query?: string;
    sortMode: SessionsSortMode;
    focusFilter?: WorkoutFocusFilter;
  }
): WorkoutSession[] {
  const query = opts.query ?? "";
  const focusFilter = opts.focusFilter ?? "all";

  let filtered = sessions.filter((session) => sessionMatchesQuery(session, query));
  if (focusFilter !== "all") {
    filtered = filtered.filter((session) => session.focus === focusFilter);
  }

  const sorted = [...filtered];
  switch (opts.sortMode) {
    case "date":
      sorted.sort((a, b) => {
        const byDate = compareIsoDesc(a.date, b.date);
        if (byDate !== 0) return byDate;
        return compareIsoDesc(a.updatedAtIso, b.updatedAtIso);
      });
      break;
    case "focus":
      sorted.sort((a, b) => {
        const aOrder = a.focus !== undefined ? FOCUS_SORT_ORDER[a.focus] : 99;
        const bOrder = b.focus !== undefined ? FOCUS_SORT_ORDER[b.focus] : 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return compareIsoDesc(a.date, b.date);
      });
      break;
    case "recent":
    default:
      sorted.sort((a, b) => {
        const byDate = compareIsoDesc(a.date, b.date);
        if (byDate !== 0) return byDate;
        return compareIsoDesc(a.updatedAtIso, b.updatedAtIso);
      });
      break;
  }

  return sorted;
}

export function buildWorkoutWeekSummary(
  sessions: WorkoutSession[],
  todayKey: string
): WorkoutWeekSummary {
  const today = parseDateKey(todayKey) ?? new Date();
  const weekStart = startOfWeekLocal(today);
  const inWeek = sessions.filter((session) => isDateKeyInLocalWeek(session.date, weekStart));

  const byFocus: Partial<Record<WorkoutFocus, number>> = {};
  for (const session of inWeek) {
    if (session.focus) {
      byFocus[session.focus] = (byFocus[session.focus] ?? 0) + 1;
    }
  }

  return {
    count: inWeek.length,
    byFocus,
    totalDurationMinutes: sumSessionDurationMinutes(inWeek),
    sessionsWithDuration: countSessionsWithDuration(inWeek),
  };
}

export function buildRecentSessions(
  sessions: WorkoutSession[],
  limit: number
): WorkoutSession[] {
  return filterAndSortSessions(sessions, { sortMode: "recent" }).slice(0, limit);
}

export function getLastSession(sessions: WorkoutSession[]): WorkoutSession | undefined {
  return buildRecentSessions(sessions, 1)[0];
}

export function copyExercisesFromPlan(plan: WorkoutPlan): ExerciseEntry[] {
  return plan.exercises.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
  }));
}

export function createSessionDraftFromPlan(
  plan: WorkoutPlan,
  dateKey: string
): Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso"> {
  return {
    date: dateKey,
    focus: plan.focus,
    planId: plan.id,
    exercises: copyExercisesFromPlan(plan),
    notes: plan.notes,
  };
}

export function collectRecentExerciseNames(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[],
  limit = 20
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  const addName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(trimmed);
  };

  for (const session of filterAndSortSessions(sessions, { sortMode: "recent" })) {
    for (const entry of session.exercises) {
      addName(entry.name);
      if (names.length >= limit) return names;
    }
  }

  for (const plan of filterAndSortPlans(plans, { sortMode: "recent" })) {
    for (const entry of plan.exercises) {
      addName(entry.name);
      if (names.length >= limit) return names;
    }
  }

  return names;
}

export function resolvePlanName(
  planId: string | undefined,
  plans: WorkoutPlan[]
): string | undefined {
  if (!planId) return undefined;
  return plans.find((plan) => plan.id === planId)?.name;
}

export function resolveWorkoutPlanSchedule(plan: WorkoutPlan): WeeklySchedule {
  return plan.schedule ?? defaultWeeklySchedule();
}

export function isPlanSchedulable(plan: WorkoutPlan): boolean {
  const schedule = resolveWorkoutPlanSchedule(plan);
  return Object.values(schedule).some((blocks) => blocks.length > 0);
}

function dateKeysInLocalWeekContaining(todayKey: string): string[] {
  const today = parseDateKey(todayKey) ?? new Date();
  const weekStart = startOfWeekLocal(today);
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    keys.push(formatLocalDateKey(d));
  }
  return keys;
}

export function expandWorkoutOccurrencesForDate(
  plans: WorkoutPlan[],
  dateKey: string
): WorkoutOccurrence[] {
  const weekday = weekdayFromDateString(dateKey);
  const occurrences: WorkoutOccurrence[] = [];

  for (const plan of plans) {
    if (!isPlanSchedulable(plan)) continue;
    if (!isWorkoutPlanActiveOnDate(plan, dateKey)) continue;

    const blocks = resolveWorkoutPlanSchedule(plan)[weekday] ?? [];
    for (const block of blocks) {
      occurrences.push({
        planId: plan.id,
        planName: plan.name,
        dateKey,
        blockId: block.id,
        block,
        ...(plan.focus ? { focus: plan.focus } : {}),
      });
    }
  }

  return occurrences.sort((a, b) => {
    const byName = a.planName.localeCompare(b.planName);
    if (byName !== 0) return byName;
    return a.block.startTime.localeCompare(b.block.startTime);
  });
}

export function matchSessionToScheduledOccurrence(
  session: WorkoutSession,
  plan: WorkoutPlan,
  dateKey: string
): boolean {
  return session.planId === plan.id && session.date === dateKey;
}

export function isWorkoutOccurrenceComplete(
  plan: WorkoutPlan,
  dateKey: string,
  _blockId: string,
  sessions: WorkoutSession[]
): boolean {
  return sessions.some((session) => matchSessionToScheduledOccurrence(session, plan, dateKey));
}

export function buildWorkoutDayStatus(
  plan: WorkoutPlan,
  dateKey: string,
  sessions: WorkoutSession[],
  opts?: { todayKey?: string }
): WorkoutDayStatus {
  if (!isPlanSchedulable(plan) || !isWorkoutPlanActiveOnDate(plan, dateKey)) {
    return "not_scheduled";
  }

  const weekday = weekdayFromDateString(dateKey);
  const blocks = resolveWorkoutPlanSchedule(plan)[weekday] ?? [];
  if (blocks.length === 0) return "not_scheduled";

  const completed = blocks.some((block) =>
    isWorkoutOccurrenceComplete(plan, dateKey, block.id, sessions)
  );
  if (completed) return "completed";

  const todayKey = opts?.todayKey;
  if (todayKey !== undefined && dateKey < todayKey) {
    return "missed";
  }

  return "planned";
}

export function buildWorkoutWeekScheduleSummary(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[],
  todayKey: string
): WorkoutWeekScheduleSummary {
  const base = buildWorkoutWeekSummary(sessions, todayKey);
  let scheduledCount = 0;
  let completedScheduledCount = 0;

  for (const dateKey of dateKeysInLocalWeekContaining(todayKey)) {
    for (const occurrence of expandWorkoutOccurrencesForDate(plans, dateKey)) {
      scheduledCount += 1;
      const plan = plans.find((p) => p.id === occurrence.planId);
      if (
        plan &&
        isWorkoutOccurrenceComplete(plan, dateKey, occurrence.blockId, sessions)
      ) {
        completedScheduledCount += 1;
      }
    }
  }

  const adherenceRate =
    scheduledCount > 0 ? completedScheduledCount / scheduledCount : null;

  return {
    ...base,
    scheduledCount,
    completedScheduledCount,
    adherenceRate,
  };
}

export function expandWorkoutOccurrencesForDateRange(
  plans: WorkoutPlan[],
  startDate: string,
  endDate: string
): WorkoutOccurrence[] {
  if (startDate > endDate) return [];

  const occurrences: WorkoutOccurrence[] = [];
  const start = parseDateKey(startDate);
  if (!start) return [];

  const end = parseDateKey(endDate);
  if (!end) return [];

  const cursor = new Date(start);
  while (cursor <= end) {
    const dateKey = formatLocalDateKey(cursor);
    occurrences.push(...expandWorkoutOccurrencesForDate(plans, dateKey));
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrences;
}
