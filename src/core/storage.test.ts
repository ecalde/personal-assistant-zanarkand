import { describe, expect, it } from "vitest";
import { validatePayloadForUpload } from "./dbMappers";
import { normalizePayload } from "./storage";
import type { CalendarColorPreferences, LifeEvent, Session, Skill } from "./model";
import { defaultWeeklySchedule } from "./state";

const NOW = "2026-05-26T12:00:00.000Z";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";
const ORPHAN_SKILL_ID = "66666666-6666-4666-8666-666666666666";

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

describe("normalizePayload orphaned sessions", () => {
  it("strips sessions referencing deleted skills from legacy local data", () => {
    const skill: Skill = {
      id: SKILL_ID,
      name: "Piano",
      schedule: defaultWeeklySchedule(),
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    const validSession: Session = {
      id: "33333333-3333-4333-8333-333333333333",
      skillId: SKILL_ID,
      minutes: 20,
      startedAtIso: NOW,
      createdAtIso: NOW,
    };
    const orphanSession: Session = {
      id: "44444444-4444-4444-8444-444444444444",
      skillId: ORPHAN_SKILL_ID,
      minutes: 15,
      startedAtIso: NOW,
      createdAtIso: NOW,
    };

    const result = normalizePayload({
      skills: [skill],
      sessions: [validSession, orphanSession],
    });

    expect(result.sessions).toEqual([validSession]);
    expect(() => validatePayloadForUpload(result)).not.toThrow();
  });
});
