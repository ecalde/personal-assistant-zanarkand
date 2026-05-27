import { describe, expect, it } from "vitest";
import type { LifeEvent } from "./model";
import {
  compareLifeEventsWithinDay,
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
