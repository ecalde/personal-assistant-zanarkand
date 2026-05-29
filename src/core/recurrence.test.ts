import { describe, expect, it } from "vitest";
import {
  applyRecurrenceExceptions,
  expandRecurrenceInstances,
  formatRecurrenceSummary,
  getRecurrenceDateKeys,
  isDateInRecurrenceRange,
  isValidRecurrenceRule,
  normalizeRecurrenceRule,
  splitRecurrenceSeriesAtDate,
  type RecurrenceInstance,
  type RecurrenceRule,
} from "./recurrence";

function makeRule(overrides: Partial<RecurrenceRule> & { anchorDate: string }): RecurrenceRule {
  return { ...overrides };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe("expandRecurrenceInstances", () => {
  it("returns empty when range start is after end", () => {
    const rule = makeRule({ anchorDate: "2026-05-25", frequency: "daily" });
    expect(expandRecurrenceInstances(rule, "2026-05-31", "2026-05-01")).toEqual([]);
  });

  it("handles a one-time rule in and out of range", () => {
    const rule = makeRule({ anchorDate: "2026-05-25" });
    const inRange = expandRecurrenceInstances(rule, "2026-05-01", "2026-05-31");
    expect(inRange).toHaveLength(1);
    expect(inRange[0]).toMatchObject({ date: "2026-05-25", occurrenceIndex: 1, isException: false });

    expect(expandRecurrenceInstances(rule, "2026-06-01", "2026-06-30")).toEqual([]);
  });

  it("expands daily every day until an end date", () => {
    const rule = makeRule({
      anchorDate: "2026-05-25",
      frequency: "daily",
      end: { kind: "onDate", endDate: "2026-05-27" },
    });
    expect(getRecurrenceDateKeys(rule, "2026-05-01", "2026-06-30")).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
    ]);
  });

  it("expands daily every 2 days", () => {
    const rule = makeRule({
      anchorDate: "2026-05-25",
      frequency: "daily",
      interval: 2,
      end: { kind: "onDate", endDate: "2026-06-01" },
    });
    expect(getRecurrenceDateKeys(rule, "2026-05-01", "2026-06-30")).toEqual([
      "2026-05-25",
      "2026-05-27",
      "2026-05-29",
      "2026-05-31",
    ]);
  });

  it("expands weekly on a single weekday (tennis every Wednesday)", () => {
    const rule = makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] });
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-01-31")).toEqual([
      "2026-01-07",
      "2026-01-14",
      "2026-01-21",
      "2026-01-28",
    ]);
  });

  it("expands weekly on every weekday (workout Mon-Fri)", () => {
    const rule = makeRule({
      anchorDate: "2026-05-25",
      frequency: "weekly",
      byWeekdays: ["mon", "tue", "wed", "thu", "fri"],
    });
    expect(getRecurrenceDateKeys(rule, "2026-05-25", "2026-05-31")).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
    ]);
  });

  it("expands biweekly (interval 2) aligned to the anchor week", () => {
    const rule = makeRule({
      anchorDate: "2026-01-07",
      frequency: "weekly",
      interval: 2,
      byWeekdays: ["wed"],
    });
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-02-28")).toEqual([
      "2026-01-07",
      "2026-01-21",
      "2026-02-04",
      "2026-02-18",
    ]);
  });

  it("expands weekly until December and stops at the end date", () => {
    const rule = makeRule({
      anchorDate: "2026-01-01", // Thursday
      frequency: "weekly",
      byWeekdays: ["thu"],
      end: { kind: "onDate", endDate: "2026-12-31" },
    });
    const keys = getRecurrenceDateKeys(rule, "2026-01-01", "2027-12-31");
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.every((key) => key <= "2026-12-31")).toBe(true);
    expect(keys.every((key) => key < "2027-01-01")).toBe(true);
  });

  it("expands monthly by the anchor day of month", () => {
    const rule = makeRule({ anchorDate: "2026-01-15", frequency: "monthly" });
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("clamps monthly day-of-month to the end of shorter months", () => {
    const rule = makeRule({ anchorDate: "2026-01-31", frequency: "monthly" });
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("honors an explicit dayOfMonth override", () => {
    const rule = makeRule({ anchorDate: "2026-01-10", frequency: "monthly", dayOfMonth: 31 });
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("expands a yearly Feb 29 birthday across leap and non-leap years", () => {
    const rule = makeRule({ anchorDate: "2024-02-29", frequency: "yearly" });
    expect(getRecurrenceDateKeys(rule, "2024-01-01", "2028-12-31")).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("stops after maxOccurrences", () => {
    const rule = makeRule({
      anchorDate: "2026-05-25",
      frequency: "daily",
      end: { kind: "afterCount", maxOccurrences: 3 },
    });
    expect(getRecurrenceDateKeys(rule, "2026-05-01", "2026-06-30")).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
    ]);
  });

  it("counts skipped dates toward maxOccurrences", () => {
    const rule = makeRule({
      anchorDate: "2026-05-25",
      frequency: "daily",
      end: { kind: "afterCount", maxOccurrences: 3 },
      exceptions: [{ kind: "skip", date: "2026-05-26" }],
    });
    // The skipped May 26 still consumes a slot, so the series stops at May 27.
    expect(getRecurrenceDateKeys(rule, "2026-05-01", "2026-06-30")).toEqual([
      "2026-05-25",
      "2026-05-27",
    ]);
  });

  it("clips to the query range while preserving the series occurrence index", () => {
    const rule = makeRule({ anchorDate: "2026-01-15", frequency: "monthly" });
    const instances = expandRecurrenceInstances(rule, "2026-03-01", "2026-03-31");
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({ date: "2026-03-15", occurrenceIndex: 3 });
  });

  it("returns empty for invalid rules", () => {
    expect(
      expandRecurrenceInstances(makeRule({ anchorDate: "not-a-date", frequency: "daily" }), "2026-01-01", "2026-12-31")
    ).toEqual([]);
    expect(
      expandRecurrenceInstances(makeRule({ anchorDate: "2026-01-01", frequency: "weekly", byWeekdays: [] }), "2026-01-01", "2026-12-31")
    ).toEqual([]);
    expect(
      expandRecurrenceInstances(makeRule({ anchorDate: "2026-01-01", frequency: "daily", interval: 0 }), "2026-01-01", "2026-12-31")
    ).toEqual([]);
  });

  it("does not mutate the input rule", () => {
    const rule = deepFreeze(
      makeRule({
        anchorDate: "2026-01-07",
        frequency: "weekly",
        byWeekdays: ["wed"],
        exceptions: [{ kind: "skip", date: "2026-01-14" }],
      })
    );
    const before = JSON.stringify(rule);
    expandRecurrenceInstances(rule, "2026-01-01", "2026-03-31");
    expect(JSON.stringify(rule)).toBe(before);
  });
});

describe("isDateInRecurrenceRange", () => {
  it("matches recurring occurrences and rejects non-occurrences", () => {
    const rule = makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] });
    expect(isDateInRecurrenceRange(rule, "2026-01-14")).toBe(true);
    expect(isDateInRecurrenceRange(rule, "2026-01-15")).toBe(false);
  });

  it("returns false for a one-time rule outside its date", () => {
    const rule = makeRule({ anchorDate: "2026-05-25" });
    expect(isDateInRecurrenceRange(rule, "2026-05-25")).toBe(true);
    expect(isDateInRecurrenceRange(rule, "2026-05-26")).toBe(false);
  });

  it("respects skip and override exceptions", () => {
    const skipped = makeRule({
      anchorDate: "2026-01-07",
      frequency: "weekly",
      byWeekdays: ["wed"],
      exceptions: [{ kind: "skip", date: "2026-01-14" }],
    });
    expect(isDateInRecurrenceRange(skipped, "2026-01-14")).toBe(false);

    const overridden = makeRule({
      anchorDate: "2026-01-07",
      frequency: "weekly",
      byWeekdays: ["wed"],
      exceptions: [{ kind: "override", date: "2026-01-14", overrideDate: "2026-01-16" }],
    });
    expect(isDateInRecurrenceRange(overridden, "2026-01-14")).toBe(false);
    expect(isDateInRecurrenceRange(overridden, "2026-01-16")).toBe(true);
  });
});

describe("getRecurrenceDateKeys", () => {
  it("equals the dates of expandRecurrenceInstances in order", () => {
    const rule = makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed", "fri"] });
    const instances = expandRecurrenceInstances(rule, "2026-01-01", "2026-01-31");
    expect(getRecurrenceDateKeys(rule, "2026-01-01", "2026-01-31")).toEqual(
      instances.map((inst) => inst.date)
    );
  });
});

describe("applyRecurrenceExceptions", () => {
  const scheduled: RecurrenceInstance[] = [
    { date: "2026-01-07", occurrenceIndex: 1, isException: false },
    { date: "2026-01-14", occurrenceIndex: 2, isException: false },
    { date: "2026-01-21", occurrenceIndex: 3, isException: false },
  ];

  it("removes skipped instances", () => {
    const result = applyRecurrenceExceptions(scheduled, [{ kind: "skip", date: "2026-01-14" }]);
    expect(result.map((inst) => inst.date)).toEqual(["2026-01-07", "2026-01-21"]);
  });

  it("moves overridden instances and records the original date", () => {
    const result = applyRecurrenceExceptions(scheduled, [
      { kind: "override", date: "2026-01-14", overrideDate: "2026-01-16" },
    ]);
    expect(result[1]).toMatchObject({
      date: "2026-01-16",
      originalDate: "2026-01-14",
      occurrenceIndex: 2,
      isException: true,
    });
  });

  it("resolves duplicate exceptions for one date last-wins", () => {
    const skipWins = applyRecurrenceExceptions(scheduled, [
      { kind: "override", date: "2026-01-14", overrideDate: "2026-01-16" },
      { kind: "skip", date: "2026-01-14" },
    ]);
    expect(skipWins.map((inst) => inst.date)).toEqual(["2026-01-07", "2026-01-21"]);

    const overrideWins = applyRecurrenceExceptions(scheduled, [
      { kind: "skip", date: "2026-01-14" },
      { kind: "override", date: "2026-01-14", overrideDate: "2026-01-16" },
    ]);
    expect(overrideWins.map((inst) => inst.date)).toEqual([
      "2026-01-07",
      "2026-01-16",
      "2026-01-21",
    ]);
  });
});

describe("splitRecurrenceSeriesAtDate", () => {
  it("forks Wednesday into Friday from the split date without altering the past", () => {
    const tennis = makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] });
    const { beforeRule, afterRule } = splitRecurrenceSeriesAtDate(tennis, "2026-07-01", {
      anchorDate: "2026-07-03",
      frequency: "weekly",
      byWeekdays: ["fri"],
    });

    const beforeKeys = getRecurrenceDateKeys(beforeRule, "2026-01-01", "2026-12-31");
    const afterKeys = getRecurrenceDateKeys(afterRule, "2026-01-01", "2026-12-31");

    expect(beforeKeys[0]).toBe("2026-01-07");
    expect(beforeKeys.every((key) => key < "2026-07-01")).toBe(true);
    expect(afterKeys[0]).toBe("2026-07-03");
    expect(afterKeys.every((key) => key >= "2026-07-01")).toBe(true);
    // No date appears in both halves.
    expect(beforeKeys.some((key) => afterKeys.includes(key))).toBe(false);
  });

  it("partitions exceptions by the split date", () => {
    const rule = makeRule({
      anchorDate: "2026-01-07",
      frequency: "weekly",
      byWeekdays: ["wed"],
      exceptions: [
        { kind: "skip", date: "2026-03-04" },
        { kind: "skip", date: "2026-08-05" },
      ],
    });
    const { beforeRule, afterRule } = splitRecurrenceSeriesAtDate(rule, "2026-07-01", {
      anchorDate: "2026-07-03",
      frequency: "weekly",
      byWeekdays: ["fri"],
    });

    expect(beforeRule.exceptions).toEqual([{ kind: "skip", date: "2026-03-04" }]);
    expect(afterRule.exceptions).toEqual([{ kind: "skip", date: "2026-08-05" }]);
  });
});

