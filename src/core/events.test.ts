import { describe, expect, it } from "vitest";
import { validatePayloadForUpload } from "./dbMappers";
import {
  cleanupInvalidEventRecurrence,
  cleanupOrphanedEventPersonRefs,
  migrateLegacyEventTypes,
} from "./events";
import type { LifeEvent, Person } from "./model";
import { defaultPayload } from "./state";

const NOW = "2026-05-26T12:00:00.000Z";
const EVENT_ID = "77777777-7777-4777-8777-777777777777";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const ORPHAN_PERSON_ID = "99999999-9999-4999-8999-999999999999";

function sampleEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: EVENT_ID,
    title: "Dinner",
    date: "2026-06-15",
    type: "other",
    reminder: false,
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function samplePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: "Alex",
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("migrateLegacyEventTypes", () => {
  it("renames deadline events to school", () => {
    const payload = {
      ...defaultPayload(),
      events: [sampleEvent({ type: "deadline" as LifeEvent["type"] })],
    };

    const migrated = migrateLegacyEventTypes(payload);

    expect(migrated.events[0].type).toBe("school");
    expect(() => validatePayloadForUpload(migrated)).not.toThrow();
  });
});

describe("cleanupOrphanedEventPersonRefs", () => {
  it("clears personId when the person is missing but keeps the event", () => {
    const payload = {
      ...defaultPayload(),
      people: [],
      events: [sampleEvent({ personId: ORPHAN_PERSON_ID, personName: "Ghost" })],
    };

    const cleaned = cleanupOrphanedEventPersonRefs(payload);

    expect(cleaned.events[0].personId).toBeUndefined();
    expect(cleaned.events[0].personName).toBe("Ghost");
    expect(() => validatePayloadForUpload(cleaned)).not.toThrow();
  });

  it("keeps personId when the person exists", () => {
    const payload = {
      ...defaultPayload(),
      people: [samplePerson()],
      events: [sampleEvent({ personId: PERSON_ID })],
    };

    const cleaned = cleanupOrphanedEventPersonRefs(payload);
    expect(cleaned).toBe(payload);
    expect(cleaned.events[0].personId).toBe(PERSON_ID);
  });
});

describe("cleanupInvalidEventRecurrence", () => {
  it("drops invalid recurrence rules from legacy payloads", () => {
    const payload = {
      ...defaultPayload(),
      events: [
        sampleEvent({
          recurrence: {
            anchorDate: "2026-02-30",
            frequency: "daily",
          },
        }),
      ],
    };

    const cleaned = cleanupInvalidEventRecurrence(payload);

    expect(cleaned.events[0].recurrence).toBeUndefined();
    expect(() => validatePayloadForUpload(cleaned)).not.toThrow();
  });
});
