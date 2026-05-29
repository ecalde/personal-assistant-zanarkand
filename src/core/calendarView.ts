// Pure, React-free view math for the calendar UI (month grid, week grid, range
// computation, category filtering, day-item split/positioning, navigation, and
// labels). Kept separate from calendar.ts so the view logic is unit-testable
// without rendering. No persistence, storage, or side effects.

import type { CalendarItem } from "./calendar";
import { calendarTimeSortTier } from "./calendar";
import type { CalendarCategoryKey } from "./calendarColors";
import { parseHHMMToMinutes } from "./schedule";
import { formatLocalDateKey } from "./timeline";

export type CalendarViewMode = "month" | "week";

export type DateRange = { startDate: string; endDate: string };

export type MonthDayCell = {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

export type MonthWeek = {
  days: MonthDayCell[];
};

export type WeekDayColumn = {
  dateKey: string;
  weekdayIndex: number; // 0 = Sunday
  label: string; // e.g. "Sun"
  dayNumber: number;
  isToday: boolean;
};

export type TimedItemLayout = {
  topMinutes: number; // minutes from midnight to the top of the block
  durationMinutes: number; // clamped to keep a minimum visible height
};

export type SplitDayItems = {
  allDay: CalendarItem[];
  timed: CalendarItem[];
};

export type LimitedDayItems = {
  visible: CalendarItem[];
  overflowCount: number;
};

export const WEEKDAY_SHORT_LABELS: readonly string[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

const MINUTES_PER_DAY = 24 * 60;
const MIN_TIMED_BLOCK_MINUTES = 30;

// ---------------------------------------------------------------------------
// Local date helpers (parse/build YYYY-MM-DD without timezone drift)
// ---------------------------------------------------------------------------

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
}

/** Normalizes any date key to the first day of its month (YYYY-MM-01). */
export function monthAnchorFromKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

// ---------------------------------------------------------------------------
// Range computation
// ---------------------------------------------------------------------------

/**
 * Visible month range: from the Sunday on/before the 1st of the month through
 * the Saturday on/after the last day, always yielding a full 6x7 grid.
 */
export function computeMonthVisibleRange(monthAnchorKey: string): DateRange {
  const anchor = monthAnchorFromKey(monthAnchorKey);
  const first = parseDateKey(anchor);
  const startOffset = first.getDay(); // 0 = Sunday
  const startDate = addDaysToDateKey(anchor, -startOffset);
  const endDate = addDaysToDateKey(startDate, 6 * 7 - 1);
  return { startDate, endDate };
}

/** Week range: Sunday on/before the anchor through the following Saturday. */
export function computeWeekRange(anchorKey: string): DateRange {
  const anchor = parseDateKey(anchorKey);
  const startOffset = anchor.getDay();
  const startDate = addDaysToDateKey(anchorKey, -startOffset);
  const endDate = addDaysToDateKey(startDate, 6);
  return { startDate, endDate };
}

// ---------------------------------------------------------------------------
// Grid builders
// ---------------------------------------------------------------------------

export function buildMonthGrid(monthAnchorKey: string, todayKey: string): MonthWeek[] {
  const anchor = monthAnchorFromKey(monthAnchorKey);
  const currentMonth = anchor.slice(0, 7);
  const { startDate } = computeMonthVisibleRange(anchor);

  const weeks: MonthWeek[] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: MonthDayCell[] = [];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const dateKey = addDaysToDateKey(startDate, week * 7 + dayOfWeek);
      const date = parseDateKey(dateKey);
      days.push({
        dateKey,
        dayNumber: date.getDate(),
        inCurrentMonth: dateKey.slice(0, 7) === currentMonth,
        isToday: dateKey === todayKey,
      });
    }
    weeks.push({ days });
  }
  return weeks;
}

