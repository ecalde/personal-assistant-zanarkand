import { describe, expect, it } from "vitest";
import type { LifeEvent } from "./model";
import {
  compareLifeEventsWithinDay,
  buildUpcomingEventItems,
  formatUpcomingEventUrgencyLabel,
  partitionEventsByToday,
  sortPastEvents,
  sortUpcomingEvents,
} from "./events";

const NOW = "2026-05-26T12:00:00.000Z";
const TODAY = "2026-05-27";

function event(
  id: string,
  date: string,
  title: string,
  startTime?: string,
  endTime?: string
): LifeEvent {
  return {
    id,
    title,
    date,
    type: "other",
    startTime,
    endTime,
    reminder: false,
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
}

describe("compareLifeEventsWithinDay", () => {
  it("sorts timed events before untimed events", () => {
    const timed = event("1", TODAY, "Morning", "09:00");
    const untimed = event("2", TODAY, "All day");
    expect(compareLifeEventsWithinDay(timed, untimed)).toBeLessThan(0);
    expect(compareLifeEventsWithinDay(untimed, timed)).toBeGreaterThan(0);
  });

  it("sorts timed events by startTime ascending", () => {
    const early = event("1", TODAY, "Early", "09:00");
    const late = event("2", TODAY, "Late", "14:00");
    expect(compareLifeEventsWithinDay(early, late)).toBeLessThan(0);
  });

  it("uses title then id as tiebreaker for untimed events", () => {
    const alpha = event("b", TODAY, "Alpha");
    const beta = event("a", TODAY, "Beta");
    expect(compareLifeEventsWithinDay(alpha, beta)).toBeLessThan(0);
  });
});

describe("sortUpcomingEvents", () => {
  it("sorts by date ascending then within-day rules", () => {
    const sorted = sortUpcomingEvents([
      event("4", "2026-05-29", "Later day"),
      event("3", TODAY, "Untimed"),
      event("2", TODAY, "Timed late", "14:00"),
      event("1", TODAY, "Timed early", "09:00"),
      event("5", "2026-05-28", "Tomorrow"),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["1", "2", "3", "5", "4"]);
  });
});

describe("sortPastEvents", () => {
  it("sorts by date descending then within-day rules", () => {
    const sorted = sortPastEvents([
      event("3", "2026-05-20", "Untimed"),
      event("2", "2026-05-20", "Timed late", "14:00"),
      event("1", "2026-05-20", "Timed early", "09:00"),
      event("4", "2026-05-21", "Recent day"),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["4", "1", "2", "3"]);
  });
});

describe("partitionEventsByToday", () => {
  it("partitions and sorts upcoming and past lists", () => {
    const { upcoming, past } = partitionEventsByToday(
      [
        event("1", TODAY, "Today timed", "10:00"),
        event("2", "2026-05-26", "Yesterday"),
        event("3", "2026-05-28", "Future"),
      ],
      TODAY
    );

    expect(upcoming.map((item) => item.id)).toEqual(["1", "3"]);
    expect(past.map((item) => item.id)).toEqual(["2"]);
  });
});

describe("formatUpcomingEventUrgencyLabel", () => {
  it("returns Today, Tomorrow, or In X days", () => {
    expect(formatUpcomingEventUrgencyLabel(0)).toBe("Today");
    expect(formatUpcomingEventUrgencyLabel(1)).toBe("Tomorrow");
    expect(formatUpcomingEventUrgencyLabel(5)).toBe("In 5 days");
  });
});

describe("buildUpcomingEventItems", () => {
  it("includes events from today through today+windowDays inclusive", () => {
    const items = buildUpcomingEventItems(
      [
        event("past", "2026-05-26", "Past"),
        event("today", TODAY, "Today"),
        event("end", "2026-06-10", "Day 14"),
        event("beyond", "2026-06-11", "Day 15"),
      ],
      TODAY,
      14,
      10
    );

    expect(items.map((item) => item.event.id)).toEqual(["today", "end"]);
  });

  it("assigns urgency labels based on days until event", () => {
    const items = buildUpcomingEventItems(
      [
        event("today", TODAY, "Today"),
        event("tomorrow", "2026-05-28", "Tomorrow"),
        event("later", "2026-05-30", "Later"),
      ],
      TODAY,
      14,
      10
    );

    expect(items.map((item) => item.urgencyLabel)).toEqual([
      "Today",
      "Tomorrow",
      "In 3 days",
    ]);
  });

  it("sorts using upcoming rules and caps at maxItems", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      event(String(index), addDays(TODAY, index), `Event ${index}`)
    );

    const items = buildUpcomingEventItems(many, TODAY, 14, 10);

    expect(items).toHaveLength(10);
    expect(items.map((item) => item.event.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  it("sorts timed events before untimed on the same day", () => {
    const items = buildUpcomingEventItems(
      [
        event("untimed", TODAY, "All day"),
        event("timed", TODAY, "Morning", "09:00"),
      ],
      TODAY,
      14,
      10
    );

    expect(items.map((item) => item.event.id)).toEqual(["timed", "untimed"]);
  });

  it("skips events with unparseable dates", () => {
    const items = buildUpcomingEventItems(
      [event("bad", "not-a-date", "Bad date"), event("ok", TODAY, "Ok")],
      TODAY,
      14,
      10
    );

    expect(items.map((item) => item.event.id)).toEqual(["ok"]);
  });
});

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
