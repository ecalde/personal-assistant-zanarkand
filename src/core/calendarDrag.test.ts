import { describe, expect, it } from "vitest";
import type { CalendarItem } from "./calendar";
import {
  buildEventDraftFromCalendarSelection,
  canDragCalendarItem,
  canDragCalendarItemInMonth,
  canResizeCalendarItem,
  computeMonthDropTarget,
  computeRescheduleTarget,
  computeResizeTarget,
  minutesFromPointerDelta,
  originEndMinutesForItem,
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

function makeRecurringItem(): CalendarItem {
  return makeTimedEventItem({
    id: "event:e1:2026-05-28",
    sourceMeta: {
      kind: "lifeEvent",
      eventId: "e1",
      eventType: "other",
      reminder: false,
      recurrenceDate: "2026-05-28",
    },
  });
}

function makeSkillItem(): CalendarItem {
  return makeTimedEventItem({
    sourceType: "skill",
    sourceMeta: {
      kind: "skillScheduleBlock",
      skillId: "s1",
      blockId: "b1",
      skillName: "Math",
      plannedMinutes: 60,
    },
  });
}

describe("canDragCalendarItemInMonth", () => {
  it("allows one-time timed life events", () => {
    expect(canDragCalendarItemInMonth(makeTimedEventItem())).toBe(true);
  });

  it("allows one-time all-day life events", () => {
    expect(
      canDragCalendarItemInMonth(
        makeTimedEventItem({ isTimed: false, allDay: true, startTime: undefined, endTime: undefined })
      )
    ).toBe(true);
  });

  it("rejects recurring occurrences, skills, and workouts", () => {
    expect(canDragCalendarItemInMonth(makeRecurringItem())).toBe(false);
    expect(canDragCalendarItemInMonth(makeSkillItem())).toBe(false);
  });
});

describe("computeMonthDropTarget", () => {
  it("returns the new date for an eligible move", () => {
    expect(
      computeMonthDropTarget({
        item: makeTimedEventItem(),
        originDateKey: "2026-05-28",
        targetDateKey: "2026-06-02",
      })
    ).toEqual({ dateKey: "2026-06-02" });
  });

  it("returns null when dropping on the same date", () => {
    expect(
      computeMonthDropTarget({
        item: makeTimedEventItem(),
        originDateKey: "2026-05-28",
        targetDateKey: "2026-05-28",
      })
    ).toBeNull();
  });

  it("returns null for recurring occurrences", () => {
    expect(
      computeMonthDropTarget({
        item: makeRecurringItem(),
        originDateKey: "2026-05-28",
        targetDateKey: "2026-06-02",
      })
    ).toBeNull();
  });
});

describe("canResizeCalendarItem", () => {
  it("mirrors week drag eligibility", () => {
    expect(canResizeCalendarItem(makeTimedEventItem())).toBe(true);
    expect(canResizeCalendarItem(makeRecurringItem())).toBe(false);
    expect(canResizeCalendarItem(makeSkillItem())).toBe(false);
  });
});

describe("originEndMinutesForItem", () => {
  it("reads the end time", () => {
    expect(originEndMinutesForItem(makeTimedEventItem())).toBe(600);
  });

  it("falls back to start + minimum duration when end is missing", () => {
    expect(originEndMinutesForItem(makeTimedEventItem({ endTime: undefined }))).toBe(540 + 15);
  });
});

describe("computeResizeTarget", () => {
  it("snaps the end time and keeps the start fixed", () => {
    const item = makeTimedEventItem();
    expect(
      computeResizeTarget({
        item,
        originEndMinutes: originEndMinutesForItem(item),
        deltaYMinutes: 38,
      })
    ).toEqual({ endTime: "10:45" });
  });

  it("returns null when the new end would not be after the start", () => {
    const item = makeTimedEventItem();
    expect(
      computeResizeTarget({
        item,
        originEndMinutes: originEndMinutesForItem(item),
        deltaYMinutes: -120,
      })
    ).toBeNull();
  });

  it("returns null for recurring items", () => {
    const item = makeRecurringItem();
    expect(
      computeResizeTarget({
        item,
        originEndMinutes: originEndMinutesForItem(item),
        deltaYMinutes: 30,
      })
    ).toBeNull();
  });
});

describe("buildEventDraftFromCalendarSelection", () => {
  it("builds a date-only seed", () => {
    expect(buildEventDraftFromCalendarSelection({ dateKey: "2026-05-28" })).toEqual({
      date: "2026-05-28",
    });
  });

  it("snaps and validates a time range", () => {
    expect(
      buildEventDraftFromCalendarSelection({
        dateKey: "2026-05-28",
        startMinutes: 547,
        endMinutes: 597,
      })
    ).toEqual({ date: "2026-05-28", startTime: "09:00", endTime: "10:00" });
  });

  it("enforces a minimum span when the range is too small", () => {
    expect(
      buildEventDraftFromCalendarSelection({
        dateKey: "2026-05-28",
        startMinutes: 540,
        endMinutes: 540,
      })
    ).toEqual({ date: "2026-05-28", startTime: "09:00", endTime: "09:15" });
  });

  it("returns null without a date key", () => {
    expect(buildEventDraftFromCalendarSelection({ dateKey: "" })).toBeNull();
  });
});
