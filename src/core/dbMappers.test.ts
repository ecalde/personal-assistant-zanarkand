import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { CareerTarget, ExerciseEntry, FocusFeedback, JobApplication, LifeEvent, Person, Session, Skill, WorkoutPlan, WorkoutSession } from "./model";
import {
  MapperError,
  careerTargetFromRow,
  careerTargetToRow,
  eventFromRow,
  eventToRow,
  focusFeedbackFromRow,
  focusFeedbackToRow,
  isBirthdayMonthDay,
  isHhMm,
  isIsoDate,
  isIsoTimestamp,
  isPositiveInteger,
  isPriority,
  isUuid,
  isWorkoutFocus,
  jobApplicationFromRow,
  jobApplicationToRow,
  overrideFromRow,
  overrideToRow,
  parseExerciseEntries,
  parseWeeklySchedule,
  payloadFromRows,
  personFromRow,
  personToRow,
  sessionFromRow,
  sessionToRow,
  skillFromRow,
  skillToRow,
  validatePayloadForUpload,
  workoutPlanFromRow,
  workoutPlanToRow,
  workoutSessionFromRow,
  workoutSessionToRow,
} from "./dbMappers";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const BLOCK_ID = "44444444-4444-4444-8444-444444444444";
const OVERRIDE_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "77777777-7777-4777-8777-777777777777";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const APP_ID = "99999999-9999-4999-8999-999999999999";
const TARGET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKOUT_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EXERCISE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FEEDBACK_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

function samplePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: "Alex",
    birthdayMonthDay: "06-15",
    relationship: "friend",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleJobApplication(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: APP_ID,
    company: "Acme Corp",
    roleTitle: "Software Engineer",
    status: "applied",
    requiredSkillIds: [SKILL_ID],
    appliedDate: EVENT_DATE,
    url: "https://jobs.example.com/123",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleCareerTarget(overrides: Partial<CareerTarget> = {}): CareerTarget {
  return {
    id: TARGET_ID,
    roleTitle: "Staff Engineer",
    company: "Dream Co",
    requiredSkillIds: [SKILL_ID],
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

  it("accepts HH:MM times", () => {
    expect(isHhMm("09:00")).toBe(true);
    expect(isHhMm("23:59")).toBe(true);
    expect(isHhMm("6:00")).toBe(false);
    expect(isHhMm("24:00")).toBe(false);
  });

  it("accepts birthday month-day values", () => {
    expect(isBirthdayMonthDay("06-15")).toBe(true);
    expect(isBirthdayMonthDay("13-01")).toBe(false);
    expect(isBirthdayMonthDay("06-32")).toBe(false);
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

  it("round-trips event with start and end times", () => {
    const event = sampleEvent({ startTime: "14:00", endTime: "16:00" });
    const row = eventToRow(event, USER_ID);
    expect(row.start_time).toBe("14:00");
    expect(row.end_time).toBe("16:00");
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

  it("rejects endTime without startTime", () => {
    expect(() => eventToRow(sampleEvent({ endTime: "16:00" }), USER_ID)).toThrow(
      MapperError
    );
  });

  it("rejects invalid startTime", () => {
    expect(() => eventToRow(sampleEvent({ startTime: "6:00" }), USER_ID)).toThrow(
      MapperError
    );
  });

  it("rejects endTime before startTime", () => {
    expect(() =>
      eventToRow(sampleEvent({ startTime: "16:00", endTime: "14:00" }), USER_ID)
    ).toThrow(MapperError);
  });

  it("round-trips event with personId", () => {
    const event = sampleEvent({ personId: PERSON_ID, personName: "Alex" });
    const row = eventToRow(event, USER_ID);
    expect(row.person_id).toBe(PERSON_ID);
    expect(eventFromRow(row)).toEqual(event);
  });
});

describe("person mappers", () => {
  it("round-trips person domain ↔ row", () => {
    const person = samplePerson({
      nickname: "Al",
      likes: "Coffee",
      dislikes: "Loud music",
      giftIdeas: "Books",
      notes: "Met at work",
      lastContactDate: "2026-05-01",
      contactCadenceDays: 14,
    });
    const row = personToRow(person, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.birthday_month_day).toBe("06-15");
    expect(personFromRow(row)).toEqual(person);
  });

  it("maps optional fields to null", () => {
    const row = personToRow(samplePerson({ nickname: undefined, relationship: undefined }), USER_ID);
    expect(row.nickname).toBeNull();
    expect(row.relationship).toBeNull();
    expect(personFromRow(row).nickname).toBeUndefined();
  });

  it("rejects invalid birthday month-day", () => {
    expect(() =>
      personToRow(samplePerson({ birthdayMonthDay: "13-40" }), USER_ID)
    ).toThrow(MapperError);
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
      [eventToRow(sampleEvent(), USER_ID)],
      [personToRow(samplePerson(), USER_ID)]
    );
    expect(payload.skills).toHaveLength(1);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.overrides).toEqual([]);
    expect(payload.events).toHaveLength(1);
    expect(payload.people).toHaveLength(1);
    expect(payload.jobApplications).toEqual([]);
  });

  it("maps career target singleton from rows", () => {
    const skill = sampleSkill();
    const payload = payloadFromRows(
      [skillToRow(skill, USER_ID)],
      [],
      [],
      [],
      [],
      [],
      [careerTargetToRow(sampleCareerTarget(), USER_ID)]
    );
    expect(payload.careerTarget?.roleTitle).toBe("Staff Engineer");
  });
});

describe("job application mappers", () => {
  it("round-trips job application", () => {
    const app = sampleJobApplication();
    const row = jobApplicationToRow(app, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(jobApplicationFromRow(row)).toEqual(app);
  });

  it("rejects invalid status", () => {
    expect(() =>
      jobApplicationToRow(sampleJobApplication({ status: "invalid" as JobApplication["status"] }), USER_ID)
    ).toThrow(MapperError);
  });

  it("rejects bad salary range", () => {
    expect(() =>
      jobApplicationToRow(
        sampleJobApplication({ salaryMin: 200000, salaryMax: 100000 }),
        USER_ID
      )
    ).toThrow(MapperError);
  });

  it("rejects invalid URL", () => {
    expect(() =>
      jobApplicationToRow(sampleJobApplication({ url: "not-a-url" }), USER_ID)
    ).toThrow(MapperError);
  });
});

describe("career target mappers", () => {
  it("round-trips career target", () => {
    const target = sampleCareerTarget();
    const row = careerTargetToRow(target, USER_ID);
    expect(careerTargetFromRow(row)).toEqual(target);
  });
});

function sampleExercise(overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: EXERCISE_ID,
    name: "Bench press",
    sets: 3,
    reps: 10,
    weight: 135,
    ...overrides,
  };
}

function sampleWorkoutPlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Push A",
    focus: "push",
    exercises: [sampleExercise()],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleWorkoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: WORKOUT_SESSION_ID,
    date: EVENT_DATE,
    focus: "push",
    planId: PLAN_ID,
    exercises: [sampleExercise({ name: "Incline press" })],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("workout mappers", () => {
  it("round-trips workout plan", () => {
    const plan = sampleWorkoutPlan();
    const row = workoutPlanToRow(plan, USER_ID);
    expect(workoutPlanFromRow(row)).toEqual(plan);
  });

  it("round-trips workout session", () => {
    const session = sampleWorkoutSession();
    const row = workoutSessionToRow(session, USER_ID);
    expect(workoutSessionFromRow(row)).toEqual(session);
  });

  it("round-trips workout session with metadata", () => {
    const session = sampleWorkoutSession({
      durationMinutes: 45,
      completedAtIso: NOW,
    });
    const row = workoutSessionToRow(session, USER_ID);
    expect(workoutSessionFromRow(row)).toEqual(session);
  });

  it("rejects invalid session duration", () => {
    expect(() =>
      workoutSessionToRow(sampleWorkoutSession({ durationMinutes: 0 }), USER_ID)
    ).toThrow(MapperError);
  });

  it("rejects invalid completedAtIso", () => {
    expect(() =>
      workoutSessionToRow(sampleWorkoutSession({ completedAtIso: "not-a-date" }), USER_ID)
    ).toThrow(MapperError);
  });

  it("parses exercise entries", () => {
    const entries = parseExerciseEntries(
      [{ id: EXERCISE_ID, name: "Squat", sets: 5, reps: 5, weight: 225 }],
      "exercises"
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("Squat");
  });

  it("rejects invalid focus", () => {
    expect(isWorkoutFocus("invalid")).toBe(false);
  });

  it("rejects empty exercise list", () => {
    expect(() => workoutPlanToRow(sampleWorkoutPlan({ exercises: [] }), USER_ID)).toThrow(
      MapperError
    );
  });

  it("rejects orphan plan id on session upload validation", () => {
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [],
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [sampleWorkoutSession({ planId: PLAN_ID })],
        focusFeedback: [],
      })
    ).toThrow(MapperError);
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
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
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
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
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
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects events referencing unknown person", () => {
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [sampleEvent({ personId: PERSON_ID })],
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects duplicate person ids", () => {
    const person = samplePerson();
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [],
        people: [person, person],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects job application referencing unknown skill", () => {
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [],
        people: [],
        jobApplications: [sampleJobApplication()],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
      })
    ).toThrow(MapperError);
  });

  it("rejects career target referencing unknown skill", () => {
    expect(() =>
      validatePayloadForUpload({
        skills: [],
        sessions: [],
        overrides: [],
        events: [],
        people: [],
        jobApplications: [],
        workoutPlans: [],
        workoutSessions: [],
        focusFeedback: [],
        careerTarget: sampleCareerTarget(),
      })
    ).toThrow(MapperError);
  });
});

