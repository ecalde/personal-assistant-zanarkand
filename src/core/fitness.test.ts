import { describe, expect, it } from "vitest";
import type { ExerciseEntry, WorkoutPlan, WorkoutSession } from "./model";
import {
  addSessionExercise,
  buildDashboardWorkoutLoggers,
  buildRecentSessions,
  buildWorkoutDayStatus,
  buildWorkoutWeekScheduleSummary,
  buildWorkoutWeekSummary,
  combineDateTimeToIso,
  copyExercisesFromPlan,
  countCompletedExercises,
  createLiveSessionFromPlan,
  createSessionDraftFromPlan,
  dashboardSetExerciseWeight,
  dashboardToggleExercise,
  DEFAULT_ADDED_EXERCISE_NAME,
  ensureLiveSessionForPlan,
  expandWorkoutOccurrencesForDate,
  FALLBACK_EXERCISE_NAME,
  filterAndSortPlans,
  filterAndSortSessions,
  findSessionForPlanDate,
  normalizeFitnessFocus,
  finishWorkoutSession,
  formatExerciseSummary,
  formatSessionDurationLabel,
  formatSessionHeadline,
  formatWorkoutFocus,
  isPlanSchedulable,
  isWorkoutOccurrenceComplete,
  isWorkoutSessionComplete,
  isWorkoutSessionInProgress,
  markAllExercisesCompleted,
  markAllExercisesCompletedAndFinish,
  matchSessionToScheduledOccurrence,
  planMatchesQuery,
  plansForLiveLogger,
  removeSessionExercise,
  resolveSessionExerciseId,
  resolveSessionStartHHMM,
  sessionMatchesQuery,
  setExerciseWeight,
  setSessionDurationMinutes,
  setSessionStartHHMM,
  sumSessionDurationMinutes,
  toggleExerciseCompleted,
  updateSessionExercise,
} from "./fitness";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXERCISE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-05-26T12:00:00.000Z";

function sampleExercise(overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: EXERCISE_ID,
    name: "Bench press",
    sets: 3,
    reps: 10,
    weight: 135,
    ...overrides,
  };
}

function samplePlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Push A",
    focus: "push",
    exercises: [sampleExercise()],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleWorkoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: SESSION_ID,
    date: "2026-05-26",
    focus: "push",
    planId: PLAN_ID,
    exercises: [sampleExercise({ name: "Incline press" })],
    completedAtIso: NOW,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("formatWorkoutFocus", () => {
  it("returns label for focus", () => {
    expect(formatWorkoutFocus("full_body")).toBe("Full body");
  });

  it("returns General when focus is undefined", () => {
    expect(formatWorkoutFocus(undefined)).toBe("General");
  });
});

describe("formatExerciseSummary", () => {
  it("formats sets, reps, and weight", () => {
    expect(formatExerciseSummary(sampleExercise())).toBe("Bench press · 3×10 · @ 135");
  });
});

describe("formatSessionHeadline", () => {
  it("includes extra exercise count", () => {
    const session = sampleWorkoutSession({
      exercises: [
        sampleExercise({ id: "a", name: "Squat" }),
        sampleExercise({ id: "b", name: "Leg press" }),
      ],
    });
    expect(formatSessionHeadline(session)).toContain("+1 more");
  });
});

describe("search helpers", () => {
  it("matches plan by exercise name", () => {
    expect(planMatchesQuery(samplePlan(), "bench")).toBe(true);
    expect(planMatchesQuery(samplePlan(), "deadlift")).toBe(false);
  });

  it("matches session by notes", () => {
    expect(
      sessionMatchesQuery(sampleWorkoutSession({ notes: "Felt strong" }), "strong")
    ).toBe(true);
  });
});

