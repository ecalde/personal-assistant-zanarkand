import { describe, expect, it } from "vitest";
import {
  buildCalendarItemsForRange,
  groupCalendarItemsByDate,
  type CalendarItem,
} from "./calendar";
import { resolveCalendarItemColor } from "./calendarColors";
import {
  buildMonthGrid,
  buildWeekGrid,
  computeMonthVisibleRange,
  computeTimedItemLayout,
  computeTimedOverlapLayouts,
  computeWeekRange,
  filterItemsByHiddenCategories,
  formatHourLabel,
  formatItemTimeLabel,
  laneGeometry,
  limitDayItems,
  monthAnchorFromKey,
  shiftMonth,
  shiftWeek,
  splitDayItems,
  timedItemsOverlapMinutes,
  TIMED_BLOCK_HORIZONTAL_INSET_PERCENT,
} from "./calendarView";
import type { CalendarCategoryKey } from "./calendarColors";
import type { LifeEvent, Skill, WeeklySchedule } from "./model";

function emptySchedule(): WeeklySchedule {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function makeEventItem(overrides: Partial<CalendarItem> & { id: string }): CalendarItem {
  return {
    sourceType: "event",
    sourceId: overrides.id,
    title: "Item",
    date: "2026-05-26",
    categoryKey: "event",
    isTimed: false,
    isMultiDay: false,
    sourceMeta: { kind: "lifeEvent", eventId: overrides.id, eventType: "other", reminder: false },
    ...overrides,
  };
}

describe("month range + grid", () => {
  it("computes a 6-week visible range starting on a Sunday", () => {
    // May 2026: the 1st is a Friday.
    const range = computeMonthVisibleRange("2026-05-10");
    expect(range.startDate).toBe("2026-04-26"); // Sunday before May 1
    expect(range.endDate).toBe("2026-06-06"); // 42 days total
  });

  it("builds a 6x7 grid with correct in-month and today flags", () => {
    const weeks = buildMonthGrid("2026-05-01", "2026-05-28");
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);

    const flat = weeks.flatMap((w) => w.days);
    // First cell is the trailing Sunday from April.
    expect(flat[0].dateKey).toBe("2026-04-26");
    expect(flat[0].inCurrentMonth).toBe(false);

    const may1 = flat.find((d) => d.dateKey === "2026-05-01")!;
    expect(may1.inCurrentMonth).toBe(true);
    expect(may1.dayNumber).toBe(1);

    const today = flat.find((d) => d.isToday);
    expect(today?.dateKey).toBe("2026-05-28");

    // Trailing days belong to June.
    const lastCell = flat[flat.length - 1];
    expect(lastCell.dateKey).toBe("2026-06-06");
    expect(lastCell.inCurrentMonth).toBe(false);
  });

  it("normalizes any date to its month anchor", () => {
    expect(monthAnchorFromKey("2026-05-28")).toBe("2026-05-01");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-01");
  });
});

describe("week range + grid", () => {
  it("computes a Sunday-to-Saturday week range", () => {
    // 2026-05-28 is a Thursday.
    const range = computeWeekRange("2026-05-28");
    expect(range.startDate).toBe("2026-05-24"); // Sunday
    expect(range.endDate).toBe("2026-05-30"); // Saturday
  });

  it("builds 7 columns and highlights today", () => {
    const columns = buildWeekGrid("2026-05-28", "2026-05-28");
    expect(columns).toHaveLength(7);
    expect(columns[0].label).toBe("Sun");
    expect(columns[6].label).toBe("Sat");
    const today = columns.find((c) => c.isToday)!;
    expect(today.dateKey).toBe("2026-05-28");
    expect(today.label).toBe("Thu");
  });

  it("shifts weeks by 7 days", () => {
    expect(shiftWeek("2026-05-28", 1)).toBe("2026-06-04");
    expect(shiftWeek("2026-05-28", -1)).toBe("2026-05-21");
  });
});

describe("category filtering (render-only)", () => {
  it("removes items whose category is hidden", () => {
    const items: CalendarItem[] = [
      makeEventItem({ id: "e1", categoryKey: "event" }),
      makeEventItem({ id: "s1", categoryKey: "skill", sourceType: "skill" }),
      makeEventItem({ id: "p1", categoryKey: "people", sourceType: "people" }),
    ];
    const hidden = new Set<CalendarCategoryKey>(["skill", "people"]);
    const filtered = filterItemsByHiddenCategories(items, hidden);
    expect(filtered.map((i) => i.id)).toEqual(["e1"]);
  });

  it("returns the same list when nothing is hidden", () => {
    const items = [makeEventItem({ id: "e1" })];
    expect(filterItemsByHiddenCategories(items, new Set())).toBe(items);
  });
});

