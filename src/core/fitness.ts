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
import type { ExerciseEntry, WorkoutFocus, WorkoutPlan, WorkoutSession } from "./model";

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
};

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
