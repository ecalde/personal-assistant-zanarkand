import { describe, expect, it } from "vitest";
import type { LifeEvent, Person } from "./model";
import {
  buildPeopleById,
  buildPeopleNeedingFollowUp,
  buildUpcomingBirthdayItems,
  eventsForPerson,
  filterAndSortPeople,
  filterPeopleByQuery,
  getNextBirthdayDateKey,
  getPersonBirthdayStatus,
  getPersonFollowUpStatus,
  personMatchesQuery,
  resolveEventPersonLabel,
  sortPeopleByFollowUpPriority,
  sortPeopleByRecentContact,
  sortPeopleByUpcomingBirthday,
} from "./people";

const NOW = "2026-05-26T12:00:00.000Z";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const EVENT_ID = "77777777-7777-4777-8777-777777777777";

function samplePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: "Alex",
    birthdayMonthDay: "06-15",
    relationship: "friend",
    likes: "Coffee",
    lastContactDate: "2026-05-01",
    contactCadenceDays: 14,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("getNextBirthdayDateKey", () => {
  it("returns this year when birthday is still ahead", () => {
    expect(getNextBirthdayDateKey(samplePerson(), "2026-05-26")).toBe("2026-06-15");
  });

  it("returns next year when birthday has passed", () => {
    expect(getNextBirthdayDateKey(samplePerson({ birthdayMonthDay: "03-10" }), "2026-05-26")).toBe(
      "2027-03-10"
    );
  });

  it("returns today when birthday is today", () => {
    expect(getNextBirthdayDateKey(samplePerson({ birthdayMonthDay: "05-26" }), "2026-05-26")).toBe(
      "2026-05-26"
    );
  });

  it("maps Feb 29 to Feb 28 in non-leap years", () => {
    expect(
      getNextBirthdayDateKey(samplePerson({ birthdayMonthDay: "02-29" }), "2026-01-01")
    ).toBe("2026-02-28");
  });

  it("returns null when no birthday set", () => {
    expect(getNextBirthdayDateKey(samplePerson({ birthdayMonthDay: undefined }), "2026-05-26")).toBe(
      null
    );
  });
});

describe("buildUpcomingBirthdayItems", () => {
  it("filters to window and caps items", () => {
    const people = [
      samplePerson({ id: "a", name: "Alex", birthdayMonthDay: "05-28" }),
      samplePerson({ id: "b", name: "Blake", birthdayMonthDay: "08-01" }),
      samplePerson({ id: "c", name: "Casey", birthdayMonthDay: "05-30" }),
    ];

    const items = buildUpcomingBirthdayItems(people, "2026-05-26", 14, 2);
    expect(items).toHaveLength(2);
    expect(items[0]?.person.name).toBe("Alex");
    expect(items[0]?.urgencyLabel).toBe("In 2 days");
    expect(items[1]?.person.name).toBe("Casey");
  });
});

describe("buildPeopleNeedingFollowUp", () => {
  it("includes people past contact cadence", () => {
    const people = [
      samplePerson({
        lastContactDate: "2026-05-01",
        contactCadenceDays: 14,
      }),
      samplePerson({
        id: "99999999-9999-4999-8999-999999999999",
        name: "Jordan",
        lastContactDate: "2026-05-20",
        contactCadenceDays: 14,
      }),
    ];

    const items = buildPeopleNeedingFollowUp(people, "2026-05-26", 5);
    expect(items).toHaveLength(1);
    expect(items[0]?.person.name).toBe("Alex");
    expect(items[0]?.daysSinceContact).toBe(25);
  });

  it("skips people without cadence or last contact", () => {
    expect(
      buildPeopleNeedingFollowUp(
        [samplePerson({ lastContactDate: undefined, contactCadenceDays: 14 })],
        "2026-05-26"
      )
    ).toEqual([]);
  });
});

