/**
 * Pure guided-cooking session + timer reducers.
 *
 * Timers store absolute `endsAtIso` timestamps. Remaining time is derived as
 * `endsAt - now` so refresh, sleep, and device changes stay correct.
 */

import { formatLocalDateKey } from "./timeline";
import type {
  CookingSession,
  CookingTimer,
  Recipe,
  RecipeStep,
  RecipeStepKind,
} from "./model";

export type CreateId = () => string;

export type TickResult = {
  session: CookingSession;
  newlyDone: CookingTimer[];
  changed: boolean;
};

export type RehydrateResult = {
  session: CookingSession | undefined;
  newlyDone: CookingTimer[];
  changed: boolean;
};

function toMs(now: Date | string | number): number {
  if (typeof now === "number") return now;
  if (typeof now === "string") return Date.parse(now);
  return now.getTime();
}

function toIso(now: Date | string | number): string {
  if (typeof now === "string") return new Date(Date.parse(now)).toISOString();
  if (typeof now === "number") return new Date(now).toISOString();
  return now.toISOString();
}

function cloneTimer(timer: CookingTimer): CookingTimer {
  return { ...timer };
}

function cloneSession(session: CookingSession): CookingSession {
  return {
    ...session,
    timers: session.timers.map(cloneTimer),
  };
}

