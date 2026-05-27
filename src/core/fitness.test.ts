import { describe, expect, it } from "vitest";
import type { ExerciseEntry, WorkoutPlan, WorkoutSession } from "./model";
import {
  buildRecentSessions,
  buildWorkoutWeekSummary,
  copyExercisesFromPlan,
  createSessionDraftFromPlan,
  filterAndSortPlans,
  filterAndSortSessions,
  formatExerciseSummary,
  formatSessionDurationLabel,
  formatSessionHeadline,
  formatWorkoutFocus,
  planMatchesQuery,
  sessionMatchesQuery,
  sumSessionDurationMinutes,
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
  it("copies exercises with new ids", () => {
    const copied = copyExercisesFromPlan(samplePlan());
    expect(copied).toHaveLength(1);
    expect(copied[0]?.id).not.toBe(EXERCISE_ID);
    expect(copied[0]?.name).toBe("Bench press");
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