describe("filterAndSortPlans", () => {
  it("sorts by name", () => {
    const plans = [
      samplePlan({ id: "1", name: "Zebra" }),
      samplePlan({ id: "2", name: "Alpha" }),
    ];
    const sorted = filterAndSortPlans(plans, { sortMode: "name" });
    expect(sorted.map((plan) => plan.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("filters by focus", () => {
    const plans = [
      samplePlan({ id: "1", focus: "push" }),
      samplePlan({ id: "2", focus: "legs" }),
    ];
    const filtered = filterAndSortPlans(plans, {
      sortMode: "recent",
      focusFilter: "legs",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.focus).toBe("legs");
  });
});

describe("filterAndSortSessions", () => {
  it("sorts by date descending", () => {
    const sessions = [
      sampleWorkoutSession({ id: "1", date: "2026-05-20" }),
      sampleWorkoutSession({ id: "2", date: "2026-05-26" }),
    ];
    const sorted = filterAndSortSessions(sessions, { sortMode: "date" });
    expect(sorted[0]?.date).toBe("2026-05-26");
  });
});

describe("buildWorkoutWeekSummary", () => {
  it("counts sessions in the current week", () => {
    const sessions = [
      sampleWorkoutSession({ id: "1", date: "2026-05-26", focus: "push" }),
      sampleWorkoutSession({ id: "2", date: "2026-05-25", focus: "legs" }),
      sampleWorkoutSession({ id: "3", date: "2026-05-18", focus: "pull" }),
    ];
    const summary = buildWorkoutWeekSummary(sessions, "2026-05-26");
    expect(summary.count).toBe(2);
    expect(summary.byFocus.push).toBe(1);
    expect(summary.byFocus.legs).toBe(1);
    expect(summary.totalDurationMinutes).toBe(0);
    expect(summary.sessionsWithDuration).toBe(0);
  });

  it("sums duration minutes for sessions in the current week", () => {
    const sessions = [
      sampleWorkoutSession({ id: "1", date: "2026-05-26", durationMinutes: 45 }),
      sampleWorkoutSession({ id: "2", date: "2026-05-25", durationMinutes: 30 }),
      sampleWorkoutSession({ id: "3", date: "2026-05-18", durationMinutes: 60 }),
    ];
    const summary = buildWorkoutWeekSummary(sessions, "2026-05-26");
    expect(summary.totalDurationMinutes).toBe(75);
    expect(summary.sessionsWithDuration).toBe(2);
  });
});

describe("plan to session workflow", () => {
  it("copies exercises with new ids and source linkage", () => {
    const copied = copyExercisesFromPlan(samplePlan());
    expect(copied).toHaveLength(1);
    expect(copied[0]?.id).not.toBe(EXERCISE_ID);
    expect(copied[0]?.name).toBe("Bench press");
    expect(copied[0]?.sourceExerciseId).toBe(EXERCISE_ID);
  });

  it("creates session draft from plan", () => {
    const draft = createSessionDraftFromPlan(samplePlan(), "2026-05-27");
    expect(draft.date).toBe("2026-05-27");
    expect(draft.planId).toBe(PLAN_ID);
    expect(draft.exercises[0]?.name).toBe("Bench press");
  });
});

describe("buildRecentSessions", () => {
  it("returns newest sessions first", () => {
    const sessions = [
      sampleWorkoutSession({ id: "1", date: "2026-05-20" }),
      sampleWorkoutSession({ id: "2", date: "2026-05-26" }),
    ];
    const recent = buildRecentSessions(sessions, 1);
    expect(recent[0]?.date).toBe("2026-05-26");
  });
});

describe("session duration helpers", () => {
  it("sums session duration minutes", () => {
    const sessions = [
      sampleWorkoutSession({ id: "1", durationMinutes: 45 }),
      sampleWorkoutSession({ id: "2" }),
      sampleWorkoutSession({ id: "3", durationMinutes: 30 }),
    ];
    expect(sumSessionDurationMinutes(sessions)).toBe(75);
  });

  it("formats session duration label", () => {
    expect(formatSessionDurationLabel(sampleWorkoutSession({ durationMinutes: 45 }))).toBe(
      "45 min"
    );
    expect(formatSessionDurationLabel(sampleWorkoutSession())).toBeUndefined();
  });
});

describe("live session helpers", () => {
  it("distinguishes completed from in-progress sessions", () => {
    expect(isWorkoutSessionComplete(sampleWorkoutSession())).toBe(true);
    const inProgress = sampleWorkoutSession({ completedAtIso: undefined });
    expect(isWorkoutSessionComplete(inProgress)).toBe(false);
    expect(isWorkoutSessionInProgress(inProgress)).toBe(true);
  });

  it("toggles a single exercise's completion", () => {
    const session = sampleWorkoutSession({
      exercises: [sampleExercise({ id: "a" }), sampleExercise({ id: "b" })],
    });
    const toggled = toggleExerciseCompleted(session, "a", NOW);
    expect(toggled.exercises[0]?.completedAtIso).toBe(NOW);
    expect(toggled.exercises[1]?.completedAtIso).toBeUndefined();
    expect(countCompletedExercises(toggled)).toBe(1);

    const untoggled = toggleExerciseCompleted(toggled, "a", NOW);
    expect(untoggled.exercises[0]?.completedAtIso).toBeUndefined();
    // original session is not mutated
    expect(session.exercises[0]?.completedAtIso).toBeUndefined();
  });

  it("sets and clears an exercise weight without mutating the input", () => {
    const session = sampleWorkoutSession({
      exercises: [sampleExercise({ id: "a", weight: 100 })],
    });
    const heavier = setExerciseWeight(session, "a", 145);
    expect(heavier.exercises[0]?.weight).toBe(145);
    expect(session.exercises[0]?.weight).toBe(100);

    const cleared = setExerciseWeight(session, "a", undefined);
    expect(cleared.exercises[0]?.weight).toBeUndefined();
  });

  it("marks all exercises complete", () => {
    const session = sampleWorkoutSession({
      exercises: [sampleExercise({ id: "a" }), sampleExercise({ id: "b" })],
    });
    const done = markAllExercisesCompleted(session, NOW);
    expect(countCompletedExercises(done)).toBe(2);
  });

  it("finds the in-progress session for a plan and date", () => {
    const completed = sampleWorkoutSession({ id: "done" });
    const live = sampleWorkoutSession({ id: "live", completedAtIso: undefined });
    const found = findSessionForPlanDate([completed, live], PLAN_ID, "2026-05-26");
    expect(found?.id).toBe("live");
  });

  it("resolves start HH:MM from startedAtIso then completedAtIso", () => {
    const withStart = sampleWorkoutSession({
      startedAtIso: new Date(2026, 4, 26, 6, 30).toISOString(),
    });
    expect(resolveSessionStartHHMM(withStart)).toBe("06:30");
    const legacy = sampleWorkoutSession({
      startedAtIso: undefined,
      completedAtIso: new Date(2026, 4, 26, 18, 5).toISOString(),
    });
    expect(resolveSessionStartHHMM(legacy)).toBe("18:05");
  });

  it("excludes in-progress sessions from week summary and occurrence completion", () => {
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    const inProgress = sampleWorkoutSession({ date: "2026-05-25", completedAtIso: undefined });
    expect(buildWorkoutWeekSummary([inProgress], "2026-05-26").count).toBe(0);
    expect(isWorkoutOccurrenceComplete(plan, "2026-05-25", "b1", [inProgress])).toBe(false);
  });

  it("patches exercise fields without emptying the name", () => {
    const session = sampleWorkoutSession({
      exercises: [sampleExercise({ id: "a", sets: 3, notes: "pause" })],
    });
    const patched = updateSessionExercise(session, "a", { sets: 4, name: "  ", notes: undefined });
    expect(patched.exercises[0]?.sets).toBe(4);
    expect(patched.exercises[0]?.name).toBe("Bench press");
    expect(patched.exercises[0]?.notes).toBeUndefined();
    expect(session.exercises[0]?.sets).toBe(3);

    const unnamed = updateSessionExercise(
      sampleWorkoutSession({ exercises: [sampleExercise({ id: "a", name: "" })] }),
      "a",
      { name: "   " }
    );
    expect(unnamed.exercises[0]?.name).toBe(FALLBACK_EXERCISE_NAME);
  });

  it("adds and refuses to remove the last exercise", () => {
    const session = sampleWorkoutSession();
    const withExtra = addSessionExercise(session);
    expect(withExtra.exercises).toHaveLength(2);
    expect(withExtra.exercises[1]?.name).toBe(DEFAULT_ADDED_EXERCISE_NAME);
    const extraId = withExtra.exercises[1]?.id ?? "";
    expect(removeSessionExercise(withExtra, extraId).exercises).toHaveLength(1);
    expect(removeSessionExercise(session, EXERCISE_ID).exercises).toHaveLength(1);
  });

  it("finishes a partial session and marks all complete as the retro path", () => {
    const session = sampleWorkoutSession({
      completedAtIso: undefined,
      exercises: [sampleExercise({ id: "a" }), sampleExercise({ id: "b" })],
    });
    const finished = finishWorkoutSession(session, NOW);
    expect(finished.completedAtIso).toBe(NOW);
    expect(countCompletedExercises(finished)).toBe(0);

    const retro = markAllExercisesCompletedAndFinish(session, NOW);
    expect(retro.completedAtIso).toBe(NOW);
    expect(countCompletedExercises(retro)).toBe(2);
  });

  it("sets start time and duration from local HH:MM", () => {
    const session = sampleWorkoutSession({ startedAtIso: undefined, durationMinutes: undefined });
    const withStart = setSessionStartHHMM(session, "06:30");
    expect(resolveSessionStartHHMM(withStart)).toBe("06:30");
    expect(setSessionStartHHMM(withStart, "").startedAtIso).toBeUndefined();

    const withDuration = setSessionDurationMinutes(session, 45);
    expect(withDuration.durationMinutes).toBe(45);
    expect(setSessionDurationMinutes(withDuration, undefined).durationMinutes).toBeUndefined();
  });

  it("round-trips combineDateTimeToIso with resolveSessionStartHHMM", () => {
    const iso = combineDateTimeToIso("2026-05-26", "06:30");
    expect(iso).toBeDefined();
    expect(
      resolveSessionStartHHMM(sampleWorkoutSession({ startedAtIso: iso, completedAtIso: undefined }))
    ).toBe("06:30");
    expect(combineDateTimeToIso("not-a-date", "06:30")).toBeUndefined();
    expect(combineDateTimeToIso("2026-05-26", "25:00")).toBeUndefined();
  });

  it("lists scheduled plans without a completed session for the live logger", () => {
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    expect(plansForLiveLogger([plan], [], "2026-05-25")).toHaveLength(1);
    expect(
      plansForLiveLogger(
        [plan],
        [sampleWorkoutSession({ date: "2026-05-25", completedAtIso: undefined })],
        "2026-05-25"
      )
    ).toHaveLength(1);
    expect(
      plansForLiveLogger([plan], [sampleWorkoutSession({ date: "2026-05-25" })], "2026-05-25")
    ).toHaveLength(0);
  });

  it("seeds a live session from a plan with a stable id and scheduled start", () => {
    const liveId = "44444444-4444-4444-8444-444444444444";
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    const live = createLiveSessionFromPlan(plan, "2026-05-25", NOW, liveId);
    expect(live.id).toBe(liveId);
    expect(live.completedAtIso).toBeUndefined();
    expect(live.planId).toBe(PLAN_ID);
    expect(live.durationMinutes).toBe(60);
    expect(resolveSessionStartHHMM(live)).toBeUndefined();
    expect(live.exercises[0]?.sourceExerciseId).toBe(EXERCISE_ID);
    expect(live.exercises[0]?.name).toBe("Bench press");
  });
});

describe("dashboard workout loggers", () => {
  const LIVE_ID = "44444444-4444-4444-8444-444444444444";
  const mondayPlan = () =>
    samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });

  it("lists plan exercises when there is no session yet", () => {
    const loggers = buildDashboardWorkoutLoggers([mondayPlan()], [], "2026-05-25");
    expect(loggers).toHaveLength(1);
    expect(loggers[0]?.planId).toBe(PLAN_ID);
    expect(loggers[0]?.progressLabel).toBe("0/1");
    expect(loggers[0]?.exercises[0]).toEqual({
      exerciseId: EXERCISE_ID,
      name: "Bench press",
      weight: 135,
      completed: false,
    });
  });

  it("uses the in-progress session exercises and counts completions", () => {
    const plan = mondayPlan();
    const live = createLiveSessionFromPlan(plan, "2026-05-25", NOW, LIVE_ID);
    const toggled = toggleExerciseCompleted(live, live.exercises[0]!.id, NOW);
    const loggers = buildDashboardWorkoutLoggers([plan], [toggled], "2026-05-25");
    expect(loggers).toHaveLength(1);
    expect(loggers[0]?.progressLabel).toBe("1/1");
    expect(loggers[0]?.exercises[0]?.exerciseId).toBe(toggled.exercises[0]?.id);
    expect(loggers[0]?.exercises[0]?.completed).toBe(true);
  });

  it("omits a plan once its session is finished", () => {
    const plan = mondayPlan();
    const done = sampleWorkoutSession({ date: "2026-05-25" });
    expect(buildDashboardWorkoutLoggers([plan], [done], "2026-05-25")).toEqual([]);
  });

  it("resolves session exercise ids from the plan sourceExerciseId", () => {
    const live = createLiveSessionFromPlan(mondayPlan(), "2026-05-25", NOW, LIVE_ID);
    expect(resolveSessionExerciseId(live, live.exercises[0]!.id)).toBe(live.exercises[0]?.id);
    expect(resolveSessionExerciseId(live, EXERCISE_ID)).toBe(live.exercises[0]?.id);
    expect(resolveSessionExerciseId(live, "missing")).toBeUndefined();
  });

  it("reuses an in-progress session and refuses to mutate a completed one", () => {
    const plan = mondayPlan();
    const live = createLiveSessionFromPlan(plan, "2026-05-25", NOW, LIVE_ID);
    expect(ensureLiveSessionForPlan(plan, [live], "2026-05-25", NOW, "new-id")?.id).toBe(LIVE_ID);

    const done = sampleWorkoutSession({ date: "2026-05-25" });
    expect(ensureLiveSessionForPlan(plan, [done], "2026-05-25", NOW, "new-id")).toBeUndefined();

    const seeded = ensureLiveSessionForPlan(plan, [], "2026-05-25", NOW, "new-id");
    expect(seeded?.id).toBe("new-id");
    expect(seeded?.completedAtIso).toBeUndefined();
  });

  it("toggles a plan exercise by creating an in-progress session, not finishing it", () => {
    const plan = mondayPlan();
    const next = dashboardToggleExercise(plan, [], EXERCISE_ID, "2026-05-25", NOW, LIVE_ID);
    expect(next?.id).toBe(LIVE_ID);
    expect(next?.completedAtIso).toBeUndefined();
    expect(countCompletedExercises(next!)).toBe(1);
    expect(isWorkoutOccurrenceComplete(plan, "2026-05-25", "b1", [next!])).toBe(false);
  });

  it("sets weight on first dashboard edit without completing the session", () => {
    const plan = mondayPlan();
    const next = dashboardSetExerciseWeight(
      plan,
      [],
      EXERCISE_ID,
      155,
      "2026-05-25",
      NOW,
      LIVE_ID
    );
    expect(next?.completedAtIso).toBeUndefined();
    expect(next?.exercises[0]?.weight).toBe(155);
    expect(next?.exercises[0]?.sourceExerciseId).toBe(EXERCISE_ID);
  });
});

describe("workout scheduling", () => {
  it("treats plan without blocks as not schedulable", () => {
    expect(isPlanSchedulable(samplePlan())).toBe(false);
  });

  it("expands occurrences for active weekday", () => {
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    expect(isPlanSchedulable(plan)).toBe(true);
    const occurrences = expandWorkoutOccurrencesForDate([plan], "2026-05-25");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.blockId).toBe("b1");
  });

  it("matches session to scheduled occurrence by plan and date", () => {
    const plan = samplePlan();
    const session = sampleWorkoutSession();
    expect(matchSessionToScheduledOccurrence(session, plan, "2026-05-26")).toBe(true);
    expect(matchSessionToScheduledOccurrence(session, plan, "2026-05-25")).toBe(false);
  });

  it("reports completed and missed day status", () => {
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    const sessions = [sampleWorkoutSession({ date: "2026-05-25" })];
    expect(buildWorkoutDayStatus(plan, "2026-05-25", sessions)).toBe("completed");
    expect(buildWorkoutDayStatus(plan, "2026-05-25", [], { todayKey: "2026-05-26" })).toBe("missed");
    expect(isWorkoutOccurrenceComplete(plan, "2026-05-25", "b1", sessions)).toBe(true);
  });

  it("builds week schedule summary with adherence", () => {
    const plan = samplePlan({
      schedule: {
        mon: [{ id: "b1", startTime: "06:00", minutes: 60 }],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
    });
    const summary = buildWorkoutWeekScheduleSummary(
      [plan],
      [sampleWorkoutSession({ date: "2026-05-25" })],
      "2026-05-26"
    );
    expect(summary.scheduledCount).toBeGreaterThanOrEqual(1);
    expect(summary.completedScheduledCount).toBeGreaterThanOrEqual(1);
    expect(summary.adherenceRate).not.toBeNull();
    expect(buildWorkoutWeekSummary([], "2026-05-26").count).toBe(0);
  });
});

describe("normalizeFitnessFocus", () => {
  it("upgrades the legacy { date, planId } shape to a workout focus", () => {
    expect(normalizeFitnessFocus({ date: "2026-08-18", planId: PLAN_ID })).toEqual({
      kind: "workout",
      date: "2026-08-18",
      planId: PLAN_ID,
    });
  });

  it("passes through workout and supplement unions", () => {
    expect(
      normalizeFitnessFocus({ kind: "workout", date: "2026-08-18", planId: PLAN_ID })
    ).toEqual({ kind: "workout", date: "2026-08-18", planId: PLAN_ID });
    expect(
      normalizeFitnessFocus({
        kind: "supplement",
        date: "2026-08-18",
        protocolId: PLAN_ID,
      })
    ).toEqual({
      kind: "supplement",
      date: "2026-08-18",
      protocolId: PLAN_ID,
    });
  });

  it("returns undefined for empty input", () => {
    expect(normalizeFitnessFocus(undefined)).toBeUndefined();
  });
});
