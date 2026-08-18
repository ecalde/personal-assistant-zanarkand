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
  const inWeek = sessions.filter(
    (session) =>
      isWorkoutSessionComplete(session) && isDateKeyInLocalWeek(session.date, weekStart)
  );

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

// ---------------------------------------------------------------------------
// Live session state (in-progress vs completed)
// ---------------------------------------------------------------------------

/** A session is complete once it has a `completedAtIso` stamp. */
export function isWorkoutSessionComplete(session: WorkoutSession): boolean {
  return session.completedAtIso !== undefined;
}

/** A session is in progress while it has no `completedAtIso` stamp. */
export function isWorkoutSessionInProgress(session: WorkoutSession): boolean {
  return !isWorkoutSessionComplete(session);
}

export function isExerciseCompleted(entry: ExerciseEntry): boolean {
  return entry.completedAtIso !== undefined;
}

export function countCompletedExercises(session: WorkoutSession): number {
  return session.exercises.filter(isExerciseCompleted).length;
}

/**
 * Finds an existing session for a plan on a given date. Prefers an in-progress
 * session so live logging resumes rather than starting over.
 */
export function findSessionForPlanDate(
  sessions: WorkoutSession[],
  planId: string,
  dateKey: string
): WorkoutSession | undefined {
  const matches = sessions.filter(
    (session) => session.planId === planId && session.date === dateKey
  );
  return matches.find(isWorkoutSessionInProgress) ?? matches[0];
}

/** Toggles a single exercise's completion flag. Returns a new session clone. */
export function toggleExerciseCompleted(
  session: WorkoutSession,
  exerciseId: string,
  nowIso: string
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((entry) => {
      if (entry.id !== exerciseId) return entry;
      const next = { ...entry };
      if (isExerciseCompleted(entry)) {
        delete next.completedAtIso;
      } else {
        next.completedAtIso = nowIso;
      }
      return next;
    }),
  };
}

/** Fallback when a live-session exercise name would otherwise be empty. */
export const FALLBACK_EXERCISE_NAME = "Exercise";

/** Name used when adding an exercise during a live session. */
export const DEFAULT_ADDED_EXERCISE_NAME = "New exercise";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function nonEmptyExerciseName(name: string | undefined, fallback = FALLBACK_EXERCISE_NAME): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed) return trimmed;
  const fallbackTrimmed = fallback.trim();
  return fallbackTrimmed || FALLBACK_EXERCISE_NAME;
}

/** Sets (or clears) a single exercise's weight. Returns a new session clone. */
export function setExerciseWeight(
  session: WorkoutSession,
  exerciseId: string,
  weight: number | undefined
): WorkoutSession {
  return updateSessionExercise(session, exerciseId, { weight });
}

/**
 * Patches optional numeric/text fields on one exercise. `undefined` in the patch
 * clears that field. Name is never persisted empty (mapper validation). Returns
 * a new session clone; never mutates the input.
 */
export function updateSessionExercise(
  session: WorkoutSession,
  exerciseId: string,
  patch: Partial<Pick<ExerciseEntry, "name" | "sets" | "reps" | "weight" | "notes">>
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((entry) => {
      if (entry.id !== exerciseId) return entry;
      const next: ExerciseEntry = { ...entry };

      if ("name" in patch) {
        next.name = nonEmptyExerciseName(patch.name, entry.name);
      }
      if ("sets" in patch) {
        if (patch.sets === undefined) delete next.sets;
        else next.sets = patch.sets;
      }
      if ("reps" in patch) {
        if (patch.reps === undefined) delete next.reps;
        else next.reps = patch.reps;
      }
      if ("weight" in patch) {
        if (patch.weight === undefined) delete next.weight;
        else next.weight = patch.weight;
      }
      if ("notes" in patch) {
        const notes = patch.notes?.trim() ?? "";
        if (notes) next.notes = notes;
        else delete next.notes;
      }

      return next;
    }),
  };
}

/** Marks every exercise complete at `nowIso`. Returns a new session clone. */
export function markAllExercisesCompleted(
  session: WorkoutSession,
  nowIso: string
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((entry) =>
      isExerciseCompleted(entry) ? entry : { ...entry, completedAtIso: nowIso }
    ),
  };
}

