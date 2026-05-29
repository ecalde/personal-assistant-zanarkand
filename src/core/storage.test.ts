import { describe, expect, it } from "vitest";
import { normalizePayload } from "./storage";
import type { CalendarColorPreferences } from "./model";

describe("normalizePayload calendar preferences", () => {
  it("preserves a valid calendarPreferences object", () => {
    const calendarPreferences: CalendarColorPreferences = {
      categories: { skill: "indigo.base" },
    };
    const result = normalizePayload({ calendarPreferences });
    expect(result.calendarPreferences).toEqual(calendarPreferences);
  });

  it("drops a malformed calendarPreferences to undefined", () => {
    expect(normalizePayload({ calendarPreferences: [] }).calendarPreferences).toBeUndefined();
    expect(
      normalizePayload({ calendarPreferences: "nope" }).calendarPreferences
    ).toBeUndefined();
  });

  it("loads a legacy payload missing calendarPreferences (backward compatible)", () => {
    const legacy = {
      skills: [],
      sessions: [],
      overrides: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
    };
    const result = normalizePayload(legacy);
    expect(result.calendarPreferences).toBeUndefined();
    expect(result.skills).toEqual([]);
  });
});
