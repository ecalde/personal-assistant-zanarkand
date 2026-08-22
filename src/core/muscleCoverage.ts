/**
 * Weekly / monthly muscle coverage derived from plans and sessions.
 *
 * Snapshots are recomputed from domain truth (same pattern as XP): Monday
 * local week boundaries reset the live chart; past weeks stay available
 * because completed sessions keep their dates.
 */

import { startOfWeekLocal } from "./dashboardStats";
import {
  expandWorkoutOccurrencesForDate,
  isExerciseCompleted,
  isWorkoutSessionComplete,
} from "./fitness";
import {
  collectUnmappedExerciseNames,
  musclesForExerciseNames,
  type MuscleId,
} from "./muscleMap";
import type { ExerciseEntry, WorkoutPlan, WorkoutSession } from "./model";
import { formatLocalDateKey, iterateDateRange } from "./timeline";

export type MuscleStatus = "idle" | "scheduled" | "completed";

export type MuscleCounts = {
  scheduledCount: number;
  completedCount: number;
};

export type MuscleWeekSnapshot = {
  weekStart: string;
  weekEnd: string;
  byMuscle: Partial<Record<MuscleId, MuscleCounts>>;
  unmappedScheduledNames: string[];
  unmappedCompletedNames: string[];
};

export type MuscleMonthHeatmap = {
  yearMonth: string;
  byMuscle: Partial<Record<MuscleId, MuscleCounts & { percent: number }>>;
};

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function weekStartKeyFromDateKey(dateKey: string): string | undefined {
  const date = parseDateKey(dateKey);
  if (!date) return undefined;
  return formatLocalDateKey(startOfWeekLocal(date));
}

export function weekEndKeyFromStart(weekStart: string): string | undefined {
  const date = parseDateKey(weekStart);
  if (!date) return undefined;
  date.setDate(date.getDate() + 6);
  return formatLocalDateKey(date);
}

export function monthKeyFromDateKey(dateKey: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;
  return dateKey.slice(0, 7);
}

export function dateKeysInWeek(weekStart: string): string[] {
  const weekEnd = weekEndKeyFromStart(weekStart);
  if (!weekEnd) return [];
  return iterateDateRange(weekStart, weekEnd);
}

export function dateKeysInMonth(yearMonth: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
  return iterateDateRange(start, end);
}

function collectWeekStarts(
  sessions: readonly WorkoutSession[],
  todayKey: string
): string[] {
  const keys = new Set<string>();
  const current = weekStartKeyFromDateKey(todayKey);
  if (current) keys.add(current);
  for (const session of sessions) {
    const weekStart = weekStartKeyFromDateKey(session.date);
    if (weekStart) keys.add(weekStart);
  }
  return [...keys];
}

function collectMonthKeys(
  sessions: readonly WorkoutSession[],
  todayKey: string
): string[] {
  const keys = new Set<string>();
  const current = monthKeyFromDateKey(todayKey);
  if (current) keys.add(current);
  for (const session of sessions) {
    const month = monthKeyFromDateKey(session.date);
    if (month) keys.add(month);
  }
  return [...keys];
}

