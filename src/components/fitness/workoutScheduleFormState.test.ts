import { describe, expect, it } from "vitest";
import type { WorkoutScheduleSeries } from "../../core/model";
import {
  emptyWorkoutScheduleFormState,
  validateWorkoutScheduleForm,
  workoutScheduleFormFromSeries,
  workoutScheduleSeriesEqual,
  workoutScheduleSeriesFromForm,
} from "./workoutScheduleFormState";

describe("workoutScheduleFormFromSeries", () => {
  it("returns indefinite empty form when series is omitted", () => {
    expect(workoutScheduleFormFromSeries(undefined)).toEqual(emptyWorkoutScheduleFormState());
  });

  it("maps open-ended indefinite startDate to date_range with empty end", () => {
    expect(
      workoutScheduleFormFromSeries({
        mode: "indefinite",
        startDate: "2026-06-01",
      })
    ).toEqual({
      mode: "date_range",
      startDate: "2026-06-01",
      endDate: "",
      singleDate: "",
    });
  });

  it("populates date_range fields", () => {
    expect(
      workoutScheduleFormFromSeries({
        mode: "date_range",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      })
    ).toEqual({
      mode: "date_range",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      singleDate: "",
    });
  });
});

describe("workoutScheduleSeriesFromForm", () => {
  it("returns undefined for indefinite (legacy omit)", () => {
    expect(workoutScheduleSeriesFromForm(emptyWorkoutScheduleFormState())).toBeUndefined();
  });

  it("persists date_range with start and no end as open-ended indefinite", () => {
    expect(
      workoutScheduleSeriesFromForm({
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "",
        singleDate: "",
      })
    ).toEqual({
      mode: "indefinite",
      startDate: "2026-06-01",
    });
  });

  it("builds bounded date_range when both dates are set", () => {
    expect(
      workoutScheduleSeriesFromForm({
        mode: "date_range",
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        singleDate: "",
      })
    ).toEqual({
      mode: "date_range",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
  });
});

describe("validateWorkoutScheduleForm", () => {
  it("accepts date_range with start and no end", () => {
    expect(
      validateWorkoutScheduleForm({
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "",
        singleDate: "",
      })
    ).toBeNull();
  });

  it("still requires a start date for date_range", () => {
    expect(
      validateWorkoutScheduleForm({
        mode: "date_range",
        startDate: "",
        endDate: "2026-06-30",
        singleDate: "",
      })
    ).toBe("Start date is required.");
  });

  it("rejects end date before start date", () => {
    expect(
      validateWorkoutScheduleForm({
        mode: "date_range",
        startDate: "2026-08-01",
        endDate: "2026-06-01",
        singleDate: "",
      })
    ).toBe("End date must be on or after start date.");
  });
});

describe("open-ended date range round-trip", () => {
  it("round-trips start-only date range through the form", () => {
    const series: WorkoutScheduleSeries = {
      mode: "indefinite",
      startDate: "2026-06-01",
    };
    const form = workoutScheduleFormFromSeries(series);
    expect(form.mode).toBe("date_range");
    expect(validateWorkoutScheduleForm(form)).toBeNull();
    expect(workoutScheduleSeriesFromForm(form)).toEqual(series);
    expect(workoutScheduleSeriesEqual(series, workoutScheduleSeriesFromForm(form))).toBe(true);
  });
});