describe("formatRecurrenceSummary", () => {
  it("describes one-time, daily, weekly, monthly, and yearly rules", () => {
    expect(formatRecurrenceSummary(makeRule({ anchorDate: "2026-05-25" }))).toBe("Does not repeat");
    expect(formatRecurrenceSummary(makeRule({ anchorDate: "2026-05-25", frequency: "daily" }))).toBe(
      "Every day"
    );
    expect(
      formatRecurrenceSummary(makeRule({ anchorDate: "2026-05-25", frequency: "daily", interval: 3 }))
    ).toBe("Every 3 days");
    expect(
      formatRecurrenceSummary(makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] }))
    ).toBe("Every Wednesday");
    expect(
      formatRecurrenceSummary(
        makeRule({ anchorDate: "2026-01-05", frequency: "weekly", byWeekdays: ["mon", "wed", "fri"] })
      )
    ).toBe("Weekly on Monday, Wednesday, Friday");
    expect(
      formatRecurrenceSummary(
        makeRule({ anchorDate: "2026-01-07", frequency: "weekly", interval: 2, byWeekdays: ["wed"] })
      )
    ).toBe("Every 2 weeks on Wednesday");
    expect(
      formatRecurrenceSummary(makeRule({ anchorDate: "2026-01-15", frequency: "monthly" }))
    ).toBe("Monthly on day 15");
    expect(
      formatRecurrenceSummary(makeRule({ anchorDate: "2024-02-29", frequency: "yearly" }))
    ).toBe("Annually on February 29");
  });

  it("appends until and count suffixes", () => {
    expect(
      formatRecurrenceSummary(
        makeRule({ anchorDate: "2026-05-25", frequency: "daily", end: { kind: "onDate", endDate: "2026-12-31" } })
      )
    ).toBe("Every day until 2026-12-31");
    expect(
      formatRecurrenceSummary(
        makeRule({ anchorDate: "2026-05-25", frequency: "daily", end: { kind: "afterCount", maxOccurrences: 5 } })
      )
    ).toBe("Every day (5 times)");
  });
});

