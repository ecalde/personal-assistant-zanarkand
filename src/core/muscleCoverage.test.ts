import { describe, expect, it } from "vitest";
import {
  buildMuscleMonthHeatmap,
  buildMuscleWeekSnapshot,
  heatmapPercent,
  listMuscleMonthKeys,
  listMuscleWeekSnapshots,
  muscleStatusFromCounts,
  weekStartKeyFromDateKey,
} from "./muscleCoverage";
import type { ExerciseEntry, WorkoutPlan, WorkoutSession } from "./model";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const EXERCISE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-05-26T12:00:00.000Z";

function sampleExercise(overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: EXERCISE_ID,
    name: "Bicep curl",
    sets: 3,
    reps: 10,
    ...overrides,
  };
}

function emptySchedule() {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function samplePlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Arms",
    focus: "pull",
    exercises: [sampleExercise()],
    schedule: {
      ...emptySchedule(),
      tue: [{ id: "b1", startTime: "18:00", minutes: 45 }],
    },
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: SESSION_ID,
    date: "2026-05-26",
    focus: "pull",
    planId: PLAN_ID,
    exercises: [sampleExercise()],
    completedAtIso: NOW,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("weekStartKeyFromDateKey", () => {
  it("returns Monday for a Tuesday", () => {
    expect(weekStartKeyFromDateKey("2026-05-26")).toBe("2026-05-25");
  });
});

describe("buildMuscleWeekSnapshot", () => {
  it("schedules biceps from the weekly plan and completes them from a finished session", () => {
    const snapshot = buildMuscleWeekSnapshot(
      [samplePlan()],
      [sampleSession()],
      "2026-05-25"
    );
    expect(snapshot?.byMuscle.biceps_brachii).toEqual({
      scheduledCount: 1,
      completedCount: 1,
    });
    expect(snapshot?.byMuscle.triceps_brachii).toBeUndefined();
    expect(muscleStatusFromCounts(snapshot?.byMuscle.biceps_brachii)).toBe("completed");
  });

  it("keeps scheduled-only muscles distinct from completed", () => {
    const snapshot = buildMuscleWeekSnapshot([samplePlan()], [], "2026-05-25");
    expect(snapshot?.byMuscle.biceps_brachii).toEqual({
      scheduledCount: 1,
      completedCount: 0,
    });
    expect(muscleStatusFromCounts(snapshot?.byMuscle.biceps_brachii)).toBe("scheduled");
  });

  it("counts a live tap as completed for the week without finishing the session", () => {
    const snapshot = buildMuscleWeekSnapshot(
      [samplePlan()],
      [
        sampleSession({
          completedAtIso: undefined,
          exercises: [sampleExercise({ completedAtIso: NOW })],
        }),
      ],
      "2026-05-25"
    );
    expect(snapshot?.byMuscle.biceps_brachii?.completedCount).toBe(1);
  });

  it("ignores unchecked in-progress exercises", () => {
    const snapshot = buildMuscleWeekSnapshot(
      [samplePlan()],
      [
        sampleSession({
          completedAtIso: undefined,
          exercises: [sampleExercise()],
        }),
      ],
      "2026-05-25"
    );
    expect(snapshot?.byMuscle.biceps_brachii?.completedCount).toBe(0);
  });

  it("does not carry last week's completed muscles into the next week", () => {
    const snapshot = buildMuscleWeekSnapshot(
      [samplePlan()],
      [sampleSession()],
      "2026-06-01"
    );
    expect(snapshot?.byMuscle.biceps_brachii).toEqual({
      scheduledCount: 1,
      completedCount: 0,
    });
  });

  it("does not paint pecs when the plan is only curls", () => {
    const snapshot = buildMuscleWeekSnapshot(
      [samplePlan()],
      [sampleSession()],
      "2026-05-25"
    );
    expect(snapshot?.byMuscle.pectoralis_upper).toBeUndefined();
    expect(snapshot?.byMuscle.pectoralis_lower).toBeUndefined();
  });
});

describe("listMuscleWeekSnapshots", () => {
  it("always includes the current week and keeps older completed weeks", () => {
    const snapshots = listMuscleWeekSnapshots(
      [samplePlan()],
      [sampleSession({ date: "2026-05-12" })],
      "2026-05-26"
    );
    expect(snapshots.map((row) => row.weekStart)).toEqual(["2026-05-25", "2026-05-11"]);
    expect(snapshots[1]?.byMuscle.biceps_brachii?.completedCount).toBe(1);
  });
});

describe("buildMuscleMonthHeatmap", () => {
  it("uses completed/scheduled as the percent when the muscle was planned", () => {
    const heatmap = buildMuscleMonthHeatmap(
      [samplePlan()],
      [
        sampleSession({ date: "2026-05-05" }),
        sampleSession({
          id: "44444444-4444-4444-8444-444444444444",
          date: "2026-05-12",
        }),
      ],
      "2026-05"
    );
    const biceps = heatmap?.byMuscle.biceps_brachii;
    expect(biceps?.scheduledCount).toBe(4);
    expect(biceps?.completedCount).toBe(2);
    expect(biceps?.percent).toBe(0.5);
  });

  it("ignores in-progress sessions in the monthly completed count", () => {
    const heatmap = buildMuscleMonthHeatmap(
      [],
      [sampleSession({ completedAtIso: undefined, exercises: [sampleExercise({ completedAtIso: NOW })] })],
      "2026-05"
    );
    expect(heatmap?.byMuscle.biceps_brachii).toBeUndefined();
  });
});

describe("heatmapPercent", () => {
  it("caps adherence at 100% and falls back to relative intensity", () => {
    expect(
      heatmapPercent({ scheduledCount: 2, completedCount: 4 }, "adherence", 4)
    ).toBe(1);
    expect(
      heatmapPercent({ scheduledCount: 0, completedCount: 2 }, "relative", 4)
    ).toBe(0.5);
  });
});

describe("listMuscleMonthKeys", () => {
  it("includes the current month and months with sessions", () => {
    expect(listMuscleMonthKeys([sampleSession({ date: "2026-04-30" })], "2026-05-26")).toEqual([
      "2026-05",
      "2026-04",
    ]);
  });
});
