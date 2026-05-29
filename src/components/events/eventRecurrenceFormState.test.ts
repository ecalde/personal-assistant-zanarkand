import { describe, expect, it } from "vitest";
import type { RecurrenceRule } from "../../core/recurrence";
import type { Weekday } from "../../core/model";
import {
  emptyEventRecurrenceFormState,
  eventRecurrenceEqual,
  eventRecurrenceFormFromRule,
  eventRecurrenceRuleFromForm,
  formatEventRecurrenceLabel,
  validateEventRecurrenceForm,
} from "./eventRecurrenceFormState";

const ANCHOR = "2026-05-10";

function makeRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return { anchorDate: ANCHOR, ...overrides };
}

describe("eventRecurrenceFormFromRule", () => {
  it("returns empty form when rule is omitted", () => {
    expect(eventRecurrenceFormFromRule(ANCHOR, undefined)).toEqual(emptyEventRecurrenceFormState());
  });

  it("returns empty form for one-time rule without frequency", () => {
    expect(eventRecurrenceFormFromRule(ANCHOR, makeRule())).toEqual(emptyEventRecurrenceFormState());
  });

  it("populates daily mode", () => {
    expect(eventRecurrenceFormFromRule(ANCHOR, makeRule({ frequency: "daily" }))).toEqual({
      mode: "daily",
      byWeekdays: [],
      dayOfMonth: "",
      endKind: "never",
      endDate: "",
      maxOccurrences: "",
    });
  });

  it("populates weekly weekdays", () => {
    expect(
      eventRecurrenceFormFromRule(
        ANCHOR,
        makeRule({ frequency: "weekly", byWeekdays: ["wed", "fri"] })
      )
    ).toEqual({
      mode: "weekly",
      byWeekdays: ["wed", "fri"],
      dayOfMonth: "",
      endKind: "never",
      endDate: "",
      maxOccurrences: "",
    });
  });

  it("populates monthly day of month when different from anchor", () => {
    expect(
      eventRecurrenceFormFromRule(
        ANCHOR,
        makeRule({ frequency: "monthly", dayOfMonth: 15 })
      )
    ).toEqual({
      mode: "monthly",
      byWeekdays: [],
      dayOfMonth: "15",
      endKind: "never",
      endDate: "",
      maxOccurrences: "",
    });
  });

  it("omits monthly day when it matches anchor day", () => {
    expect(
      eventRecurrenceFormFromRule(ANCHOR, makeRule({ frequency: "monthly" }))
    ).toMatchObject({
      mode: "monthly",
      dayOfMonth: "",
    });
  });

  it("populates yearly mode", () => {
    expect(
      eventRecurrenceFormFromRule(ANCHOR, makeRule({ frequency: "yearly" }))
    ).toMatchObject({ mode: "yearly" });
  });

  it("populates end on date", () => {
    expect(
      eventRecurrenceFormFromRule(
        ANCHOR,
        makeRule({
          frequency: "daily",
          end: { kind: "onDate", endDate: "2026-12-31" },
        })
      )
    ).toMatchObject({
      endKind: "onDate",
      endDate: "2026-12-31",
    });
  });

  it("populates end after count", () => {
    expect(
      eventRecurrenceFormFromRule(
        ANCHOR,
        makeRule({
          frequency: "monthly",
          end: { kind: "afterCount", maxOccurrences: 10 },
        })
      )
    ).toMatchObject({
      endKind: "afterCount",
      maxOccurrences: "10",
    });
  });

  it("returns empty form for invalid stored rule", () => {
    expect(
      eventRecurrenceFormFromRule(
        ANCHOR,
        makeRule({ frequency: "weekly", byWeekdays: [] })
      )
    ).toEqual(emptyEventRecurrenceFormState());
  });
});

describe("eventRecurrenceRuleFromForm", () => {
  it("returns undefined for none mode", () => {
    expect(eventRecurrenceRuleFromForm(ANCHOR, emptyEventRecurrenceFormState())).toBeUndefined();
  });

  it("builds daily rule", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "daily",
    });
  });

  it("builds weekly rule with default weekday from anchor", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "weekly",
        byWeekdays: [],
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "weekly",
      byWeekdays: ["sun"],
    });
  });

  it("builds weekly rule with selected weekdays", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "weekly",
        byWeekdays: ["mon", "wed", "fri"],
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "weekly",
      byWeekdays: ["mon", "wed", "fri"],
    });
  });

  it("builds monthly rule with explicit day of month", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "monthly",
        dayOfMonth: "15",
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "monthly",
      dayOfMonth: 15,
    });
  });

  it("builds yearly rule", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "yearly",
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "yearly",
    });
  });

  it("builds end on date", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
        endKind: "onDate",
        endDate: "2026-12-31",
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "daily",
      end: { kind: "onDate", endDate: "2026-12-31" },
    });
  });

  it("builds end after count", () => {
    expect(
      eventRecurrenceRuleFromForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "monthly",
        endKind: "afterCount",
        maxOccurrences: "10",
      })
    ).toEqual({
      anchorDate: ANCHOR,
      frequency: "monthly",
      end: { kind: "afterCount", maxOccurrences: 10 },
    });
  });
});

