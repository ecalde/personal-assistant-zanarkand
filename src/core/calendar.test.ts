import { describe, expect, it } from "vitest";
import {
  buildCalendarItemsForRange,
  buildStableCalendarItemId,
  calendarTimeSortTier,
  groupCalendarItemsByDate,
  sortCalendarItems,
  type CalendarItem,
} from "./calendar";
import type {
  LifeEvent,
  Person,
  Skill,
  WeeklySchedule,
  WorkoutSession,
} from "./model";

function emptySchedule(): WeeklySchedule {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    schedule: emptySchedule(),
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<LifeEvent> & { id: string; title: string; date: string }): LifeEvent {
  return {
    type: "other",
    reminder: false,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> & { id: string; name: string }): Person {
  return {
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<WorkoutSession> & { id: string; date: string }
): WorkoutSession {
  return {
    exercises: [{ id: "ex1", name: "Bench press", sets: 3, reps: 5 }],
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildCalendarItemsForRange", () => {
  it("returns empty when start is after end", () => {
    const items = buildCalendarItemsForRange({
      startDate: "2026-02-10",
      endDate: "2026-02-01",
      skills: [],
      events: [],
      people: [],
    });
    expect(items).toEqual([]);
  });

  it("expands a skill schedule block across each matching weekday in range", () => {
    // 2026-05-25 is a Monday; range covers Mon-Sun.
    const schedule = emptySchedule();
    const monBlock = { id: "b1", startTime: "09:00", minutes: 60 };
    schedule.mon = [monBlock];
    schedule.wed = [{ id: "b2", startTime: "18:00", minutes: 30 }];
    const skill = makeSkill({ id: "s1", name: "SQL", schedule });

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-31",
      skills: [skill],
      events: [],
      people: [],
    });

    const skillItems = items.filter((i) => i.sourceType === "skill");
    expect(skillItems).toHaveLength(2);
    const mon = skillItems.find((i) => i.date === "2026-05-25")!;
    expect(mon.startTime).toBe("09:00");
    expect(mon.endTime).toBe("10:00");
    expect(mon.isTimed).toBe(true);
    expect(mon.subcategoryKey).toBe("scheduleBlock");
    expect(mon.id).toBe("skill:s1:b1:2026-05-25");
  });

  it("maps timed-range, start-only, and all-day life events", () => {
    const events: LifeEvent[] = [
      makeEvent({ id: "e1", title: "Meeting", date: "2026-05-26", startTime: "10:00", endTime: "11:00" }),
      makeEvent({ id: "e2", title: "Call", date: "2026-05-26", startTime: "14:00" }),
      makeEvent({ id: "e3", title: "Holiday", date: "2026-05-27", type: "holiday", notes: "Day off" }),
    ];

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-31",
      skills: [],
      events,
      people: [],
    });

    const timedRange = items.find((i) => i.sourceId === "e1")!;
    expect(calendarTimeSortTier(timedRange)).toBe(0);
    expect(timedRange.allDay).toBe(false);

    const startOnly = items.find((i) => i.sourceId === "e2")!;
    expect(calendarTimeSortTier(startOnly)).toBe(1);
    expect(startOnly.endTime).toBeUndefined();

    const allDay = items.find((i) => i.sourceId === "e3")!;
    expect(calendarTimeSortTier(allDay)).toBe(2);
    expect(allDay.allDay).toBe(true);
    expect(allDay.description).toBe("Day off");
    expect(allDay.subcategoryKey).toBe("holiday");
  });

  it("emits a people birthday when no matching birthday event exists", () => {
    const person = makePerson({ id: "p1", name: "Ada", birthdayMonthDay: "05-28" });
    const items = buildCalendarItemsForRange({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      skills: [],
      events: [],
      people: [person],
    });

    const birthday = items.find((i) => i.sourceType === "people")!;
    expect(birthday.title).toBe("Ada's birthday");
    expect(birthday.date).toBe("2026-05-28");
    expect(birthday.allDay).toBe(true);
    expect(birthday.id).toBe("people:birthday:p1:2026-05-28");
  });

  it("dedupes a person birthday when a matching birthday event exists (event wins)", () => {
    const person = makePerson({ id: "p1", name: "Ada", birthdayMonthDay: "05-28" });
    const event = makeEvent({
      id: "e1",
      title: "Ada's birthday",
      date: "2026-05-28",
      type: "birthday",
      personId: "p1",
    });

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      skills: [],
      events: [event],
      people: [person],
    });

    expect(items.filter((i) => i.sourceType === "people")).toHaveLength(0);
    expect(items.filter((i) => i.sourceType === "event")).toHaveLength(1);
  });

  it("dedupes a person birthday by name match on an unlinked event", () => {
    const person = makePerson({ id: "p1", name: "Ada", birthdayMonthDay: "05-28" });
    const event = makeEvent({
      id: "e1",
      title: "Birthday party",
      date: "2026-05-28",
      type: "birthday",
      personName: "Ada",
    });

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      skills: [],
      events: [event],
      people: [person],
    });

    expect(items.filter((i) => i.sourceType === "people")).toHaveLength(0);
  });

  it("uses Feb 28 for a Feb 29 birthday in a non-leap year", () => {
    const person = makePerson({ id: "p1", name: "Leap", birthdayMonthDay: "02-29" });
    const items = buildCalendarItemsForRange({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      skills: [],
      events: [],
      people: [person],
    });

    const birthday = items.find((i) => i.sourceType === "people")!;
    expect(birthday.date).toBe("2026-02-28");
  });

  it("excludes fitness history by default and includes it when opted in", () => {
    const session = makeSession({
      id: "w1",
      date: "2026-05-26",
      focus: "push",
      durationMinutes: 45,
      completedAtIso: "2026-05-26T17:30:00.000Z",
    });

    const without = buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-31",
      skills: [],
      events: [],
      people: [],
      workoutSessions: [session],
    });
    expect(without.filter((i) => i.sourceType === "fitness")).toHaveLength(0);

    const withFitness = buildCalendarItemsForRange(
      {
        startDate: "2026-05-25",
        endDate: "2026-05-31",
        skills: [],
        events: [],
        people: [],
        workoutSessions: [session],
      },
      { includeFitnessHistory: true }
    );
    const fitness = withFitness.find((i) => i.sourceType === "fitness")!;
    expect(fitness.isTimed).toBe(true);
    expect(fitness.startTime).toBeDefined();
    expect(fitness.endTime).toBeDefined();
    expect(fitness.subcategoryKey).toBe("push");
    expect(fitness.id).toBe("fitness:session:w1");
  });

  it("excludes fitness sessions without completedAtIso even when opted in", () => {
    const session = makeSession({ id: "w1", date: "2026-05-26", focus: "pull" });
    delete (session as Partial<WorkoutSession>).completedAtIso;

    const items = buildCalendarItemsForRange(
      {
        startDate: "2026-05-25",
        endDate: "2026-05-31",
        skills: [],
        events: [],
        people: [],
        workoutSessions: [session],
      },
      { includeFitnessHistory: true }
    );
    expect(items.filter((i) => i.sourceType === "fitness")).toHaveLength(0);
  });

  it("respects disabled collectors via options", () => {
    const schedule = emptySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 60 }];
    const skill = makeSkill({ id: "s1", name: "SQL", schedule });
    const event = makeEvent({ id: "e1", title: "Meeting", date: "2026-05-25" });

    const items = buildCalendarItemsForRange(
      {
        startDate: "2026-05-25",
        endDate: "2026-05-25",
        skills: [skill],
        events: [event],
        people: [],
      },
      { includeSkills: false }
    );

    expect(items.filter((i) => i.sourceType === "skill")).toHaveLength(0);
    expect(items.filter((i) => i.sourceType === "event")).toHaveLength(1);
  });

  it("does not mutate input arrays or domain objects", () => {
    const schedule = emptySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 60 }];
    const skill = makeSkill({ id: "s1", name: "SQL", schedule });
    const skills = [skill];
    const event = makeEvent({ id: "e1", title: "Meeting", date: "2026-05-25" });
    const events = [event];

    const skillsSnapshot = JSON.stringify(skills);
    const eventsSnapshot = JSON.stringify(events);

    buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-31",
      skills,
      events,
      people: [],
    });

    expect(JSON.stringify(skills)).toBe(skillsSnapshot);
    expect(JSON.stringify(events)).toBe(eventsSnapshot);
  });
});