describe("isValidRecurrenceRule", () => {
  it("accepts valid rules and rejects malformed ones", () => {
    expect(isValidRecurrenceRule(makeRule({ anchorDate: "2026-05-25", frequency: "daily" }))).toBe(true);
    expect(isValidRecurrenceRule(makeRule({ anchorDate: "2026-02-30", frequency: "daily" }))).toBe(false);
    expect(
      isValidRecurrenceRule(makeRule({ anchorDate: "2026-01-01", frequency: "weekly", byWeekdays: [] }))
    ).toBe(false);
    expect(
      isValidRecurrenceRule(makeRule({ anchorDate: "2026-01-01", frequency: "monthly", dayOfMonth: 40 }))
    ).toBe(false);
  });
});

describe("normalizeRecurrenceRule", () => {
  it("returns undefined for invalid rules", () => {
    expect(normalizeRecurrenceRule(makeRule({ anchorDate: "2026-02-30", frequency: "daily" }))).toBeUndefined();
  });

  it("returns lean canonical shape for valid rules", () => {
    expect(
      normalizeRecurrenceRule(
        makeRule({ anchorDate: "2026-05-25", frequency: "daily", interval: 1, end: { kind: "never" } })
      )
    ).toEqual({
      anchorDate: "2026-05-25",
      frequency: "daily",
    });

    expect(
      normalizeRecurrenceRule(
        makeRule({
          anchorDate: "2026-01-15",
          frequency: "monthly",
          dayOfMonth: 15,
          end: { kind: "afterCount", maxOccurrences: 3 },
        })
      )
    ).toEqual({
      anchorDate: "2026-01-15",
      frequency: "monthly",
      end: { kind: "afterCount", maxOccurrences: 3 },
    });
  });
});
