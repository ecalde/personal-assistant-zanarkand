import { describe, expect, it } from "vitest";
import type { AppPayload, WorkoutPlan } from "./model";
import {
  cleanupInvalidWorkoutScheduleSeries,
  formatWorkoutScheduleSeriesLabel,
  getWorkoutPlanSeriesDateRange,
  isWorkoutPlanActiveOnDate,
  isValidWorkoutScheduleSeries,
  normalizeWorkoutScheduleSeries,
} from "./workoutSeries";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-05-26T12:00:00.000Z";

function makePlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Push A",
    exercises: [{ id: "ex1", name: "Bench press" }],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("normalizeWorkoutScheduleSeries", () => {
  it("accepts valid modes", () => {
    expect(normalizeWorkoutScheduleSeries({ mode: "single_day", singleDate: "2026-07-04" })).toEqual({
      mode: "single_day",
      singleDate: "2026-07-04",
    });
  });

  it("rejects unknown keys", () => {
    expect(normalizeWorkoutScheduleSeries({ mode: "indefinite", seriesId: "x" })).toBeUndefined();
  });
});

describe("isWorkoutPlanActiveOnDate", () => {
  it("treats omitted scheduleSeries as always active", () => {
    expect(isWorkoutPlanActiveOnDate(makePlan(), "2026-06-15")).toBe(true);
  });

  it("respects date_range bounds", () => {
    const plan = makePlan({
      scheduleSeries: { mode: "date_range", startDate: "2026-06-01", endDate: "2026-06-30" },
    });
    expect(isWorkoutPlanActiveOnDate(plan, "2026-05-31")).toBe(false);
    expect(isWorkoutPlanActiveOnDate(plan, "2026-06-15")).toBe(true);
  });

  it("returns false when scheduleSeries is invalid", () => {
    const plan = makePlan({
      scheduleSeries: { mode: "date_range", startDate: "bad", endDate: "2026-06-30" } as never,
    });
    expect(isWorkoutPlanActiveOnDate(plan, "2026-06-15")).toBe(false);
  });
});

describe("getWorkoutPlanSeriesDateRange", () => {
  it("returns unbounded when series omitted", () => {
    expect(getWorkoutPlanSeriesDateRange(makePlan())).toEqual({ kind: "unbounded" });
  });
});

describe("formatWorkoutScheduleSeriesLabel", () => {
  it("labels indefinite omission", () => {
    expect(formatWorkoutScheduleSeriesLabel(makePlan())).toBe("Scheduled indefinitely");
  });

  it("labels date range", () => {
    const plan = makePlan({
      scheduleSeries: { mode: "date_range", startDate: "2026-06-01", endDate: "2026-08-31" },
    });
    expect(formatWorkoutScheduleSeriesLabel(plan)).toMatch(/Scheduled.*Jun.*2026.*Aug.*2026/);
  });
});

describe("cleanupInvalidWorkoutScheduleSeries", () => {
  it("strips invalid series from plans", () => {
    const payload: AppPayload = {
      skills: [],
      sessions: [],
      overrides: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [
        makePlan({
          scheduleSeries: { mode: "weekly" } as never,
        }),
      ],
      workoutSessions: [],
      focusFeedback: [],
    };

    const cleaned = cleanupInvalidWorkoutScheduleSeries(payload);
    expect(cleaned.workoutPlans[0].scheduleSeries).toBeUndefined();
  });

  it("returns same payload when unchanged", () => {
    const payload: AppPayload = {
      skills: [],
      sessions: [],
      overrides: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [makePlan()],
      workoutSessions: [],
      focusFeedback: [],
    };
    expect(cleanupInvalidWorkoutScheduleSeries(payload)).toBe(payload);
  });
});

describe("isValidWorkoutScheduleSeries", () => {
  it("delegates to skill series validation", () => {
    expect(isValidWorkoutScheduleSeries({ mode: "indefinite" })).toBe(true);
  });
});