export function buildWeekGrid(anchorKey: string, todayKey: string): WeekDayColumn[] {
  const { startDate } = computeWeekRange(anchorKey);
  const columns: WeekDayColumn[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dateKey = addDaysToDateKey(startDate, i);
    const date = parseDateKey(dateKey);
    const weekdayIndex = date.getDay();
    columns.push({
      dateKey,
      weekdayIndex,
      label: WEEKDAY_SHORT_LABELS[weekdayIndex],
      dayNumber: date.getDate(),
      isToday: dateKey === todayKey,
    });
  }
  return columns;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function shiftMonth(monthAnchorKey: string, delta: number): string {
  const anchor = monthAnchorFromKey(monthAnchorKey);
  const date = parseDateKey(anchor);
  date.setMonth(date.getMonth() + delta);
  return formatLocalDateKey(date).slice(0, 7) + "-01";
}

export function shiftWeek(anchorKey: string, deltaWeeks: number): string {
  return addDaysToDateKey(anchorKey, deltaWeeks * 7);
}

// ---------------------------------------------------------------------------
// Filtering (render-only)
// ---------------------------------------------------------------------------

export function filterItemsByHiddenCategories(
  items: CalendarItem[],
  hidden: ReadonlySet<CalendarCategoryKey>
): CalendarItem[] {
  if (hidden.size === 0) return items;
  return items.filter(
    (item) => !hidden.has(item.categoryKey as CalendarCategoryKey)
  );
}

// ---------------------------------------------------------------------------
// Day-item layout helpers
// ---------------------------------------------------------------------------

export function splitDayItems(items: CalendarItem[]): SplitDayItems {
  const allDay: CalendarItem[] = [];
  const timed: CalendarItem[] = [];
  for (const item of items) {
    if (item.isTimed) {
      timed.push(item);
    } else {
      allDay.push(item);
    }
  }
  return { allDay, timed };
}

export function limitDayItems(items: CalendarItem[], max: number): LimitedDayItems {
  if (max <= 0 || items.length <= max) {
    return { visible: items, overflowCount: 0 };
  }
  return {
    visible: items.slice(0, max),
    overflowCount: items.length - max,
  };
}

/**
 * Computes vertical placement for a timed item within a 24h column. Start-only
 * items (no endTime) and very short blocks get a minimum visible height.
 */
export function computeTimedItemLayout(item: CalendarItem): TimedItemLayout {
  const topMinutes = item.startTime ? parseHHMMToMinutes(item.startTime) : 0;
  let durationMinutes = MIN_TIMED_BLOCK_MINUTES;
  if (item.startTime && item.endTime) {
    const end = parseHHMMToMinutes(item.endTime);
    durationMinutes = Math.max(MIN_TIMED_BLOCK_MINUTES, end - topMinutes);
  }
  // Keep the block within the day bounds.
  const clampedTop = Math.min(Math.max(0, topMinutes), MINUTES_PER_DAY);
  const clampedDuration = Math.min(durationMinutes, MINUTES_PER_DAY - clampedTop);
  return { topMinutes: clampedTop, durationMinutes: Math.max(MIN_TIMED_BLOCK_MINUTES, clampedDuration) };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function formatMonthTitle(monthAnchorKey: string): string {
  const date = parseDateKey(monthAnchorFromKey(monthAnchorKey));
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekRangeTitle(anchorKey: string): string {
  const { startDate, endDate } = computeWeekRange(anchorKey);
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

/** Renders an hour-of-day label, e.g. 0 -> "12 AM", 13 -> "1 PM". */
export function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const period = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${period}`;
}

export function formatItemTimeLabel(item: CalendarItem): string | undefined {
  if (!item.isTimed || !item.startTime) return undefined;
  if (item.endTime) return `${item.startTime} – ${item.endTime}`;
  return item.startTime;
}

/** Stable display label for a calendar source type (for the read-only detail). */
export function formatSourceTypeLabel(item: CalendarItem): string {
  switch (item.sourceType) {
    case "skill":
      return "Skill block";
    case "event":
      return "Life event";
    case "people":
      return "Birthday";
    case "fitness":
      return "Workout";
    case "career":
      return "Career";
    default:
      return item.sourceType;
  }
}

/** Re-export for convenience so views import time-tier from one place. */
export { calendarTimeSortTier };