function localHHMMFromIso(iso: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Combines a YYYY-MM-DD date and HH:MM local time into a local ISO timestamp. */
export function combineDateTimeToIso(dateKey: string, hhmm: string): string | undefined {
  if (!DATE_KEY_RE.test(dateKey) || !HHMM_RE.test(hhmm)) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!year || !month || !day) return undefined;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined;
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/**
 * The session's local start time as HH:MM. Prefers the explicit `startedAtIso`,
 * falling back to the legacy `completedAtIso` for sessions logged before start
 * time existed.
 */
export function resolveSessionStartHHMM(session: WorkoutSession): string | undefined {
  if (session.startedAtIso) {
    const fromStart = localHHMMFromIso(session.startedAtIso);
    if (fromStart) return fromStart;
  }
  if (session.completedAtIso) {
    return localHHMMFromIso(session.completedAtIso);
  }
  return undefined;
}

/** Sets or clears the session start time from a local HH:MM string. */
export function setSessionStartHHMM(session: WorkoutSession, hhmm: string): WorkoutSession {
  const next = { ...session };
  const trimmed = hhmm.trim();
  if (!trimmed) {
    delete next.startedAtIso;
    return next;
  }
  const startedAtIso = combineDateTimeToIso(session.date, trimmed);
  if (!startedAtIso) return session;
  next.startedAtIso = startedAtIso;
  return next;
}

/** Sets or clears planned/elapsed duration. Non-positive values clear the field. */
export function setSessionDurationMinutes(
  session: WorkoutSession,
  minutes: number | undefined
): WorkoutSession {
  const next = { ...session };
  if (minutes === undefined || !Number.isInteger(minutes) || minutes <= 0) {
    delete next.durationMinutes;
    return next;
  }
  next.durationMinutes = minutes;
  return next;
}

/** Stamps `completedAtIso` without requiring every exercise to be checked off. */
export function finishWorkoutSession(session: WorkoutSession, nowIso: string): WorkoutSession {
  return { ...session, completedAtIso: nowIso };
}

/** Retro path: every exercise complete plus a finished session stamp. */
export function markAllExercisesCompletedAndFinish(
  session: WorkoutSession,
  nowIso: string
): WorkoutSession {
  return finishWorkoutSession(markAllExercisesCompleted(session, nowIso), nowIso);
}

export function addSessionExercise(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    exercises: [
      ...session.exercises,
      { id: crypto.randomUUID(), name: DEFAULT_ADDED_EXERCISE_NAME },
    ],
  };
}

export function removeSessionExercise(
  session: WorkoutSession,
  exerciseId: string
): WorkoutSession {
  if (session.exercises.length <= 1) return session;
  const nextExercises = session.exercises.filter((entry) => entry.id !== exerciseId);
  if (nextExercises.length === session.exercises.length) return session;
  return { ...session, exercises: nextExercises };
}

/**
 * Scheduled plans for `dateKey` that do not yet have a completed session.
 * One entry per plan even if the day has multiple blocks.
 */
export function plansForLiveLogger(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[],
  dateKey: string
): WorkoutPlan[] {
  const seen = new Set<string>();
  const result: WorkoutPlan[] = [];

  for (const occ of expandWorkoutOccurrencesForDate(plans, dateKey)) {
    if (seen.has(occ.planId)) continue;
    seen.add(occ.planId);
    const plan = plans.find((candidate) => candidate.id === occ.planId);
    if (!plan) continue;
    if (isWorkoutOccurrenceComplete(plan, dateKey, occ.blockId, sessions)) continue;
    result.push(plan);
  }

  return result;
}

/**
 * Seeds an in-progress session from a plan. Generates no persistence — caller
 * supplies a stable `sessionId` so later taps update the same row.
 */
