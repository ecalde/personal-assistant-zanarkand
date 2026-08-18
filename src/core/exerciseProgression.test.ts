import { describe, expect, it } from "vitest";
import {
  buildExerciseProgressions,
  buildFrequencyChartLayout,
  buildWeightChartLayout,
  pickDefaultExerciseKey,
  type ExerciseProgression,
} from "./exerciseProgression";
import { collectRecentExerciseNames, normalizeExerciseName } from "./fitness";
import type { ExerciseEntry, WorkoutPlan, WorkoutSession } from "./model";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-05-26T12:00:00.000Z";

function sampleExercise(overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: "33333333-3333-4333-8333-333333333333",
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

function sampleSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    date: "2026-05-26",
    focus: "push",
    planId: PLAN_ID,
    exercises: [sampleExercise()],
    completedAtIso: NOW,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("normalizeExerciseName", () => {
  it("collapses case and whitespace", () => {
    expect(normalizeExerciseName("  Bench   Press ")).toBe("bench press");
  });
});

describe("collectRecentExerciseNames", () => {
  it("uses completed sessions first, then plan names as fallback", () => {
    const names = collectRecentExerciseNames(
      [samplePlan({ exercises: [sampleExercise({ name: "Overhead press" })] })],
      [sampleSession({ exercises: [sampleExercise({ name: "Incline press" })] })]
    );
    expect(names).toEqual(["Incline press", "Overhead press"]);
  });

  it("ignores in-progress sessions", () => {
    const names = collectRecentExerciseNames(
      [],
      [
        sampleSession({
          completedAtIso: undefined,
          exercises: [sampleExercise({ name: "Draft lift" })],
        }),
      ]
    );
    expect(names).toEqual([]);
  });

  it("dedupes by normalized name and honors limit", () => {
    const names = collectRecentExerciseNames(
      [samplePlan({ exercises: [sampleExercise({ name: "bench PRESS" })] })],
      [
        sampleSession({
          date: "2026-05-26",
          exercises: [sampleExercise({ name: "Bench press" })],
        }),
        sampleSession({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          date: "2026-05-19",
          exercises: [sampleExercise({ name: "Row" })],
        }),
      ],
      1
    );
    expect(names).toEqual(["Bench press"]);
  });
});

describe("buildExerciseProgressions", () => {
  it("groups completed entries by normalized name and records stats", () => {
    const sessions = [
      sampleSession({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-12",
        exercises: [sampleExercise({ name: "bench press", weight: 135 })],
      }),
      sampleSession({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        date: "2026-05-26",
        exercises: [sampleExercise({ name: "Bench Press", weight: 155 })],
      }),
    ];

    const [bench] = buildExerciseProgressions([], sessions);
    expect(bench?.key).toBe("bench press");
    expect(bench?.displayName).toBe("Bench Press");
    expect(bench?.weights).toEqual([
      { date: "2026-05-12", weight: 135 },
      { date: "2026-05-26", weight: 155 },
    ]);
    expect(bench?.firstLoggedDate).toBe("2026-05-12");
    expect(bench?.lastLoggedDate).toBe("2026-05-26");
    expect(bench?.completionCount).toBe(2);
    expect(bench?.personalRecord).toBe(155);
  });

  it("ignores in-progress sessions and plan-only names", () => {
    const plan = samplePlan({
      exercises: [sampleExercise({ name: "Cable fly" })],
    });
    const live = sampleSession({
      completedAtIso: undefined,
      exercises: [sampleExercise({ name: "Cable fly", weight: 40 })],
    });
    const done = sampleSession({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      date: "2026-05-19",
      exercises: [sampleExercise({ name: "Squat", weight: 185 })],
    });

    const progressions = buildExerciseProgressions([plan], [live, done]);
    expect(progressions.map((row) => row.key)).toEqual(["squat"]);
    expect(progressions[0]?.personalRecord).toBe(185);
  });

  it("keeps the max weight when the same exercise is logged twice on one date", () => {
    const session = sampleSession({
      exercises: [
        sampleExercise({ id: "e1", name: "Row", weight: 90 }),
        sampleExercise({ id: "e2", name: "Row", weight: 95 }),
      ],
    });
    const [row] = buildExerciseProgressions([], [session]);
    expect(row?.weights).toEqual([{ date: "2026-05-26", weight: 95 }]);
    expect(row?.completionCount).toBe(1);
  });

  it("counts completions without weight but omits them from the series", () => {
    const session = sampleSession({
      exercises: [sampleExercise({ name: "Plank", weight: undefined })],
    });
    const [plank] = buildExerciseProgressions([], [session]);
    expect(plank?.completionCount).toBe(1);
    expect(plank?.weights).toEqual([]);
    expect(plank?.personalRecord).toBeUndefined();
  });

  it("fills weekly frequency including empty weeks between first and last", () => {
    const sessions = [
      sampleSession({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-12",
        exercises: [sampleExercise({ name: "Squat", weight: 185 })],
      }),
      sampleSession({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        date: "2026-05-26",
        exercises: [sampleExercise({ name: "Squat", weight: 195 })],
      }),
    ];
    const [squat] = buildExerciseProgressions([], sessions);
    expect(squat?.frequencyByWeek.map((bar) => [bar.weekStart, bar.count])).toEqual([
      ["2026-05-11", 1],
      ["2026-05-18", 0],
      ["2026-05-25", 1],
    ]);
  });
});

describe("chart layouts", () => {
  it("returns empty weight geometry when there are no points", () => {
    const layout = buildWeightChartLayout([], undefined);
    expect(layout.dots).toEqual([]);
    expect(layout.linePath).toBeUndefined();
    expect(layout.areaPath).toBeUndefined();
  });

  it("centers a single weight point and marks the PR", () => {
    const layout = buildWeightChartLayout([{ date: "2026-05-26", weight: 135 }], 135);
    expect(layout.dots).toHaveLength(1);
    expect(layout.dots[0]?.isPr).toBe(true);
    expect(layout.dots[0]?.x).toBeCloseTo(640 / 2 + (44 - 16) / 2, 5);
    expect(layout.linePath).toBeUndefined();
  });

  it("builds a line plus area for two or more points", () => {
    const layout = buildWeightChartLayout(
      [
        { date: "2026-05-12", weight: 135 },
        { date: "2026-05-26", weight: 155 },
      ],
      155
    );
    expect(layout.linePath?.startsWith("M")).toBe(true);
    expect(layout.areaPath?.endsWith("Z")).toBe(true);
    expect(layout.dots.map((dot) => dot.isPr)).toEqual([false, true]);
    expect(layout.dots[1]!.x).toBeGreaterThan(layout.dots[0]!.x);
    expect(layout.dots[1]!.y).toBeLessThan(layout.dots[0]!.y);
  });

  it("scales frequency bars by count", () => {
    const layout = buildFrequencyChartLayout([
      { weekStart: "2026-05-11", count: 1 },
      { weekStart: "2026-05-18", count: 0 },
      { weekStart: "2026-05-25", count: 2 },
    ]);
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars[1]?.height).toBe(0);
    expect(layout.bars[2]!.height).toBeGreaterThan(layout.bars[0]!.height);
  });
});

describe("pickDefaultExerciseKey", () => {
  it("prefers the first exercise that has weight points", () => {
    const cardio: ExerciseProgression = {
      key: "plank",
      displayName: "Plank",
      weights: [],
      firstLoggedDate: "2026-05-26",
      lastLoggedDate: "2026-05-26",
      completionCount: 1,
      personalRecord: undefined,
      frequencyByWeek: [{ weekStart: "2026-05-25", count: 1 }],
    };
    const lift: ExerciseProgression = {
      key: "squat",
      displayName: "Squat",
      weights: [{ date: "2026-05-26", weight: 185 }],
      firstLoggedDate: "2026-05-26",
      lastLoggedDate: "2026-05-26",
      completionCount: 1,
      personalRecord: 185,
      frequencyByWeek: [{ weekStart: "2026-05-25", count: 1 }],
    };
    expect(pickDefaultExerciseKey([cardio, lift])).toBe("squat");
    expect(pickDefaultExerciseKey([])).toBeUndefined();
  });
});
