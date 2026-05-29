import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { AppPayload, Skill, SkillScheduleSeries } from "./model";
import {
  buildActiveSkillsForDate,
  cleanupInvalidSkillScheduleSeries,
  getSkillSeriesDateRange,
  isSkillActiveOnDate,
  isValidSkillScheduleSeries,
  normalizeSkillScheduleSeries,
} from "./skillSeries";

const SKILL_A = "22222222-2222-4222-8222-222222222222";
const SKILL_B = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-05-26T12:00:00.000Z";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: SKILL_A,
    name: "Piano",
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
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

describe("isValidSkillScheduleSeries", () => {
  it("accepts valid indefinite without startDate", () => {
    expect(isValidSkillScheduleSeries({ mode: "indefinite" })).toBe(true);
  });

  it("accepts valid indefinite with startDate", () => {
    expect(isValidSkillScheduleSeries({ mode: "indefinite", startDate: "2026-06-01" })).toBe(true);
  });

  it("accepts valid date_range", () => {
    expect(
      isValidSkillScheduleSeries({
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-08-31",
      })
    ).toBe(true);
  });

  it("accepts valid single_day", () => {
    expect(isValidSkillScheduleSeries({ mode: "single_day", singleDate: "2026-07-04" })).toBe(true);
  });

  it("rejects unknown mode", () => {
    expect(isValidSkillScheduleSeries({ mode: "weekly" })).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(isValidSkillScheduleSeries({ mode: "single_day", singleDate: "2026-02-30" })).toBe(false);
    expect(
      isValidSkillScheduleSeries({
        mode: "date_range",
        startDate: "not-a-date",
        endDate: "2026-08-31",
      })
    ).toBe(false);
  });

  it("rejects invalid ranges where endDate is before startDate", () => {
    expect(
      isValidSkillScheduleSeries({
        mode: "date_range",
        startDate: "2026-08-01",
        endDate: "2026-06-01",
      })
    ).toBe(false);
  });

  it("rejects mode-specific field mismatches", () => {
    expect(
      isValidSkillScheduleSeries({
        mode: "indefinite",
        endDate: "2026-08-31",
      })
    ).toBe(false);
    expect(
      isValidSkillScheduleSeries({
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-08-31",
        singleDate: "2026-07-01",
      })
    ).toBe(false);
    expect(
      isValidSkillScheduleSeries({
        mode: "single_day",
        singleDate: "2026-07-04",
        startDate: "2026-07-04",
      })
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(isValidSkillScheduleSeries({ mode: "indefinite", seriesId: "x" })).toBe(false);
  });
});

describe("normalizeSkillScheduleSeries", () => {
  it("returns canonical objects for valid input", () => {
    expect(normalizeSkillScheduleSeries({ mode: "indefinite" })).toEqual({ mode: "indefinite" });
    expect(
      normalizeSkillScheduleSeries({
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      })
    ).toEqual({
      mode: "date_range",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("returns undefined for invalid input", () => {
    expect(normalizeSkillScheduleSeries(null)).toBeUndefined();
    expect(normalizeSkillScheduleSeries({ mode: "bogus" })).toBeUndefined();
  });

  it("does not mutate the input object", () => {
    const raw = { mode: "indefinite" as const, extra: "drop" };
    deepFreeze(raw);
    expect(normalizeSkillScheduleSeries(raw)).toBeUndefined();
    expect(raw.mode).toBe("indefinite");
  });
});

describe("isSkillActiveOnDate", () => {
  it("treats undefined scheduleSeries as always active (backward compatible)", () => {
    const skill = makeSkill();
    expect(isSkillActiveOnDate(skill, "2026-01-01")).toBe(true);
    expect(isSkillActiveOnDate(skill, "2099-12-31")).toBe(true);
  });

  it("treats indefinite without startDate as always active", () => {
    const skill = makeSkill({ scheduleSeries: { mode: "indefinite" } });
    expect(isSkillActiveOnDate(skill, "2026-01-01")).toBe(true);
  });

  it("treats indefinite with startDate as active from that date onward", () => {
    const skill = makeSkill({ scheduleSeries: { mode: "indefinite", startDate: "2026-06-01" } });
    expect(isSkillActiveOnDate(skill, "2026-05-31")).toBe(false);
    expect(isSkillActiveOnDate(skill, "2026-06-01")).toBe(true);
    expect(isSkillActiveOnDate(skill, "2027-01-01")).toBe(true);
  });

  it("filters by inclusive date_range boundaries", () => {
    const skill = makeSkill({
      scheduleSeries: {
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      },
    });
    expect(isSkillActiveOnDate(skill, "2026-05-31")).toBe(false);
    expect(isSkillActiveOnDate(skill, "2026-06-01")).toBe(true);
    expect(isSkillActiveOnDate(skill, "2026-06-30")).toBe(true);
    expect(isSkillActiveOnDate(skill, "2026-07-01")).toBe(false);
  });

  it("matches single_day exactly", () => {
    const skill = makeSkill({
      scheduleSeries: { mode: "single_day", singleDate: "2026-07-04" },
    });
    expect(isSkillActiveOnDate(skill, "2026-07-03")).toBe(false);
    expect(isSkillActiveOnDate(skill, "2026-07-04")).toBe(true);
    expect(isSkillActiveOnDate(skill, "2026-07-05")).toBe(false);
  });

  it("returns false for invalid scheduleSeries (fail-closed)", () => {
    const skill = makeSkill({
      scheduleSeries: { mode: "date_range", startDate: "2026-08-01", endDate: "2026-06-01" } as SkillScheduleSeries,
    });
    expect(isSkillActiveOnDate(skill, "2026-07-01")).toBe(false);
  });

  it("returns false for invalid dateKey queries", () => {
    const skill = makeSkill({ scheduleSeries: { mode: "indefinite" } });
    expect(isSkillActiveOnDate(skill, "2026-02-30")).toBe(false);
  });
});

describe("buildActiveSkillsForDate", () => {
  it("returns skills active on the given date in input order", () => {
    const always = makeSkill({ id: SKILL_A, name: "Always" });
    const ranged = makeSkill({
      id: SKILL_B,
      name: "Summer",
      scheduleSeries: {
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      },
    });
    const active = buildActiveSkillsForDate([always, ranged], "2026-06-15");
    expect(active.map((s) => s.id)).toEqual([SKILL_A, SKILL_B]);

    const july = buildActiveSkillsForDate([always, ranged], "2026-07-01");
    expect(july.map((s) => s.id)).toEqual([SKILL_A]);
  });

  it("returns empty when no skills are active", () => {
    const skill = makeSkill({
      scheduleSeries: { mode: "single_day", singleDate: "2026-07-04" },
    });
    expect(buildActiveSkillsForDate([skill], "2026-07-05")).toEqual([]);
  });
});

describe("getSkillSeriesDateRange", () => {
  it("returns unbounded when scheduleSeries is omitted", () => {
    expect(getSkillSeriesDateRange(makeSkill())).toEqual({ kind: "unbounded" });
  });

  it("returns unbounded for indefinite without startDate", () => {
    expect(
      getSkillSeriesDateRange(makeSkill({ scheduleSeries: { mode: "indefinite" } }))
    ).toEqual({ kind: "unbounded" });
  });

  it("returns bounded range for date_range and single_day", () => {
    expect(
      getSkillSeriesDateRange(
        makeSkill({
          scheduleSeries: {
            mode: "date_range",
            startDate: "2026-06-01",
            endDate: "2026-06-30",
          },
        })
      )
    ).toEqual({ kind: "bounded", startDate: "2026-06-01", endDate: "2026-06-30" });

    expect(
      getSkillSeriesDateRange(
        makeSkill({
          scheduleSeries: { mode: "single_day", singleDate: "2026-07-04" },
        })
      )
    ).toEqual({ kind: "bounded", startDate: "2026-07-04", endDate: "2026-07-04" });
  });

  it("returns non-overlapping bounded range for invalid series", () => {
    const range = getSkillSeriesDateRange(
      makeSkill({
        scheduleSeries: { mode: "bogus" } as unknown as SkillScheduleSeries,
      })
    );
    expect(range.kind).toBe("bounded");
    if (range.kind === "bounded") {
      expect(range.startDate > range.endDate).toBe(true);
    }
  });
});

describe("cleanupInvalidSkillScheduleSeries", () => {
  it("strips invalid scheduleSeries from skills", () => {
    const skill = makeSkill({
      scheduleSeries: { mode: "date_range", startDate: "2026-08-01", endDate: "2026-06-01" } as SkillScheduleSeries,
    });
    const payload: AppPayload = {
      skills: [skill],
      sessions: [],
      overrides: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
    };
    const cleaned = cleanupInvalidSkillScheduleSeries(payload);
    expect(cleaned.skills[0].scheduleSeries).toBeUndefined();
    expect(cleaned).not.toBe(payload);
  });

  it("preserves valid scheduleSeries and returns same payload reference when unchanged", () => {
    const skill = makeSkill({ scheduleSeries: { mode: "indefinite" } });
    const payload: AppPayload = {
      skills: [skill],
      sessions: [],
      overrides: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
    };
    expect(cleanupInvalidSkillScheduleSeries(payload)).toBe(payload);
  });
});

describe("immutability", () => {
  it("does not mutate frozen skills when filtering", () => {
    const skill = deepFreeze(
      makeSkill({ scheduleSeries: { mode: "indefinite" } })
    );
    const skills = deepFreeze([skill]);
    buildActiveSkillsForDate(skills, "2026-06-01");
    expect(skills).toHaveLength(1);
  });
});