export function createLiveSessionFromPlan(
  plan: WorkoutPlan,
  dateKey: string,
  nowIso: string,
  sessionId: string
): WorkoutSession {
  const draft = createSessionDraftFromPlan(plan, dateKey);
  const exercises =
    draft.exercises.length > 0
      ? draft.exercises.map((entry) => ({
          ...entry,
          name: nonEmptyExerciseName(entry.name),
        }))
      : [{ id: crypto.randomUUID(), name: DEFAULT_ADDED_EXERCISE_NAME }];

  const session: WorkoutSession = {
    ...draft,
    id: sessionId,
    exercises,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const occurrence = expandWorkoutOccurrencesForDate([plan], dateKey)[0];
  if (occurrence) {
    session.durationMinutes = occurrence.block.minutes;
    const startedAtIso = combineDateTimeToIso(dateKey, occurrence.block.startTime);
    if (startedAtIso) session.startedAtIso = startedAtIso;
  }

  return session;
}

export function copyExercisesFromPlan(plan: WorkoutPlan): ExerciseEntry[] {
  return plan.exercises.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
    sourceExerciseId: entry.id,
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

export type FitnessFocus = {
  date: string;
  planId: string;
};

export type DashboardWorkoutExercise = {
  exerciseId: string;
  name: string;
  weight?: number;
  completed: boolean;
};

export type DashboardWorkoutLogger = {
  planId: string;
  planName: string;
  progressLabel: string;
  exercises: DashboardWorkoutExercise[];
};

/**
 * Resolves a dashboard/Fitness exercise id to the session row id. Accepts the
 * session entry id or the plan `sourceExerciseId` after a copy.
 */
export function resolveSessionExerciseId(
  session: WorkoutSession,
  exerciseId: string
): string | undefined {
  if (session.exercises.some((entry) => entry.id === exerciseId)) return exerciseId;
  return session.exercises.find((entry) => entry.sourceExerciseId === exerciseId)?.id;
}

/**
 * Returns the in-progress session for a plan on `dateKey`, or seeds a new live
 * session. Completed sessions are left alone (caller should not mutate them).
 */
export function ensureLiveSessionForPlan(
  plan: WorkoutPlan,
  sessions: WorkoutSession[],
  dateKey: string,
  nowIso: string,
  newSessionId: string
): WorkoutSession | undefined {
  const existing = findSessionForPlanDate(sessions, plan.id, dateKey);
  if (existing) {
    return isWorkoutSessionInProgress(existing) ? existing : undefined;
  }
  return createLiveSessionFromPlan(plan, dateKey, nowIso, newSessionId);
}

/** Today's scheduled plans without a finished session, with live or plan exercises. */
export function buildDashboardWorkoutLoggers(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[],
  dateKey: string
): DashboardWorkoutLogger[] {
  return plansForLiveLogger(plans, sessions, dateKey).map((plan) => {
    const live = findSessionForPlanDate(sessions, plan.id, dateKey);
    const entries =
      live && isWorkoutSessionInProgress(live) ? live.exercises : plan.exercises;
    const completedCount =
      live && isWorkoutSessionInProgress(live) ? countCompletedExercises(live) : 0;
    return {
      planId: plan.id,
      planName: plan.name,
      progressLabel: `${completedCount}/${entries.length}`,
      exercises: entries.map((entry) => ({
        exerciseId: entry.id,
        name: entry.name,
        ...(entry.weight !== undefined ? { weight: entry.weight } : {}),
        completed: isExerciseCompleted(entry),
      })),
    };
  });
}

export function dashboardToggleExercise(
  plan: WorkoutPlan,
  sessions: WorkoutSession[],
  exerciseId: string,
  dateKey: string,
  nowIso: string,
  newSessionId: string
): WorkoutSession | undefined {
  const session = ensureLiveSessionForPlan(plan, sessions, dateKey, nowIso, newSessionId);
  if (!session) return undefined;
  const resolved = resolveSessionExerciseId(session, exerciseId);
  if (!resolved) return undefined;
  return toggleExerciseCompleted(session, resolved, nowIso);
}

export function dashboardSetExerciseWeight(
  plan: WorkoutPlan,
  sessions: WorkoutSession[],
  exerciseId: string,
  weight: number | undefined,
  dateKey: string,
  nowIso: string,
  newSessionId: string
): WorkoutSession | undefined {
  const session = ensureLiveSessionForPlan(plan, sessions, dateKey, nowIso, newSessionId);
  if (!session) return undefined;
  const resolved = resolveSessionExerciseId(session, exerciseId);
  if (!resolved) return undefined;
  return setExerciseWeight(session, resolved, weight);
}

/** Lowercased, trimmed, collapsed whitespace — shared catalog key for charts. */
export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Unique exercise names, most-recent completed sessions first, then plans as a
 * known-name fallback. In-progress sessions are ignored so live drafts do not
 * pollute autocomplete or the Phase 46 catalog.
 */
export function collectRecentExerciseNames(
  plans: WorkoutPlan[],
  sessions: WorkoutSession[],
  limit = 20
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  const addName = (name: string) => {
    const key = normalizeExerciseName(name);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name.trim().replace(/\s+/g, " "));
  };

  const completed = sessions.filter(isWorkoutSessionComplete);
  for (const session of filterAndSortSessions(completed, { sortMode: "recent" })) {
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
  return sessions.some(
    (session) =>
      isWorkoutSessionComplete(session) &&
      matchSessionToScheduledOccurrence(session, plan, dateKey)
  );
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