describe("validateEventRecurrenceForm", () => {
  it("accepts none mode", () => {
    expect(validateEventRecurrenceForm(ANCHOR, emptyEventRecurrenceFormState())).toBeNull();
  });

  it("requires anchor date", () => {
    expect(
      validateEventRecurrenceForm("", {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
      })
    ).toBe("Date is required for recurrence.");
  });

  it("rejects invalid anchor date", () => {
    expect(
      validateEventRecurrenceForm("2026-02-30", {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
      })
    ).toBe("Enter a valid date (YYYY-MM-DD).");
  });

  it("requires at least one weekday when weekly selection is cleared", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "weekly",
        byWeekdays: ["mon"],
      })
    ).toBeNull();

    const toggledOff = {
      ...emptyEventRecurrenceFormState(),
      mode: "weekly" as const,
      byWeekdays: [] as Weekday[],
    };
    expect(validateEventRecurrenceForm(ANCHOR, toggledOff)).toBeNull();
  });

  it("rejects invalid day of month", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "monthly",
        dayOfMonth: "32",
      })
    ).toBe("Day of month must be between 1 and 31.");
  });

  it("requires end date for onDate end kind", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
        endKind: "onDate",
        endDate: "",
      })
    ).toBe("End date is required.");
  });

  it("rejects end date before anchor", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "daily",
        endKind: "onDate",
        endDate: "2026-05-01",
      })
    ).toBe("End date must be on or after the event date.");
  });

  it("requires occurrence count for afterCount end kind", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "monthly",
        endKind: "afterCount",
        maxOccurrences: "",
      })
    ).toBe("Number of occurrences is required.");
  });

  it("rejects invalid occurrence count", () => {
    expect(
      validateEventRecurrenceForm(ANCHOR, {
        ...emptyEventRecurrenceFormState(),
        mode: "monthly",
        endKind: "afterCount",
        maxOccurrences: "0",
      })
    ).toBe("Number of occurrences must be at least 1.");
  });
});

describe("clearing to none", () => {
  it("serializes none form to undefined", () => {
    const fromWeekly = eventRecurrenceFormFromRule(
      ANCHOR,
      makeRule({ frequency: "weekly", byWeekdays: ["wed"] })
    );
    const cleared = { ...fromWeekly, mode: "none" as const, byWeekdays: [], dayOfMonth: "" };
    expect(eventRecurrenceRuleFromForm(ANCHOR, cleared)).toBeUndefined();
    expect(validateEventRecurrenceForm(ANCHOR, cleared)).toBeNull();
  });
});

describe("serialization round-trip", () => {
  it("round-trips weekly with end date", () => {
    const rule = makeRule({
      frequency: "weekly",
      byWeekdays: ["wed"],
      end: { kind: "onDate", endDate: "2026-12-31" },
    });
    const form = eventRecurrenceFormFromRule(ANCHOR, rule);
    expect(eventRecurrenceRuleFromForm(ANCHOR, form)).toEqual({
      anchorDate: ANCHOR,
      frequency: "weekly",
      byWeekdays: ["wed"],
      end: { kind: "onDate", endDate: "2026-12-31" },
    });
  });
});

describe("eventRecurrenceEqual", () => {
  it("treats undefined as equal", () => {
    expect(eventRecurrenceEqual(undefined, undefined)).toBe(true);
  });

  it("compares normalized weekly rules", () => {
    const rule = makeRule({ frequency: "weekly", byWeekdays: ["wed"] });
    expect(eventRecurrenceEqual(rule, { ...rule })).toBe(true);
  });
});

describe("formatEventRecurrenceLabel", () => {
  it("describes common recurrence patterns", () => {
    expect(formatEventRecurrenceLabel(makeRule())).toBe("Does not repeat");
    expect(formatEventRecurrenceLabel(makeRule({ frequency: "daily" }))).toBe("Every day");
    expect(
      formatEventRecurrenceLabel(
        makeRule({ anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] })
      )
    ).toBe("Every Wednesday");
    expect(
      formatEventRecurrenceLabel(
        makeRule({
          frequency: "weekly",
          byWeekdays: ["mon", "tue", "wed", "thu", "fri"],
        })
      )
    ).toBe("Every weekday");
    expect(
      formatEventRecurrenceLabel(
        makeRule({ frequency: "weekly", byWeekdays: ["mon", "wed", "fri"] })
      )
    ).toBe("Every Monday, Wednesday, Friday");
    expect(
      formatEventRecurrenceLabel(
        makeRule({ anchorDate: "2026-01-15", frequency: "monthly", dayOfMonth: 15 })
      )
    ).toBe("Monthly on the 15th");
    expect(
      formatEventRecurrenceLabel(makeRule({ anchorDate: "2026-05-10", frequency: "yearly" }))
    ).toBe("Yearly on May 10");
  });

  it("appends end suffixes", () => {
    expect(
      formatEventRecurrenceLabel(
        makeRule({
          frequency: "weekly",
          byWeekdays: ["wed"],
          end: { kind: "onDate", endDate: "2026-12-31" },
        })
      )
    ).toBe("Every week until Dec 31, 2026");

    expect(
      formatEventRecurrenceLabel(
        makeRule({
          frequency: "monthly",
          end: { kind: "afterCount", maxOccurrences: 10 },
        })
      )
    ).toBe("Every month (10 times)");
  });
});