describe("resolveEventPersonLabel", () => {
  const peopleById = buildPeopleById([samplePerson()]);

  it("prefers linked person name over personName", () => {
    const event: LifeEvent = {
      id: EVENT_ID,
      title: "Hangout",
      date: "2026-06-01",
      type: "hangout",
      personId: PERSON_ID,
      personName: "Old name",
      reminder: false,
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    expect(resolveEventPersonLabel(event, peopleById)).toBe("Alex");
  });

  it("falls back to personName for legacy events", () => {
    const event: LifeEvent = {
      id: EVENT_ID,
      title: "Birthday",
      date: "2026-06-01",
      type: "birthday",
      personName: "Sam",
      reminder: false,
      createdAtIso: NOW,
      updatedAtIso: NOW,
    };
    expect(resolveEventPersonLabel(event, peopleById)).toBe("Sam");
  });
});

describe("eventsForPerson", () => {
  it("filters events by personId", () => {
    const events: LifeEvent[] = [
      {
        id: EVENT_ID,
        title: "Hangout",
        date: "2026-06-01",
        type: "hangout",
        personId: PERSON_ID,
        reminder: false,
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        title: "Other",
        date: "2026-06-02",
        type: "other",
        reminder: false,
        createdAtIso: NOW,
        updatedAtIso: NOW,
      },
    ];
    expect(eventsForPerson(events, PERSON_ID)).toHaveLength(1);
  });
});

describe("sortPeopleByUpcomingBirthday", () => {
  it("sorts people with birthdays before those without", () => {
    const sorted = sortPeopleByUpcomingBirthday(
      [
        samplePerson({ id: "b", name: "Blake", birthdayMonthDay: undefined }),
        samplePerson({ id: "a", name: "Alex", birthdayMonthDay: "06-01" }),
      ],
      "2026-05-26"
    );
    expect(sorted[0]?.name).toBe("Alex");
  });
});

describe("personMatchesQuery and filterPeopleByQuery", () => {
  it("matches searchable fields case-insensitively", () => {
    const person = samplePerson({ notes: "Met at work conference" });
    expect(personMatchesQuery(person, "WORK")).toBe(true);
    expect(personMatchesQuery(person, "family")).toBe(false);
  });

  it("returns all people for empty query", () => {
    const people = [samplePerson(), samplePerson({ id: "b", name: "Blake" })];
    expect(filterPeopleByQuery(people, "")).toHaveLength(2);
    expect(filterPeopleByQuery(people, "   ")).toHaveLength(2);
  });
});

describe("sortPeopleByFollowUpPriority", () => {
  it("orders overdue before not-due before no-metadata", () => {
    const people = [
      samplePerson({
        id: "c",
        name: "Casey",
        lastContactDate: undefined,
        contactCadenceDays: undefined,
      }),
      samplePerson({
        id: "b",
        name: "Blake",
        lastContactDate: "2026-05-20",
        contactCadenceDays: 14,
      }),
      samplePerson({
        id: "a",
        name: "Alex",
        lastContactDate: "2026-05-01",
        contactCadenceDays: 14,
      }),
    ];

    const sorted = sortPeopleByFollowUpPriority(people, "2026-05-26");
    expect(sorted.map((p) => p.name)).toEqual(["Alex", "Blake", "Casey"]);
  });
});

describe("sortPeopleByRecentContact", () => {
  it("orders by lastContactDate desc with missing dates last", () => {
    const people = [
      samplePerson({ id: "c", name: "Casey", lastContactDate: undefined }),
      samplePerson({ id: "a", name: "Alex", lastContactDate: "2026-05-01" }),
      samplePerson({ id: "b", name: "Blake", lastContactDate: "2026-05-20" }),
    ];

    const sorted = sortPeopleByRecentContact(people);
    expect(sorted.map((p) => p.name)).toEqual(["Blake", "Alex", "Casey"]);
  });
});

describe("getPersonBirthdayStatus", () => {
  it("returns urgency for upcoming birthday", () => {
    const status = getPersonBirthdayStatus(samplePerson(), "2026-05-26");
    expect(status?.nextDateKey).toBe("2026-06-15");
    expect(status?.urgencyLabel).toBe("In 20 days");
  });

  it("returns null when no birthday", () => {
    expect(getPersonBirthdayStatus(samplePerson({ birthdayMonthDay: undefined }), "2026-05-26")).toBe(
      null
    );
  });
});

describe("getPersonFollowUpStatus", () => {
  it("marks overdue contacts", () => {
    const status = getPersonFollowUpStatus(samplePerson(), "2026-05-26");
    expect(status?.needsFollowUp).toBe(true);
    expect(status?.daysOverdue).toBe(11);
  });

  it("returns not overdue exactly on cadence day", () => {
    const status = getPersonFollowUpStatus(
      samplePerson({ lastContactDate: "2026-05-12", contactCadenceDays: 14 }),
      "2026-05-26"
    );
    expect(status?.needsFollowUp).toBe(true);
    expect(status?.daysOverdue).toBe(0);
  });

  it("returns null without tracking fields", () => {
    expect(
      getPersonFollowUpStatus(
        samplePerson({ lastContactDate: undefined, contactCadenceDays: undefined }),
        "2026-05-26"
      )
    ).toBe(null);
  });
});

describe("filterAndSortPeople", () => {
  it("filters then sorts", () => {
    const people = [
      samplePerson({ id: "a", name: "Alex", likes: "Coffee" }),
      samplePerson({ id: "b", name: "Blake", likes: "Tea" }),
    ];

    const result = filterAndSortPeople(people, {
      query: "tea",
      sortMode: "name",
      todayKey: "2026-05-26",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Blake");
  });
});