function namesFromEntries(entries: readonly ExerciseEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

function incrementMuscle(
  target: Partial<Record<MuscleId, MuscleCounts>>,
  id: MuscleId,
  field: keyof MuscleCounts
): void {
  const current = target[id] ?? { scheduledCount: 0, completedCount: 0 };
  current[field] += 1;
  target[id] = current;
}

function addMusclesOnce(
  target: Partial<Record<MuscleId, MuscleCounts>>,
  names: readonly string[],
  field: keyof MuscleCounts
): void {
  for (const id of musclesForExerciseNames(names)) {
    incrementMuscle(target, id, field);
  }
}

function planById(plans: readonly WorkoutPlan[]): Map<string, WorkoutPlan> {
  return new Map(plans.map((plan) => [plan.id, plan]));
}

function addScheduledForDates(
  plans: readonly WorkoutPlan[],
  dateKeys: readonly string[],
  target: Partial<Record<MuscleId, MuscleCounts>>
): string[] {
  const names: string[] = [];
  const lookup = planById(plans);

  for (const dateKey of dateKeys) {
    for (const occurrence of expandWorkoutOccurrencesForDate([...plans], dateKey)) {
      const plan = lookup.get(occurrence.planId);
      if (!plan) continue;
      const exerciseNames = namesFromEntries(plan.exercises);
      names.push(...exerciseNames);
      addMusclesOnce(target, exerciseNames, "scheduledCount");
    }
  }

  return names;
}

/**
 * Weekly "completed" includes live taps so the map updates mid-session.
 * Finished sessions count every listed exercise (finish does not require taps).
 */
function completedExerciseNames(session: WorkoutSession): string[] {
  if (isWorkoutSessionComplete(session)) {
    return namesFromEntries(session.exercises);
  }
  return namesFromEntries(session.exercises.filter(isExerciseCompleted));
}

function sessionsOnDates(
  sessions: readonly WorkoutSession[],
  dateKeys: ReadonlySet<string>
): WorkoutSession[] {
  return sessions.filter((session) => dateKeys.has(session.date));
}

function addCompletedForSessions(
  sessions: readonly WorkoutSession[],
  target: Partial<Record<MuscleId, MuscleCounts>>,
  opts: { finishedSessionsOnly: boolean }
): string[] {
  const names: string[] = [];
  for (const session of sessions) {
    if (opts.finishedSessionsOnly && !isWorkoutSessionComplete(session)) continue;
    const exerciseNames = opts.finishedSessionsOnly
      ? namesFromEntries(session.exercises)
      : completedExerciseNames(session);
    if (exerciseNames.length === 0) continue;
    names.push(...exerciseNames);
    addMusclesOnce(target, exerciseNames, "completedCount");
  }
  return names;
}

function snapshotHasActivity(snapshot: MuscleWeekSnapshot): boolean {
  if (snapshot.unmappedScheduledNames.length > 0) return true;
  if (snapshot.unmappedCompletedNames.length > 0) return true;
  return Object.values(snapshot.byMuscle).some(
    (counts) => (counts?.scheduledCount ?? 0) > 0 || (counts?.completedCount ?? 0) > 0
  );
}

export function buildMuscleWeekSnapshot(
  plans: readonly WorkoutPlan[],
  sessions: readonly WorkoutSession[],
  weekStart: string
): MuscleWeekSnapshot | undefined {
  const weekEnd = weekEndKeyFromStart(weekStart);
  if (!weekEnd) return undefined;

  const dateKeys = dateKeysInWeek(weekStart);
  const dateSet = new Set(dateKeys);
  const byMuscle: Partial<Record<MuscleId, MuscleCounts>> = {};

  const scheduledNames = addScheduledForDates(plans, dateKeys, byMuscle);
  const completedNames = addCompletedForSessions(sessionsOnDates(sessions, dateSet), byMuscle, {
    finishedSessionsOnly: false,
  });

  return {
    weekStart,
    weekEnd,
    byMuscle,
    unmappedScheduledNames: collectUnmappedExerciseNames(scheduledNames),
    unmappedCompletedNames: collectUnmappedExerciseNames(completedNames),
  };
}

export function listMuscleWeekSnapshots(
  plans: readonly WorkoutPlan[],
  sessions: readonly WorkoutSession[],
  todayKey: string
): MuscleWeekSnapshot[] {
  const currentWeek = weekStartKeyFromDateKey(todayKey);
  if (!currentWeek) return [];

  const weekStarts = collectWeekStarts(sessions, todayKey);
  const snapshots: MuscleWeekSnapshot[] = [];

  for (const weekStart of weekStarts) {
    const snapshot = buildMuscleWeekSnapshot(plans, sessions, weekStart);
    if (!snapshot) continue;
    if (weekStart === currentWeek || snapshotHasActivity(snapshot)) {
      snapshots.push(snapshot);
    }
  }

  return snapshots.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function muscleStatusFromCounts(counts: MuscleCounts | undefined): MuscleStatus {
  if (!counts) return "idle";
  if (counts.completedCount > 0) return "completed";
  if (counts.scheduledCount > 0) return "scheduled";
  return "idle";
}

export function heatmapPercent(counts: MuscleCounts, mode: "adherence" | "relative", maxCompleted: number): number {
  if (mode === "adherence") {
    if (counts.scheduledCount > 0) {
      return Math.min(1, counts.completedCount / counts.scheduledCount);
    }
    return counts.completedCount > 0 ? 1 : 0;
  }
  if (maxCompleted <= 0) return 0;
  return counts.completedCount / maxCompleted;
}

export function buildMuscleMonthHeatmap(
  plans: readonly WorkoutPlan[],
  sessions: readonly WorkoutSession[],
  yearMonth: string
): MuscleMonthHeatmap | undefined {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return undefined;

  const dateKeys = dateKeysInMonth(yearMonth);
  if (dateKeys.length === 0) return undefined;
  const dateSet = new Set(dateKeys);
  const byMuscle: Partial<Record<MuscleId, MuscleCounts>> = {};

  addScheduledForDates(plans, dateKeys, byMuscle);
  addCompletedForSessions(sessionsOnDates(sessions, dateSet), byMuscle, {
    finishedSessionsOnly: true,
  });

  const anyScheduled = Object.values(byMuscle).some((counts) => (counts?.scheduledCount ?? 0) > 0);
  const maxCompleted = Object.values(byMuscle).reduce(
    (max, counts) => Math.max(max, counts?.completedCount ?? 0),
    0
  );
  const mode = anyScheduled ? "adherence" : "relative";

  const withPercent: MuscleMonthHeatmap["byMuscle"] = {};
  for (const [id, counts] of Object.entries(byMuscle) as Array<[MuscleId, MuscleCounts]>) {
    withPercent[id] = {
      ...counts,
      percent: heatmapPercent(counts, mode, maxCompleted),
    };
  }

  return { yearMonth, byMuscle: withPercent };
}

export function listMuscleMonthKeys(
  sessions: readonly WorkoutSession[],
  todayKey: string
): string[] {
  return collectMonthKeys(sessions, todayKey).sort((a, b) => b.localeCompare(a));
}