describe("focus feedback mappers", () => {
  function sampleFocusFeedback(overrides: Partial<FocusFeedback> = {}): FocusFeedback {
    return {
      id: FEEDBACK_ID,
      focusItemId: "skill:test-skill",
      action: "dismissed",
      createdAtIso: NOW,
      updatedAtIso: NOW,
      ...overrides,
    };
  }

  it("round-trips dismissed feedback", () => {
    const entry = sampleFocusFeedback();
    const row = focusFeedbackToRow(entry, USER_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(focusFeedbackFromRow(row)).toEqual(entry);
  });

  it("round-trips snoozed feedback", () => {
    const entry = sampleFocusFeedback({
      action: "snoozed",
      untilIso: "2026-05-27T15:00:00.000Z",
    });
    const row = focusFeedbackToRow(entry, USER_ID);
    expect(focusFeedbackFromRow(row)).toEqual(entry);
  });

  it("round-trips feedback with sourceSnapshot", () => {
    const entry = sampleFocusFeedback({
      sourceSnapshot: "Log ML time\nDaily goal incomplete",
    });
    const row = focusFeedbackToRow(entry, USER_ID);
    expect(row.source_snapshot).toBe("Log ML time\nDaily goal incomplete");
    expect(focusFeedbackFromRow(row)).toEqual(entry);
  });

  it("rejects empty sourceSnapshot", () => {
    expect(() =>
      focusFeedbackToRow(sampleFocusFeedback({ sourceSnapshot: "   " }), USER_ID)
    ).toThrow(MapperError);
  });

  it("rejects snoozed without untilIso", () => {
    expect(() =>
      focusFeedbackToRow(
        sampleFocusFeedback({ action: "snoozed" }),
        USER_ID
      )
    ).toThrow(MapperError);
  });

  it("rejects dismissed with untilIso", () => {
    expect(() =>
      focusFeedbackToRow(
        sampleFocusFeedback({
          action: "dismissed",
          untilIso: "2026-05-27T15:00:00.000Z",
        }),
        USER_ID
      )
    ).toThrow(MapperError);
  });

  it("rejects invalid action", () => {
    expect(() =>
      focusFeedbackToRow(
        sampleFocusFeedback({ action: "invalid" as FocusFeedback["action"] }),
        USER_ID
      )
    ).toThrow(MapperError);
  });
});