export function orderedRecipeSteps(recipe: Recipe): RecipeStep[] {
  return [...recipe.steps].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

export function defaultsForStepKind(kind: RecipeStepKind): {
  blocksProgress: boolean;
  canRunInBackground: boolean;
} {
  switch (kind) {
    case "parallel":
    case "wait":
      return { blocksProgress: false, canRunInBackground: true };
    case "timer":
      return { blocksProgress: true, canRunInBackground: false };
    case "blocking":
    default:
      return { blocksProgress: true, canRunInBackground: false };
  }
}

export function remainingMs(timer: CookingTimer, now: Date | string | number): number {
  const nowMs = toMs(now);
  switch (timer.status) {
    case "running": {
      if (!timer.endsAtIso) return timer.durationSeconds * 1000;
      const endsAt = Date.parse(timer.endsAtIso);
      if (!Number.isFinite(endsAt)) return 0;
      return Math.max(0, endsAt - nowMs);
    }
    case "paused":
      return Math.max(0, (timer.remainingSecondsAtPause ?? timer.durationSeconds) * 1000);
    case "done":
      return 0;
    case "idle":
    default:
      return Math.max(0, timer.durationSeconds * 1000);
  }
}

export function remainingSeconds(timer: CookingTimer, now: Date | string | number): number {
  return Math.max(0, Math.floor(remainingMs(timer, now) / 1000));
}

export function timerHasFinished(timer: CookingTimer, now: Date | string | number): boolean {
  if (timer.status === "done") return true;
  if (timer.status === "running") return remainingMs(timer, now) <= 0;
  return false;
}

export function formatTimerRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function markTimerDone(timer: CookingTimer): CookingTimer {
  const next: CookingTimer = {
    ...timer,
    status: "done",
  };
  delete next.endsAtIso;
  delete next.remainingSecondsAtPause;
  return next;
}

export function startTimer(timer: CookingTimer, now: Date | string | number): CookingTimer {
  if (timer.status === "done") return cloneTimer(timer);
  const nowMs = toMs(now);
  const remaining = remainingMs(timer, nowMs);
  if (remaining <= 0) return markTimerDone(timer);
  const next: CookingTimer = {
    ...timer,
    status: "running",
    endsAtIso: new Date(nowMs + remaining).toISOString(),
    startedAtIso: timer.startedAtIso ?? toIso(nowMs),
  };
  delete next.remainingSecondsAtPause;
  return next;
}

export function pauseTimer(timer: CookingTimer, now: Date | string | number): CookingTimer {
  if (timer.status !== "running") return cloneTimer(timer);
  const remaining = remainingSeconds(timer, now);
  if (remaining <= 0) return markTimerDone(timer);
  const next: CookingTimer = {
    ...timer,
    status: "paused",
    remainingSecondsAtPause: remaining,
  };
  delete next.endsAtIso;
  return next;
}

export function resumeTimer(timer: CookingTimer, now: Date | string | number): CookingTimer {
  if (timer.status !== "paused") return cloneTimer(timer);
  return startTimer(timer, now);
}

export function restartTimer(timer: CookingTimer, now: Date | string | number): CookingTimer {
  const reset: CookingTimer = {
    ...timer,
    status: "idle",
    durationSeconds: timer.durationSeconds,
  };
  delete reset.endsAtIso;
  delete reset.remainingSecondsAtPause;
  delete reset.startedAtIso;
  return startTimer(reset, now);
}

export function tickTimer(timer: CookingTimer, now: Date | string | number): CookingTimer {
  if (timer.status !== "running") return cloneTimer(timer);
  if (remainingMs(timer, now) > 0) return cloneTimer(timer);
  return markTimerDone(timer);
}

export function idleTimerFromStep(step: RecipeStep, id: string): CookingTimer | undefined {
  if (step.timerSeconds === undefined || !Number.isInteger(step.timerSeconds) || step.timerSeconds <= 0) {
    return undefined;
  }
  const label = step.timerLabel?.trim() || step.text.trim() || "Timer";
  const timer: CookingTimer = {
    id,
    stepId: step.id,
    label,
    durationSeconds: step.timerSeconds,
    status: "idle",
  };
  return timer;
}

export function timersFromRecipe(recipe: Recipe, createId: CreateId): CookingTimer[] {
  const timers: CookingTimer[] = [];
  for (const step of orderedRecipeSteps(recipe)) {
    const timer = idleTimerFromStep(step, createId());
    if (timer) timers.push(timer);
  }
  return timers;
}

export function findActiveCookingSession(
  sessions: readonly CookingSession[]
): CookingSession | undefined {
  const active = sessions.filter((session) => session.status === "in_progress");
  if (active.length === 0) return undefined;
  return [...active].sort((a, b) => {
    const byUpdated = b.updatedAtIso.localeCompare(a.updatedAtIso);
    if (byUpdated !== 0) return byUpdated;
    return b.id.localeCompare(a.id);
  })[0];
}

export function currentStepIndex(session: CookingSession): number {
  return session.currentStepIndex ?? 0;
}

export function currentRecipeStep(
  session: CookingSession,
  recipe: Recipe
): RecipeStep | undefined {
  const steps = orderedRecipeSteps(recipe);
  return steps[currentStepIndex(session)];
}

export function timerForStep(
  session: CookingSession,
  stepId: string
): CookingTimer | undefined {
  return session.timers.find((timer) => timer.stepId === stepId);
}

export function canAdvanceStep(session: CookingSession, recipe: Recipe): boolean {
  const steps = orderedRecipeSteps(recipe);
  const index = currentStepIndex(session);
  if (index >= steps.length - 1) return false;
  const step = steps[index];
  if (!step) return false;
  if (!step.blocksProgress || step.canRunInBackground === true) return true;
  const timer = timerForStep(session, step.id);
  if (!timer) return true;
  return timer.status === "done";
}

export function canRetreatStep(session: CookingSession): boolean {
  return currentStepIndex(session) > 0;
}

export function stepProgress(
  session: CookingSession,
  recipe: Recipe
): { current: number; total: number; ratio: number } {
  const total = Math.max(1, orderedRecipeSteps(recipe).length);
  const current = Math.min(total, currentStepIndex(session) + 1);
  return { current, total, ratio: current / total };
}

function clampStepIndex(index: number, recipe: Recipe): number {
  const last = Math.max(0, orderedRecipeSteps(recipe).length - 1);
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(index, last));
}

export function goToStep(
  session: CookingSession,
  recipe: Recipe,
  index: number
): CookingSession {
  const next = cloneSession(session);
  next.currentStepIndex = clampStepIndex(index, recipe);
  return next;
}