describe("day item layout", () => {
  it("splits all-day from timed items", () => {
    const items: CalendarItem[] = [
      makeEventItem({ id: "a", isTimed: false }),
      makeEventItem({ id: "t", isTimed: true, startTime: "09:00" }),
    ];
    const { allDay, timed } = splitDayItems(items);
    expect(allDay.map((i) => i.id)).toEqual(["a"]);
    expect(timed.map((i) => i.id)).toEqual(["t"]);
  });

  it("limits visible items and reports overflow", () => {
    const items = [1, 2, 3, 4, 5].map((n) => makeEventItem({ id: `i${n}` }));
    const { visible, overflowCount } = limitDayItems(items, 3);
    expect(visible).toHaveLength(3);
    expect(overflowCount).toBe(2);
  });

  it("computes timed layout with a minimum height for start-only items", () => {
    const startOnly = makeEventItem({ id: "s", isTimed: true, startTime: "08:00" });
    const layout = computeTimedItemLayout(startOnly);
    expect(layout.topMinutes).toBe(480);
    expect(layout.durationMinutes).toBeGreaterThanOrEqual(30);
    expect(layout.laneCount).toBe(1);
    expect(layout.widthPercent).toBe(100 - TIMED_BLOCK_HORIZONTAL_INSET_PERCENT * 2);

    const ranged = makeEventItem({
      id: "r",
      isTimed: true,
      startTime: "09:00",
      endTime: "10:30",
    });
    expect(computeTimedItemLayout(ranged)).toEqual({
      topMinutes: 540,
      durationMinutes: 90,
      laneIndex: 0,
      laneCount: 1,
      leftPercent: TIMED_BLOCK_HORIZONTAL_INSET_PERCENT,
      widthPercent: 100 - TIMED_BLOCK_HORIZONTAL_INSET_PERCENT * 2,
      zIndex: 1,
    });
  });
});

describe("timed overlap layout", () => {
  function timed(
    id: string,
    startTime: string,
    endTime: string
  ): CalendarItem {
    return makeEventItem({ id, isTimed: true, startTime, endTime });
  }

  function layoutFor(items: CalendarItem[], id: string): ReturnType<typeof computeTimedItemLayout> {
    const layouts = computeTimedOverlapLayouts(items);
    const layout = layouts.get(id);
    expect(layout).toBeDefined();
    return layout!;
  }

  it("detects overlap with exclusive end boundaries", () => {
    expect(timedItemsOverlapMinutes(540, 600, 600, 660)).toBe(false);
    expect(timedItemsOverlapMinutes(540, 601, 600, 660)).toBe(true);
  });

  it("gives non-overlapping timed events full width", () => {
    const items = [timed("a", "09:00", "10:00"), timed("b", "10:00", "11:00")];
    const layoutA = layoutFor(items, "a");
    const layoutB = layoutFor(items, "b");

    expect(layoutA.laneCount).toBe(1);
    expect(layoutB.laneCount).toBe(1);
    expect(layoutA.widthPercent).toBe(100 - TIMED_BLOCK_HORIZONTAL_INSET_PERCENT * 2);
    expect(layoutB.widthPercent).toBe(100 - TIMED_BLOCK_HORIZONTAL_INSET_PERCENT * 2);
  });

  it("splits two overlapping events into two lanes", () => {
    const items = [timed("a", "09:00", "10:30"), timed("b", "10:00", "11:00")];
    const layoutA = layoutFor(items, "a");
    const layoutB = layoutFor(items, "b");

    expect(layoutA.laneCount).toBe(2);
    expect(layoutB.laneCount).toBe(2);
    expect(layoutA.laneIndex).toBe(0);
    expect(layoutB.laneIndex).toBe(1);
    expect(layoutA.leftPercent).toBeLessThan(layoutB.leftPercent);
    expect(layoutA.widthPercent + layoutB.widthPercent).toBeLessThan(100);
  });

  it("splits three overlapping events into three lanes", () => {
    const items = [
      timed("a", "09:00", "10:00"),
      timed("b", "09:30", "10:30"),
      timed("c", "09:45", "10:15"),
    ];
    const layouts = computeTimedOverlapLayouts(items);

    expect(layouts.get("a")!.laneCount).toBe(3);
    expect(layouts.get("b")!.laneCount).toBe(3);
    expect(layouts.get("c")!.laneCount).toBe(3);
    expect(new Set([...layouts.values()].map((l) => l.laneIndex))).toEqual(new Set([0, 1, 2]));
  });

  it("keeps partial overlap groups side-by-side without covering", () => {
    const items = [
      timed("early", "08:00", "09:00"),
      timed("mid", "09:00", "10:00"),
      timed("late", "09:30", "10:30"),
    ];
    const layoutEarly = layoutFor(items, "early");
    const layoutMid = layoutFor(items, "mid");
    const layoutLate = layoutFor(items, "late");

    expect(layoutEarly.laneCount).toBe(1);
    expect(layoutMid.laneCount).toBe(2);
    expect(layoutLate.laneCount).toBe(2);
    expect(layoutEarly.widthPercent).toBe(100 - TIMED_BLOCK_HORIZONTAL_INSET_PERCENT * 2);
    expect(layoutMid.laneIndex).not.toBe(layoutLate.laneIndex);
  });

  it("produces deterministic layouts regardless of input order", () => {
    const ordered = [timed("a", "09:00", "10:30"), timed("b", "10:00", "11:00")];
    const reversed = [...ordered].reverse();

    const orderedLayouts = computeTimedOverlapLayouts(ordered);
    const reversedLayouts = computeTimedOverlapLayouts(reversed);

    expect(orderedLayouts.get("a")).toEqual(reversedLayouts.get("a"));
    expect(orderedLayouts.get("b")).toEqual(reversedLayouts.get("b"));
  });

  it("computes lane geometry with a horizontal gap between lanes", () => {
    const single = laneGeometry(0, 1);
    const left = laneGeometry(0, 2);
    const right = laneGeometry(1, 2);

    expect(single.widthPercent).toBeGreaterThan(left.widthPercent);
    expect(right.leftPercent).toBeGreaterThan(left.leftPercent);
    expect(left.widthPercent).toBe(right.widthPercent);
  });
});

