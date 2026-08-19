import { describe, expect, it } from "vitest";
import type { CookingSession, CookingTimer, Recipe, RecipeStep } from "./model";
import {
  advanceStep,
  applyTimerOp,
  buildInProgressCookingSession,
  canAdvanceStep,
  defaultsForStepKind,
  findActiveCookingSession,
  formatTimerRemaining,
  goToStep,
  pauseTimer,
  pickFresherSession,
  remainingSeconds,
  restartTimer,
  resumeTimer,
  rehydrateCookingSession,
  retreatStep,
  startGuidedFromPlanned,
  startTimer,
  stepProgress,
  tickSession,
  tickTimer,
  timerHasFinished,
} from "./cookingSession";

const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STEP_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STEP_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STEP_C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TIMER_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TIMER_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-08-19T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function sampleStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: STEP_A,
    order: 0,
    text: "Boil pasta 10 min",
    kind: "wait",
    blocksProgress: false,
    canRunInBackground: true,
    timerSeconds: 600,
    timerLabel: "Pasta",
    ...overrides,
  };
}

function sampleRecipe(steps?: RecipeStep[]): Recipe {
  return {
    id: RECIPE_ID,
    title: "Weeknight carbonara",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    ingredients: [{ id: STEP_C, rawText: "200g pasta" }],
    steps: steps ?? [
      sampleStep(),
      sampleStep({
        id: STEP_B,
        order: 1,
        text: "Prepare sauce",
        kind: "parallel",
        blocksProgress: false,
        canRunInBackground: true,
        timerSeconds: undefined,
        timerLabel: undefined,
      }),
    ],
    equipment: [],
    gallery: [],
    source: "manual",
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
}

function sampleTimer(overrides: Partial<CookingTimer> = {}): CookingTimer {
  return {
    id: TIMER_A,
    stepId: STEP_A,
    label: "Pasta",
    durationSeconds: 600,
    status: "idle",
    ...overrides,
  };
}

function sampleSession(overrides: Partial<CookingSession> = {}): CookingSession {
  return {
    id: SESSION_ID,
    recipeId: RECIPE_ID,
    recipeTitle: "Weeknight carbonara",
    status: "in_progress",
    cookDate: "2026-08-19",
    startedAtIso: NOW,
    currentStepIndex: 0,
    timers: [sampleTimer()],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function ids(): string[] {
  const queue = [TIMER_A, TIMER_B];
  return queue;
}

function createIdFrom(queue: string[]): () => string {
  return () => queue.shift() ?? "00000000-0000-4000-8000-000000000000";
}

describe("remaining time", () => {
  it("returns duration for idle, remainingSecondsAtPause for paused, 0 for done", () => {
    expect(remainingSeconds(sampleTimer(), NOW)).toBe(600);
    expect(
      remainingSeconds(sampleTimer({ status: "paused", remainingSecondsAtPause: 42 }), NOW)
    ).toBe(42);
    expect(remainingSeconds(sampleTimer({ status: "done" }), NOW)).toBe(0);
  });

  it("derives running remaining from endsAtIso", () => {
    const running = startTimer(sampleTimer(), NOW);
    expect(running.status).toBe("running");
    expect(running.endsAtIso).toBe("2026-08-19T18:10:00.000Z");
    expect(remainingSeconds(running, NOW)).toBe(600);
    expect(remainingSeconds(running, NOW_MS + 90_000)).toBe(510);
  });

  it("formats mm:ss and h:mm:ss", () => {
    expect(formatTimerRemaining(0)).toBe("0:00");
    expect(formatTimerRemaining(75)).toBe("1:15");
    expect(formatTimerRemaining(3661)).toBe("1:01:01");
  });
});

describe("timer reducers", () => {
  it("starts, pauses, resumes, and restarts a timer", () => {
    const started = startTimer(sampleTimer(), NOW);
    expect(started.status).toBe("running");
    expect(started.endsAtIso).toBeDefined();

    const paused = pauseTimer(started, NOW_MS + 10_000);
    expect(paused.status).toBe("paused");
    expect(paused.remainingSecondsAtPause).toBe(590);
    expect(paused.endsAtIso).toBeUndefined();

    const resumed = resumeTimer(paused, NOW_MS + 20_000);
    expect(resumed.status).toBe("running");
    expect(resumed.endsAtIso).toBe(new Date(NOW_MS + 20_000 + 590_000).toISOString());

    const restarted = restartTimer(resumed, NOW_MS + 30_000);
    expect(restarted.status).toBe("running");
    expect(remainingSeconds(restarted, NOW_MS + 30_000)).toBe(600);
  });

  it("marks a running timer done when tick reaches endsAt, idempotently", () => {
    const started = startTimer(sampleTimer({ durationSeconds: 10 }), NOW);
    const almost = tickTimer(started, NOW_MS + 9_000);
    expect(almost.status).toBe("running");
    expect(timerHasFinished(almost, NOW_MS + 9_000)).toBe(false);

    const done = tickTimer(started, NOW_MS + 10_000);
    expect(done.status).toBe("done");
    expect(done.endsAtIso).toBeUndefined();
    expect(tickTimer(done, NOW_MS + 20_000).status).toBe("done");
    expect(timerHasFinished(started, NOW_MS + 10_000)).toBe(true);
  });

  it("ticks multiple timers independently", () => {
    const session = sampleSession({
      timers: [
        startTimer(sampleTimer({ durationSeconds: 10 }), NOW),
        startTimer(sampleTimer({ id: TIMER_B, stepId: STEP_B, durationSeconds: 30 }), NOW),
      ],
    });
    const result = tickSession(session, NOW_MS + 10_000);
    expect(result.changed).toBe(true);
    expect(result.newlyDone).toHaveLength(1);
    expect(result.session.timers[0]?.status).toBe("done");
    expect(result.session.timers[1]?.status).toBe("running");

    const noop = tickSession(result.session, NOW_MS + 10_000);
    expect(noop.changed).toBe(false);
    expect(noop.newlyDone).toHaveLength(0);
  });
});

describe("step navigation", () => {
  it("lets parallel and wait steps advance while a timer is running", () => {
    const recipe = sampleRecipe();
    const session = sampleSession({
      timers: [startTimer(sampleTimer(), NOW)],
    });
    expect(canAdvanceStep(session, recipe)).toBe(true);
    const next = advanceStep(session, recipe);
    expect(next?.currentStepIndex).toBe(1);
    expect(next?.timers[0]?.status).toBe("running");
  });

  it("blocks advancing a blocking timer step until the timer is done", () => {
    const recipe = sampleRecipe([
      sampleStep({
        kind: "timer",
        blocksProgress: true,
        canRunInBackground: false,
        timerSeconds: 60,
        text: "Bake 1 min",
      }),
      sampleStep({ id: STEP_B, order: 1, text: "Cool", kind: "blocking", timerSeconds: undefined }),
    ]);
    const running = sampleSession({
      timers: [startTimer(sampleTimer({ durationSeconds: 60 }), NOW)],
    });
    expect(canAdvanceStep(running, recipe)).toBe(false);
    expect(advanceStep(running, recipe)).toBeUndefined();

    const done = applyTimerOp(running, TIMER_A, (timer) => tickTimer(timer, NOW_MS + 60_000));
    expect(canAdvanceStep(done, recipe)).toBe(true);
    expect(advanceStep(done, recipe)?.currentStepIndex).toBe(1);
  });

  it("clamps next/back to the step range", () => {
    const recipe = sampleRecipe();
    const atStart = sampleSession({ currentStepIndex: 0 });
    expect(retreatStep(atStart, recipe).currentStepIndex).toBe(0);

    const atEnd = goToStep(atStart, recipe, 99);
    expect(atEnd.currentStepIndex).toBe(1);
    expect(canAdvanceStep(atEnd, recipe)).toBe(false);
    expect(stepProgress(atEnd, recipe)).toEqual({ current: 2, total: 2, ratio: 1 });
  });
});

describe("session start and rehydrate", () => {
  it("builds an in-progress session with idle timers from recipe steps", () => {
    const built = buildInProgressCookingSession(
      sampleRecipe(),
      NOW,
      createIdFrom(ids())
    );
    expect(built.status).toBe("in_progress");
    expect(built.currentStepIndex).toBe(0);
    expect(built.startedAtIso).toBe(NOW);
    expect(built.timers).toHaveLength(1);
    expect(built.timers[0]).toMatchObject({
      id: TIMER_A,
      stepId: STEP_A,
      status: "idle",
      durationSeconds: 600,
      label: "Pasta",
    });
  });

  it("promotes a planned session into guided mode", () => {
    const planned = sampleSession({
      status: "planned",
      startedAtIso: undefined,
      currentStepIndex: undefined,
      timers: [],
    });
    const started = startGuidedFromPlanned(
      planned,
      sampleRecipe(),
      NOW,
      createIdFrom(ids())
    );
    expect(started.id).toBe(SESSION_ID);
    expect(started.status).toBe("in_progress");
    expect(started.timers).toHaveLength(1);
  });

  it("prefers the most recently updated session and ticks finished timers after a gap", () => {
    const older = sampleSession({
      updatedAtIso: "2026-08-19T17:00:00.000Z",
      timers: [startTimer(sampleTimer({ durationSeconds: 10 }), NOW)],
    });
    const newer = {
      ...older,
      updatedAtIso: "2026-08-19T18:05:00.000Z",
      notes: "From the other device",
    };
    expect(pickFresherSession(older, newer)?.notes).toBe("From the other device");

    const result = rehydrateCookingSession(older, newer, NOW_MS + 10_000);
    expect(result.session?.notes).toBe("From the other device");
    expect(result.newlyDone).toHaveLength(1);
    expect(result.session?.timers[0]?.status).toBe("done");
  });

  it("picks the freshest in-progress session", () => {
    const stale = sampleSession({
      id: "22222222-2222-4222-8222-222222222222",
      updatedAtIso: "2026-08-19T17:00:00.000Z",
    });
    const fresh = sampleSession({ updatedAtIso: "2026-08-19T18:01:00.000Z" });
    expect(findActiveCookingSession([stale, fresh])?.id).toBe(SESSION_ID);
  });
});

describe("defaultsForStepKind", () => {
  it("lets wait and parallel run in the background", () => {
    expect(defaultsForStepKind("wait")).toEqual({
      blocksProgress: false,
      canRunInBackground: true,
    });
    expect(defaultsForStepKind("blocking")).toEqual({
      blocksProgress: true,
      canRunInBackground: false,
    });
  });
});