export function advanceStep(
  session: CookingSession,
  recipe: Recipe
): CookingSession | undefined {
  if (!canAdvanceStep(session, recipe)) return undefined;
  return goToStep(session, recipe, currentStepIndex(session) + 1);
}

export function retreatStep(session: CookingSession, recipe: Recipe): CookingSession {
  return goToStep(session, recipe, currentStepIndex(session) - 1);
}

export function applyTimerOp(
  session: CookingSession,
  timerId: string,
  op: (timer: CookingTimer) => CookingTimer
): CookingSession {
  const next = cloneSession(session);
  next.timers = next.timers.map((timer) => (timer.id === timerId ? op(timer) : timer));
  return next;
}

export function ensureStepTimer(
  session: CookingSession,
  recipe: Recipe,
  createId: CreateId
): CookingSession {
  const step = currentRecipeStep(session, recipe);
  if (!step || timerForStep(session, step.id)) return cloneSession(session);
  const timer = idleTimerFromStep(step, createId());
  if (!timer) return cloneSession(session);
  const next = cloneSession(session);
  next.timers = [...next.timers, timer];
  return next;
}

export function tickSession(
  session: CookingSession,
  now: Date | string | number
): TickResult {
  const newlyDone: CookingTimer[] = [];
  const timers = session.timers.map((timer) => {
    const ticked = tickTimer(timer, now);
    if (timer.status !== "done" && ticked.status === "done") {
      newlyDone.push(ticked);
    }
    return ticked;
  });
  const changed = newlyDone.length > 0;
  if (!changed) {
    return { session: cloneSession(session), newlyDone, changed: false };
  }
  return {
    session: { ...session, timers },
    newlyDone,
    changed: true,
  };
}

export function pickFresherSession(
  a?: CookingSession,
  b?: CookingSession
): CookingSession | undefined {
  if (!a) return b ? cloneSession(b) : undefined;
  if (!b) return cloneSession(a);
  if (a.id !== b.id) {
    return a.updatedAtIso >= b.updatedAtIso ? cloneSession(a) : cloneSession(b);
  }
  return a.updatedAtIso >= b.updatedAtIso ? cloneSession(a) : cloneSession(b);
}

export function rehydrateCookingSession(
  payloadSession: CookingSession | undefined,
  localSession: CookingSession | undefined,
  now: Date | string | number
): RehydrateResult {
  const chosen = pickFresherSession(payloadSession, localSession);
  if (!chosen) {
    return { session: undefined, newlyDone: [], changed: false };
  }
  const ticked = tickSession(chosen, now);
  return {
    session: ticked.session,
    newlyDone: ticked.newlyDone,
    changed: ticked.changed,
  };
}

export function buildInProgressCookingSession(
  recipe: Recipe,
  now: Date | string | number,
  createId: CreateId
): Omit<CookingSession, "id" | "createdAtIso" | "updatedAtIso"> {
  const startedAtIso = toIso(now);
  return {
    recipeId: recipe.id,
    recipeTitle: recipe.title,
    status: "in_progress",
    cookDate: formatLocalDateKey(new Date(toMs(now))),
    startedAtIso,
    currentStepIndex: 0,
    timers: timersFromRecipe(recipe, createId),
  };
}

export function startGuidedFromPlanned(
  planned: CookingSession,
  recipe: Recipe,
  now: Date | string | number,
  createId: CreateId
): CookingSession {
  const built = buildInProgressCookingSession(recipe, now, createId);
  const next: CookingSession = {
    ...planned,
    ...built,
    id: planned.id,
    createdAtIso: planned.createdAtIso,
    updatedAtIso: planned.updatedAtIso,
    timers: built.timers,
  };
  if (planned.notes) next.notes = planned.notes;
  if (planned.servingsMade !== undefined) next.servingsMade = planned.servingsMade;
  return next;
}

export function abandonCookingSession(session: CookingSession): CookingSession {
  const next = cloneSession(session);
  next.status = "abandoned";
  return next;
}
