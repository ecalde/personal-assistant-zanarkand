import { describe, expect, it } from "vitest";
import type { LifeEvent } from "./model";
import { getRecurrenceDateKeys, type RecurrenceRule } from "./recurrence";
import { isRecurringLifeEvent, splitEventSeriesAtDate } from "./eventSeries";

const NOW = "2026-05-29T12:00:00.000Z";
const SERIES_ID = "series-aaa";
const AFTER_ID = "event-after";

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

describe("splitEventSeriesAtDate", () => {
  it("truncates before event to onDate(D-1) and creates after event with new id and shared seriesId", () => {
    const original = makeEvent({
      id: "event-original",
      title: "Tennis",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    const edited = makeEvent({
      id: "event-original",
      title: "Tennis (evening)",
      date: "2026-07-03",
      startTime: "18:00",
      recurrence: { anchorDate: "2026-07-03", frequency: "weekly", byWeekdays: ["fri"] },
    });

    const frozen = structuredClone(original);
    const { beforeEvent, afterEvent } = splitEventSeriesAtDate({
      original,
      splitDate: "2026-07-01",
      editedEvent: edited,
      seriesId: SERIES_ID,
      afterEventId: AFTER_ID,
      nowIso: NOW,
    });

    expect(original).toEqual(frozen);
    expect(beforeEvent).toBeDefined();
    expect(beforeEvent!.id).toBe("event-original");
    expect(beforeEvent!.seriesId).toBe(SERIES_ID);
    expect(beforeEvent!.updatedAtIso).toBe(NOW);
    expect(beforeEvent!.recurrence?.end).toEqual({ kind: "onDate", endDate: "2026-06-30" });

    const beforeKeys = getRecurrenceDateKeys(beforeEvent!.recurrence!, "2026-01-01", "2026-12-31");
    expect(beforeKeys.every((key) => key < "2026-07-01")).toBe(true);
    expect(beforeKeys).toContain("2026-01-07");

    expect(afterEvent.id).toBe(AFTER_ID);
    expect(afterEvent.title).toBe("Tennis (evening)");
    expect(afterEvent.startTime).toBe("18:00");
    expect(afterEvent.seriesId).toBe(SERIES_ID);
    expect(afterEvent.createdAtIso).toBe(NOW);

    const afterKeys = getRecurrenceDateKeys(afterEvent.recurrence!, "2026-01-01", "2026-12-31");
    expect(afterKeys[0]).toBe("2026-07-03");
    expect(afterKeys.every((key) => key >= "2026-07-01")).toBe(true);
    expect(beforeKeys.some((key) => afterKeys.includes(key))).toBe(false);
  });

  it("reflects weekly cadence change from Wednesday to Friday in the after half", () => {
    const original = makeEvent({
      id: "event-original",
      title: "Practice",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    const edited = makeEvent({
      id: "event-original",
      title: "Practice",
      date: "2026-07-03",
      recurrence: { anchorDate: "2026-07-03", frequency: "weekly", byWeekdays: ["fri"] },
    });

    const { afterEvent } = splitEventSeriesAtDate({
      original,
      splitDate: "2026-07-01",
      editedEvent: edited,
      seriesId: SERIES_ID,
      afterEventId: AFTER_ID,
      nowIso: NOW,
    });

    expect(afterEvent.recurrence?.byWeekdays).toEqual(["fri"]);
    expect(getRecurrenceDateKeys(afterEvent.recurrence!, "2026-07-01", "2026-07-31")).toEqual([
      "2026-07-03",
      "2026-07-10",
      "2026-07-17",
      "2026-07-24",
      "2026-07-31",
    ]);
  });

  it("omits beforeEvent when splitDate is at or before the first occurrence", () => {
    const original = makeEvent({
      id: "event-original",
      title: "Weekly",
      date: "2026-01-07",
      recurrence: weeklyWed(),
    });

    const edited = makeEvent({
      id: "event-original",
      title: "Weekly renamed",
      date: "2026-01-07",
      recurrence: { anchorDate: "2026-01-07", frequency: "weekly", byWeekdays: ["wed"] },
    });

    const atFirst = splitEventSeriesAtDate({
      original,
      splitDate: "2026-01-07",
      editedEvent: edited,
      seriesId: SERIES_ID,
      afterEventId: AFTER_ID,
      nowIso: NOW,
    });
    expect(atFirst.beforeEvent).toBeUndefined();
    expect(atFirst.afterEvent.id).toBe(AFTER_ID);

    const beforeFirst = splitEventSeriesAtDate({
      original,
      splitDate: "2026-01-01",
      editedEvent: edited,
      seriesId: SERIES_ID,
      afterEventId: "event-after-2",
      nowIso: NOW,
    });
    expect(beforeFirst.beforeEvent).toBeUndefined();
  });

  it("returns replace-only result for non-recurring originals", () => {
    const original = makeEvent({
      id: "event-one",
      title: "One-time",
      date: "2026-05-10",
    });

    const edited = makeEvent({
      id: "event-one",
      title: "One-time updated",
      date: "2026-05-11",
    });

    const { beforeEvent, afterEvent } = splitEventSeriesAtDate({
      original,
      splitDate: "2026-05-11",
      editedEvent: edited,
      seriesId: SERIES_ID,
      afterEventId: AFTER_ID,
      nowIso: NOW,
    });

    expect(beforeEvent).toBeUndefined();
    expect(afterEvent.id).toBe(AFTER_ID);
    expect(afterEvent.title).toBe("One-time updated");
    expect(afterEvent.recurrence).toBeUndefined();
    expect(afterEvent.seriesId).toBeUndefined();
  });
});

describe("isRecurringLifeEvent", () => {
  it("detects recurring vs one-time events", () => {
    expect(
      isRecurringLifeEvent(
        makeEvent({ id: "a", title: "A", date: "2026-01-01", recurrence: weeklyWed() })
      )
    ).toBe(true);
    expect(isRecurringLifeEvent(makeEvent({ id: "b", title: "B", date: "2026-01-01" }))).toBe(
      false
    );
  });
});