describe("sorting and grouping", () => {
  it("orders by date, then time tier, then source, then title, then id", () => {
    const base = {
      isTimed: false,
      isMultiDay: false,
      categoryKey: "event",
    } as const;
    const meta = { kind: "lifeEvent" as const, eventId: "x", eventType: "other" as const, reminder: false };
    const items: CalendarItem[] = [
      { ...base, id: "z", sourceType: "event", sourceId: "z", title: "Zeta", date: "2026-05-26", sourceMeta: { ...meta, eventId: "z" } },
      { ...base, id: "a", sourceType: "event", sourceId: "a", title: "Alpha", date: "2026-05-26", sourceMeta: { ...meta, eventId: "a" } },
      { ...base, id: "t", sourceType: "event", sourceId: "t", title: "Timed", date: "2026-05-26", startTime: "08:00", isTimed: true, sourceMeta: { ...meta, eventId: "t" } },
      { ...base, id: "y", sourceType: "event", sourceId: "y", title: "Yesterday", date: "2026-05-25", sourceMeta: { ...meta, eventId: "y" } },
    ];

    const sorted = sortCalendarItems(items);
    expect(sorted.map((i) => i.id)).toEqual(["y", "t", "a", "z"]);
  });

  it("groups sorted items by date preserving intra-day order", () => {
    const schedule = emptySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 60 }];
    const skill = makeSkill({ id: "s1", name: "SQL", schedule });
    const event = makeEvent({ id: "e1", title: "Meeting", date: "2026-05-25", startTime: "08:00", endTime: "08:30" });

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-25",
      skills: [skill],
      events: [event],
      people: [],
    });

    const grouped = groupCalendarItemsByDate(items);
    const day = grouped.get("2026-05-25")!;
    expect(day.map((i) => i.startTime)).toEqual(["08:00", "09:00"]);
  });
});

describe("buildStableCalendarItemId", () => {
  it("produces stable ids per source type", () => {
    expect(
      buildStableCalendarItemId(
        { kind: "skillScheduleBlock", skillId: "s1", blockId: "b1", skillName: "SQL", plannedMinutes: 60 },
        "2026-05-25"
      )
    ).toBe("skill:s1:b1:2026-05-25");
    expect(
      buildStableCalendarItemId(
        { kind: "lifeEvent", eventId: "e1", eventType: "other", reminder: false },
        "2026-05-25"
      )
    ).toBe("event:e1");
    expect(
      buildStableCalendarItemId(
        { kind: "personBirthday", personId: "p1", personName: "Ada", birthdayMonthDay: "05-28" },
        "2026-05-28"
      )
    ).toBe("people:birthday:p1:2026-05-28");
    expect(
      buildStableCalendarItemId(
        { kind: "workoutSession", sessionId: "w1", completedAtIso: "2026-05-26T17:30:00.000Z" },
        "2026-05-26"
      )
    ).toBe("fitness:session:w1");
  });
});
