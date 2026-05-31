import { describe, expect, it } from "vitest";
import type { LifeEvent } from "./model";
import {
  detachOccurrenceAsOneTimeEvent,
  listOccurrenceDates,
  moveOccurrenceAtDate,
  skipOccurrenceAtDate,
  truncateRecurringEventBeforeDate,
  upsertRecurrenceException,
} from "./eventOccurrences";
import { expandRecurrenceInstances, type RecurrenceRule } from "./recurrence";

const NOW = "2026-05-29T12:00:00.000Z";

function makeEvent(overrides: Partial<LifeEvent> & Pick<LifeEvent, "id" | "title" | "date">): LifeEvent {
  return {
    type: "other",
    reminder: false,
    createdAtIso: "2026-01-01T00:00:00.000Z",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function weeklyWed(): RecurrenceRule {
  return { anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] };
}

describe("upsertRecurrenceException", () => {
  it("replaces an existing exception on the same date (last-wins)", () => {
    const rule = weeklyWed();
    const withSkip = upsertRecurrenceException(rule, { kind: "skip", date: "2026-01-14" });
    const withOverride = upsertRecurrenceException(withSkip, {
      kind: "override",
      date: "2026-01-14",
      overrideDate: "2026-01-16",
    });
    expect(withOverride.exceptions).toEqual([
      { kind: "override", date: "2026-01-14", overrideDate: "2026-01-16" },
    ]);
  });
});

describe("skipOccurrenceAtDate", () => {
  it("removes the instance from expansion", () => {
    const event = makeEvent({
      id: "e1",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });
    const frozen = structuredClone(event);

    const updated = skipOccurrenceAtDate(event, "2026-01-14", NOW);
    expect(event).toEqual(frozen);
    expect(updated.recurrence?.exceptions).toEqual([{ kind: "skip", date: "2026-01-14" }]);

    const keys = listOccurrenceDates(updated, "2026-01-01", "2026-02-01");
    expect(keys).not.toContain("2026-01-14");
    expect(keys).toContain("2026-01-07");
    expect(keys).toContain("2026-01-21");
  });

  it("returns unchanged copy for non-recurring events", () => {
    const event = makeEvent({ id: "e1", title: "Once", date: "2026-01-07" });
    const updated = skipOccurrenceAtDate(event, "2026-01-07", NOW);
    expect(updated).toEqual(event);
    expect(updated).not.toBe(event);
  });
});

describe("moveOccurrenceAtDate", () => {
  it("moves an occurrence and marks it as an exception in expansion", () => {
    const event = makeEvent({
      id: "e1",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    const updated = moveOccurrenceAtDate(event, "2026-01-14", "2026-01-16", NOW);
    const instances = expandRecurrenceInstances(updated.recurrence!, "2026-01-01", "2026-02-01");
    const moved = instances.find((inst) => inst.originalDate === "2026-01-14");
    expect(moved).toMatchObject({
      date: "2026-01-16",
      originalDate: "2026-01-14",
      isException: true,
    });
  });
});

describe("truncateRecurringEventBeforeDate", () => {
  it("preserves past occurrences and ends the day before fromDate", () => {
    const event = makeEvent({
      id: "e1",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    const updated = truncateRecurringEventBeforeDate(event, "2026-07-01", NOW);
    expect(updated).not.toBeNull();
    expect(updated!.recurrence?.end).toEqual({ kind: "onDate", endDate: "2026-06-30" });

    const keys = listOccurrenceDates(updated!, "2026-01-01", "2026-12-31");
    expect(keys.every((key) => key < "2026-07-01")).toBe(true);
    expect(keys).toContain("2026-01-07");
    expect(keys).not.toContain("2026-07-01");
  });

  it("returns null when truncating at or before the first occurrence", () => {
    const event = makeEvent({
      id: "e1",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    expect(truncateRecurringEventBeforeDate(event, "2026-01-07", NOW)).toBeNull();
    expect(truncateRecurringEventBeforeDate(event, "2026-01-01", NOW)).toBeNull();
  });
});

describe("detachOccurrenceAsOneTimeEvent", () => {
  it("skips the parent occurrence and creates a one-time detached event", () => {
    const parent = makeEvent({
      id: "e1",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
      seriesId: "series-1",
    });

    const edited = makeEvent({
      id: "e1",
      title: "Tennis (special)",
      date: "2026-01-14",
      startTime: "18:00",
      recurrence: weeklyWed(),
    });

    const { parentEvent, detachedEvent } = detachOccurrenceAsOneTimeEvent({
      parent,
      occurrenceDate: "2026-01-14",
      editedEvent: edited,
      detachedId: "detached-1",
      nowIso: NOW,
    });

    expect(parentEvent.recurrence?.exceptions).toEqual([{ kind: "skip", date: "2026-01-14" }]);
    expect(detachedEvent.id).toBe("detached-1");
    expect(detachedEvent.title).toBe("Tennis (special)");
    expect(detachedEvent.date).toBe("2026-01-14");
    expect(detachedEvent.startTime).toBe("18:00");
    expect(detachedEvent.recurrence).toBeUndefined();
    expect(detachedEvent.seriesId).toBeUndefined();

    const parentKeys = listOccurrenceDates(parentEvent, "2026-01-01", "2026-02-01");
    expect(parentKeys).not.toContain("2026-01-14");
  });
});
