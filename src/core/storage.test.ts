import { describe, expect, it } from "vitest";
import { normalizePayload } from "./storage";
import type { CalendarColorPreferences, LifeEvent } from "./model";

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

describe("normalizePayload event recurrence", () => {
  it("preserves recurrence and seriesId on events (backup round-trip)", () => {
    const recurringEvent: LifeEvent = {
      id: "77777777-7777-4777-8777-777777777777",
      title: "Tennis",
      date: "2026-06-03",
      type: "hangout",
      reminder: false,
      recurrence: { anchorDate: "2026-06-03", frequency: "weekly", byWeekdays: ["wed"] },
      seriesId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      createdAtIso: "2026-05-26T12:00:00.000Z",
      updatedAtIso: "2026-05-26T12:00:00.000Z",
    };
    const result = normalizePayload({ events: [recurringEvent] });
    expect(result.events).toEqual([recurringEvent]);
  });

  it("loads an event without recurrence unchanged", () => {
    const oneTime: LifeEvent = {
      id: "77777777-7777-4777-8777-777777777777",
      title: "Meeting",
      date: "2026-06-03",
      type: "other",
      reminder: false,
      createdAtIso: "2026-05-26T12:00:00.000Z",
      updatedAtIso: "2026-05-26T12:00:00.000Z",
    };
    const result = normalizePayload({ events: [oneTime] });
    expect(result.events[0].recurrence).toBeUndefined();
    expect(result.events[0].seriesId).toBeUndefined();
  });
});