describe("labels", () => {
  it("formats hour labels for a 12-hour clock", () => {
    expect(formatHourLabel(0)).toBe("12 AM");
    expect(formatHourLabel(1)).toBe("1 AM");
    expect(formatHourLabel(12)).toBe("12 PM");
    expect(formatHourLabel(13)).toBe("1 PM");
    expect(formatHourLabel(23)).toBe("11 PM");
  });

  it("formats item time labels in 12-hour clock", () => {
    expect(
      formatItemTimeLabel(
        makeEventItem({ id: "e1", isTimed: true, startTime: "19:15", endTime: "22:00" })
      )
    ).toBe("7:15pm – 10:00pm");
    expect(
      formatItemTimeLabel(
        makeEventItem({ id: "e2", isTimed: true, startTime: "06:00", endTime: "06:10" })
      )
    ).toBe("6:00am – 6:10am");
    expect(
      formatItemTimeLabel(
        makeEventItem({ id: "e3", isTimed: true, startTime: "12:00", endTime: "13:00" })
      )
    ).toBe("12:00pm – 1:00pm");
    expect(
      formatItemTimeLabel(makeEventItem({ id: "e4", isTimed: true, startTime: "00:30" }))
    ).toBe("12:30am");
  });
});

describe("integration with calendar foundation", () => {
  it("groups built items by date and resolves colors per category", () => {
    const schedule = emptySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 60 }];
    const skill: Skill = {
      id: "s1",
      name: "SQL",
      schedule,
      createdAtIso: "2026-01-01T00:00:00.000Z",
      updatedAtIso: "2026-01-01T00:00:00.000Z",
    };
    const event: LifeEvent = {
      id: "e1",
      title: "Standup",
      date: "2026-05-25",
      type: "other",
      startTime: "08:00",
      endTime: "08:15",
      reminder: false,
      createdAtIso: "2026-01-01T00:00:00.000Z",
      updatedAtIso: "2026-01-01T00:00:00.000Z",
    };

    const items = buildCalendarItemsForRange({
      startDate: "2026-05-25",
      endDate: "2026-05-25",
      skills: [skill],
      events: [event],
      people: [],
    });

    const grouped = groupCalendarItemsByDate(items);
    const day = grouped.get("2026-05-25")!;
    expect(day).toHaveLength(2);
    // Event (08:00) sorts before skill block (09:00).
    expect(day[0].sourceType).toBe("event");

    const skillColor = resolveCalendarItemColor(day[1]);
    expect(skillColor.token).toBe("indigo.base"); // default category color for skills
    const eventColor = resolveCalendarItemColor(day[0]);
    expect(eventColor.token).toBe("red.base"); // default category color for events
  });
});
