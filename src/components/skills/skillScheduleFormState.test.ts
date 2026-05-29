import { describe, expect, it } from "vitest";
import type { SkillScheduleSeries } from "../../core/model";
import {
  emptySkillScheduleFormState,
  skillScheduleFormFromSeries,
  skillScheduleSeriesEqual,
  skillScheduleSeriesFromForm,
  validateSkillScheduleForm,
} from "./skillScheduleFormState";

describe("skillScheduleFormFromSeries", () => {
  it("returns indefinite empty form when series is omitted", () => {
    expect(skillScheduleFormFromSeries(undefined)).toEqual(emptySkillScheduleFormState());
  });

  it("populates date_range fields", () => {
    expect(
      skillScheduleFormFromSeries({
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

  it("populates single_day fields", () => {
    expect(
      skillScheduleFormFromSeries({
        mode: "single_day",
        singleDate: "2026-05-10",
      })
    ).toEqual({
      mode: "single_day",
      startDate: "",
      endDate: "",
      singleDate: "2026-05-10",
    });
  });

  it("does not preserve hidden startDate on indefinite series", () => {
    expect(
      skillScheduleFormFromSeries({
        mode: "indefinite",
        startDate: "2026-01-01",
      })
    ).toEqual({
      mode: "indefinite",
      startDate: "",
      endDate: "",
      singleDate: "",
    });
  });

  it("returns indefinite empty form for invalid series", () => {
    expect(
      skillScheduleFormFromSeries({
        mode: "date_range",
        startDate: "2026-08-01",
        endDate: "2026-06-01",
      } as SkillScheduleSeries)
    ).toEqual(emptySkillScheduleFormState());
  });
});

describe("skillScheduleSeriesFromForm", () => {
  it("returns undefined for indefinite (legacy omit)", () => {
    expect(skillScheduleSeriesFromForm(emptySkillScheduleFormState())).toBeUndefined();
  });

  it("builds date_range series", () => {
    expect(
      skillScheduleSeriesFromForm({
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

  it("builds single_day series", () => {
    expect(
      skillScheduleSeriesFromForm({
        mode: "single_day",
        startDate: "",
        endDate: "",
        singleDate: "2026-05-10",
      })
    ).toEqual({
      mode: "single_day",
      singleDate: "2026-05-10",
    });
  });
});

describe("validateSkillScheduleForm", () => {
  it("accepts indefinite without dates", () => {
    expect(validateSkillScheduleForm(emptySkillScheduleFormState())).toBeNull();
  });

  it("requires start and end dates for date_range", () => {
    expect(
      validateSkillScheduleForm({
        mode: "date_range",
        startDate: "",
        endDate: "2026-06-30",
        singleDate: "",
      })
    ).toBe("Start date is required.");
    expect(
      validateSkillScheduleForm({
        mode: "date_range",
        startDate: "2026-01-01",
        endDate: "",
        singleDate: "",
      })
    ).toBe("End date is required.");
  });

  it("rejects end date before start date", () => {
    expect(
      validateSkillScheduleForm({
        mode: "date_range",
        startDate: "2026-08-01",
        endDate: "2026-06-01",
        singleDate: "",
      })
    ).toBe("End date must be on or after start date.");
  });

  it("requires date for single_day", () => {
    expect(
      validateSkillScheduleForm({
        mode: "single_day",
        startDate: "",
        endDate: "",
        singleDate: "",
      })
    ).toBe("Date is required.");
  });

  it("rejects invalid calendar dates", () => {
    expect(
      validateSkillScheduleForm({
        mode: "single_day",
        startDate: "",
        endDate: "",
        singleDate: "2026-02-30",
      })
    ).toBe("Enter a valid date (YYYY-MM-DD).");
  });
});

describe("clearing to indefinite", () => {
  it("serializes indefinite form to undefined", () => {
    const fromRange = skillScheduleFormFromSeries({
      mode: "date_range",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
    const cleared = { ...fromRange, mode: "indefinite" as const, startDate: "", endDate: "", singleDate: "" };
    expect(skillScheduleSeriesFromForm(cleared)).toBeUndefined();
    expect(validateSkillScheduleForm(cleared)).toBeNull();
  });
});

describe("skillScheduleSeriesEqual", () => {
  it("treats omitted and indefinite form output as different normalized values", () => {
    expect(skillScheduleSeriesEqual(undefined, undefined)).toBe(true);
    expect(
      skillScheduleSeriesEqual(undefined, { mode: "indefinite" })
    ).toBe(false);
  });

  it("compares date_range by normalized shape", () => {
    const series: SkillScheduleSeries = {
      mode: "date_range",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    };
    expect(skillScheduleSeriesEqual(series, { ...series })).toBe(true);
  });
});
