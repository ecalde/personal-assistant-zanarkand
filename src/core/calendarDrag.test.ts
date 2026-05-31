import { describe, expect, it } from "vitest";
import type { CalendarItem } from "./calendar";
import {
  canDragCalendarItem,
  computeRescheduleTarget,
  minutesFromPointerDelta,
  originStartMinutesForItem,
  snapMinutes,
} from "./calendarDrag";

function makeTimedEventItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "event:e1",
    sourceType: "event",
    sourceId: "e1",
    title: "Meeting",
    date: "2026-05-28",
    allDay: false,
    categoryKey: "event",
    subcategoryKey: "other",
    isTimed: true,
    isMultiDay: false,
    startTime: "09:00",
    endTime: "10:00",
    sourceMeta: {
      kind: "lifeEvent",
      eventId: "e1",
      eventType: "other",
      reminder: false,
    },
    ...overrides,
  };
}

describe("snapMinutes", () => {
  it("snaps to 15-minute grid", () => {
    expect(snapMinutes(0)).toBe(0);
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(52)).toBe(45);
    expect(snapMinutes(53)).toBe(60);
  });
});

describe("minutesFromPointerDelta", () => {
  it("converts pixels to minutes", () => {
    expect(minutesFromPointerDelta(48, 48 / 60)).toBe(60);
    expect(minutesFromPointerDelta(0, 1)).toBe(0);
  });
});

describe("canDragCalendarItem", () => {
  it("allows one-time timed life events", () => {
    expect(canDragCalendarItem(makeTimedEventItem())).toBe(true);
  });

  it("rejects recurring occurrences", () => {
    expect(
      canDragCalendarItem(
        makeTimedEventItem({
          id: "event:e1:2026-05-28",
          sourceMeta: {
            kind: "lifeEvent",
            eventId: "e1",
            eventType: "other",
            reminder: false,
            recurrenceDate: "2026-05-28",
          },
        })
      )
    ).toBe(false);
  });

  it("rejects all-day and non-event items", () => {
    expect(canDragCalendarItem(makeTimedEventItem({ isTimed: false, startTime: undefined }))).toBe(
      false
    );
    expect(
      canDragCalendarItem(
        makeTimedEventItem({
          sourceType: "skill",
          sourceMeta: {
            kind: "skillScheduleBlock",
            skillId: "s1",
            blockId: "b1",
            skillName: "Math",
            plannedMinutes: 60,
          },
        })
      )
    ).toBe(false);
  });
});

describe("computeRescheduleTarget", () => {
  it("snaps vertical drag and preserves duration", () => {
    const item = makeTimedEventItem();
    const target = computeRescheduleTarget({
      item,
      originDateKey: "2026-05-28",
      originStartMinutes: originStartMinutesForItem(item),
      targetDateKey: "2026-05-29",
      deltaYMinutes: 30,
    });

    expect(target).toEqual({
      dateKey: "2026-05-29",
      startTime: "09:30",
      endTime: "10:30",
    });
  });

  it("returns null for non-draggable items", () => {
    const item = makeTimedEventItem({ isTimed: false, startTime: undefined });
    expect(
      computeRescheduleTarget({
        item,
        originDateKey: "2026-05-28",
        originStartMinutes: 0,
        targetDateKey: "2026-05-29",
        deltaYMinutes: 30,
      })
    ).toBeNull();
  });
});
