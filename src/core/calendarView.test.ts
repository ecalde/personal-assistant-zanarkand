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
  computeWeekRange,
  filterItemsByHiddenCategories,
  formatHourLabel,
  limitDayItems,
  monthAnchorFromKey,
  shiftMonth,
  shiftWeek,
  splitDayItems,
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

    const ranged = makeEventItem({
      id: "r",
      isTimed: true,
      startTime: "09:00",
      endTime: "10:30",
    });
    expect(computeTimedItemLayout(ranged)).toEqual({ topMinutes: 540, durationMinutes: 90 });
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
