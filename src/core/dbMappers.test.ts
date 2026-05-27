import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { LifeEvent, Session, Skill } from "./model";
import {
  MapperError,
  eventFromRow,
  eventToRow,
  isIsoDate,
  isIsoTimestamp,
  isPositiveInteger,
  isPriority,
  isUuid,
  overrideFromRow,
  overrideToRow,
  parseWeeklySchedule,
  payloadFromRows,
  sessionFromRow,
  sessionToRow,
  skillFromRow,
  skillToRow,
  validatePayloadForUpload,
} from "./dbMappers";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const BLOCK_ID = "44444444-4444-4444-8444-444444444444";
const OVERRIDE_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "77777777-7777-4777-8777-777777777777";

const NOW = "2026-05-26T12:00:00.000Z";
const EVENT_DATE = "2026-06-15";

function sampleSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: SKILL_ID,
    name: "Piano",
    priority: 2,
    dailyGoalMinutes: 30,
    weeklyGoalMinutes: 180,
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    skillId: SKILL_ID,
    minutes: 25,
    startedAtIso: NOW,
    createdAtIso: NOW,
    ...overrides,
  };
}

function sampleEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: EVENT_ID,
    title: "Birthday dinner",
    date: EVENT_DATE,
    type: "birthday",
    personName: "Alex",
    notes: "Bring cake",
    reminder: true,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("validation helpers", () => {
  it("accepts valid UUIDs", () => {
    expect(isUuid(SKILL_ID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("accepts valid priorities and positive integers", () => {
    expect(isPriority(1)).toBe(true);
    expect(isPriority(5)).toBe(false);
    expect(isPositiveInteger(10)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
  });

  it("accepts ISO timestamps", () => {
    expect(isIsoTimestamp(NOW)).toBe(true);
    expect(isIsoTimestamp("not-a-date")).toBe(false);
  });

  it("accepts ISO dates", () => {
    expect(isIsoDate(EVENT_DATE)).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });
});

describe("parseWeeklySchedule", () => {
  it("parses valid blocks per weekday", () => {
    const schedule = parseWeeklySchedule({
      mon: [{ id: BLOCK_ID, startTime: "06:00", minutes: 30 }],
    });
    expect(schedule.mon).toHaveLength(1);
    expect(schedule.tue).toEqual([]);
  });

  it("rejects unknown weekday keys", () => {
    expect(() => parseWeeklySchedule({ bogus: [] })).toThrow(MapperError);
  });

  it("rejects invalid block minutes", () => {
    expect(() =>
      parseWeeklySchedule({
        mon: [{ id: BLOCK_ID, startTime: "06:00", minutes: 0 }],
      })
    ).toThrow(MapperError);
  });

  it("rejects non-HH:MM startTime", () => {
    expect(() =>
      parseWeeklySchedule({
        mon: [{ id: BLOCK_ID, startTime: "6:00", minutes: 30 }],
      })
    ).toThrow(MapperError);
  });
});

describe("skill mappers", () => {
  it("round-trips skill domain ↔ row", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: BLOCK_ID, startTime: "18:00", minutes: 45 }],
      },
    });
    const row = skillToRow(skill, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.priority).toBe(2);
    expect(row.schedule.wed).toHaveLength(1);

    const back = skillFromRow(row);
    expect(back).toEqual(skill);
  });

  it("maps undefined priority to null", () => {
    const row = skillToRow(sampleSkill({ priority: undefined }), USER_ID);
    expect(row.priority).toBeNull();
    expect(skillFromRow(row).priority).toBeUndefined();
  });

  it("rejects invalid priority on toRow", () => {
    expect(() => skillToRow(sampleSkill({ priority: 9 as 2 }), USER_ID)).toThrow(
      MapperError
    );
  });

  it("rejects invalid user id", () => {
    expect(() => skillToRow(sampleSkill(), "bad-id")).toThrow(MapperError);
  });
});

describe("session mappers", () => {
  it("round-trips session domain ↔ row", () => {
    const session = sampleSession();
    const row = sessionToRow(session, USER_ID);
    expect(row.skill_id).toBe(SKILL_ID);
    expect(sessionFromRow(row)).toEqual(session);
  });

  it("rejects non-positive minutes", () => {
    expect(() => sessionToRow(sampleSession({ minutes: 0 }), USER_ID)).toThrow(
      MapperError
    );
  });
});

describe("event mappers", () => {
  it("round-trips event domain ↔ row", () => {
    const event = sampleEvent();
    const row = eventToRow(event, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.person_name).toBe("Alex");
    expect(eventFromRow(row)).toEqual(event);
  });

  it("maps optional fields to null", () => {
    const row = eventToRow(
      sampleEvent({ personName: undefined, notes: undefined, reminder: false }),
      USER_ID
    );
    expect(row.person_name).toBeNull();
    expect(row.notes).toBeNull();
    expect(eventFromRow(row).personName).toBeUndefined();
    expect(eventFromRow(row).notes).toBeUndefined();
  });

  it("rejects invalid event type", () => {
    expect(() =>
      eventToRow(sampleEvent({ type: "invalid" as LifeEvent["type"] }), USER_ID)
    ).toThrow(MapperError);
  });

  it("rejects invalid date", () => {
    expect(() => eventToRow(sampleEvent({ date: "2026-99-99" }), USER_ID)).toThrow(
      MapperError
    );
  });
});

describe("override mappers", () => {
  it("round-trips object override with id", () => {
    const item = { id: OVERRIDE_ID, kind: "vacation", note: "away" };
    const row = overrideToRow(item, USER_ID, { createdAtIso: NOW });
    expect(row.kind).toBe("vacation");
    expect(overrideFromRow(row)).toEqual(item);
  });

  it("wraps primitive overrides", () => {
    const row = overrideToRow("holiday", USER_ID, {
      id: OVERRIDE_ID,
      createdAtIso: NOW,
    });
    expect(row.payload).toEqual({ value: "holiday" });
    expect(overrideFromRow(row)).toEqual({ value: "holiday" });
  });

  it("injects row id when payload object lacks id", () => {
    const row = {
      id: OVERRIDE_ID,
      user_id: USER_ID,
      kind: null,
      payload: { note: "test" },
      created_at: NOW,
    };
    expect(overrideFromRow(row)).toEqual({ note: "test", id: OVERRIDE_ID });
  });
});

describe("payloadFromRows", () => {
  it("builds AppPayload from row arrays", () => {
    const skill = sampleSkill();
    const session = sampleSession();
    const payload = payloadFromRows(
      [skillToRow(skill, USER_ID)],
      [sessionToRow(session, USER_ID)],
      [],
      [eventToRow(sampleEvent(), USER_ID)]
    );
    expect(payload.skills).toHaveLength(1);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.overrides).toEqual([]);
    expect(payload.events).toHaveLength(1);
  });
});

describe("validatePayloadForUpload", () => {
  it("rejects duplicate skill ids", () => {
    const skill = sampleSkill();
    expect(() =>
      validatePayloadForUpload({
        skills: [skill, skill],
        sessions: [],
        overrides: [],
        events: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects sessions referencing unknown skills", () => {
    expect(() =>
      validatePayloadForUpload({
        skills: [sampleSkill()],
        sessions: [sampleSession({ skillId: "66666666-6666-4666-8666-666666666666" })],
        overrides: [],
        events: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects duplicate event ids", () => {
    const event = sampleEvent();
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [event, event],
      })
    ).toThrow(MapperError);
  });
});
