// Pure, React-free view math for the calendar UI (month grid, week grid, range
// computation, category filtering, day-item split/positioning, navigation, and
// labels). Kept separate from calendar.ts so the view logic is unit-testable
// without rendering. No persistence, storage, or side effects.

import type { CalendarItem } from "./calendar";
import { calendarTimeSortTier } from "./calendar";
import type { CalendarCategoryKey } from "./calendarColors";
import { formatHHMMToDisplayTime, parseHHMMToMinutes } from "./schedule";
import { formatLocalDateKey } from "./timeline";

export type CalendarViewMode = "month" | "week" | "threeDay";

/** Number of consecutive days shown in the 3-day view. */
export const THREE_DAY_VISIBLE_COUNT = 3;

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
  /** Zero-based lane within an overlap cluster. */
  laneIndex: number;
  /** Total concurrent lanes required for the item's overlap cluster. */
  laneCount: number;
  leftPercent: number;
  widthPercent: number;
  zIndex: number;
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
/** Horizontal inset for timed blocks within a day column (percent). */
export const TIMED_BLOCK_HORIZONTAL_INSET_PERCENT = 2;
/** Gap between overlap lanes (percent). */
export const TIMED_BLOCK_LANE_GAP_PERCENT = 1;

type TimedItemRange = {
  item: CalendarItem;
  startMinutes: number;
  endMinutes: number;
  topMinutes: number;
  durationMinutes: number;
};

// ---------------------------------------------------------------------------
// Timed overlap layout (week view)
// ---------------------------------------------------------------------------

/** True when two timed intervals overlap (exclusive end; back-to-back does not overlap). */
export function timedItemsOverlapMinutes(
  aStartMinutes: number,
  aEndMinutes: number,
  bStartMinutes: number,
  bEndMinutes: number
): boolean {
  return aStartMinutes < bEndMinutes && bStartMinutes < aEndMinutes;
}

function computeTimedItemVerticalLayout(item: CalendarItem): {
  topMinutes: number;
  durationMinutes: number;
} {
  const topMinutes = item.startTime ? parseHHMMToMinutes(item.startTime) : 0;
  let durationMinutes = MIN_TIMED_BLOCK_MINUTES;
  if (item.startTime && item.endTime) {
    const end = parseHHMMToMinutes(item.endTime);
    durationMinutes = Math.max(MIN_TIMED_BLOCK_MINUTES, end - topMinutes);
  }
  const clampedTop = Math.min(Math.max(0, topMinutes), MINUTES_PER_DAY);
  const clampedDuration = Math.min(durationMinutes, MINUTES_PER_DAY - clampedTop);
  return {
    topMinutes: clampedTop,
    durationMinutes: Math.max(MIN_TIMED_BLOCK_MINUTES, clampedDuration),
  };
}

export function laneGeometry(
  laneIndex: number,
  laneCount: number
): { leftPercent: number; widthPercent: number } {
  const inset = TIMED_BLOCK_HORIZONTAL_INSET_PERCENT;
  if (laneCount <= 1) {
    return { leftPercent: inset, widthPercent: 100 - inset * 2 };
  }
  const gap = TIMED_BLOCK_LANE_GAP_PERCENT;
  const totalGap = (laneCount - 1) * gap;
  const widthPercent = (100 - inset * 2 - totalGap) / laneCount;
  const leftPercent = inset + laneIndex * (widthPercent + gap);
  return { leftPercent, widthPercent };
}

function buildTimedItemRange(item: CalendarItem): TimedItemRange {
  const { topMinutes, durationMinutes } = computeTimedItemVerticalLayout(item);
  return {
    item,
    startMinutes: topMinutes,
    endMinutes: topMinutes + durationMinutes,
    topMinutes,
    durationMinutes,
  };
}

function rangesOverlap(a: TimedItemRange, b: TimedItemRange): boolean {
  return timedItemsOverlapMinutes(
    a.startMinutes,
    a.endMinutes,
    b.startMinutes,
    b.endMinutes
  );
}

function buildOverlapClusters(ranges: TimedItemRange[]): TimedItemRange[][] {
  const parent = ranges.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      if (rangesOverlap(ranges[i], ranges[j])) union(i, j);
    }
  }

  const clusters = new Map<number, TimedItemRange[]>();
  for (let i = 0; i < ranges.length; i += 1) {
    const root = find(i);
    const cluster = clusters.get(root);
    if (cluster) cluster.push(ranges[i]);
    else clusters.set(root, [ranges[i]]);
  }

  return [...clusters.values()];
}

function compareTimedItemRanges(a: TimedItemRange, b: TimedItemRange): number {
  if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
  if (a.endMinutes !== b.endMinutes) return b.endMinutes - a.endMinutes;
  return a.item.id.localeCompare(b.item.id);
}

function assignOverlapLanes(cluster: TimedItemRange[]): Map<string, number> {
  const sorted = [...cluster].sort(compareTimedItemRanges);
  const lanes: TimedItemRange[][] = [];
  const laneByItemId = new Map<string, number>();

  for (const entry of sorted) {
    let laneIndex = -1;
    for (let candidate = 0; candidate < lanes.length; candidate += 1) {
      const lane = lanes[candidate];
      const conflicts = lane.some((existing) => rangesOverlap(existing, entry));
      if (!conflicts) {
        laneIndex = candidate;
        lane.push(entry);
        break;
      }
    }
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push([entry]);
    }
    laneByItemId.set(entry.item.id, laneIndex);
  }

  return laneByItemId;
}

/**
 * Computes vertical placement and overlap lane geometry for all timed items in
 * a single day column. Items in separate non-overlapping clusters use full
 * width; overlapping items are placed side-by-side in lanes.
 */
export function computeTimedOverlapLayouts(items: CalendarItem[]): Map<string, TimedItemLayout> {
  const layouts = new Map<string, TimedItemLayout>();
  if (items.length === 0) return layouts;

  const ranges = items.map(buildTimedItemRange);
  const clusters = buildOverlapClusters(ranges);

  for (const cluster of clusters) {
    const laneByItemId = assignOverlapLanes(cluster);
    const laneCount = Math.max(...[...laneByItemId.values()]) + 1;

    for (const entry of cluster) {
      const laneIndex = laneByItemId.get(entry.item.id) ?? 0;
      const { leftPercent, widthPercent } = laneGeometry(laneIndex, laneCount);
      layouts.set(entry.item.id, {
        topMinutes: entry.topMinutes,
        durationMinutes: entry.durationMinutes,
        laneIndex,
        laneCount,
        leftPercent,
        widthPercent,
        zIndex: laneIndex + 1,
      });
    }
  }

  return layouts;
}

// ---------------------------------------------------------------------------
// Local date helpers (parse/build YYYY-MM-DD without timezone drift)
// ---------------------------------------------------------------------------

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
}

/** Whole-day distance from `startKey` to `endKey` (end − start). */
export function daysBetweenDateKeys(startKey: string, endKey: string): number {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
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

/** Three-day range: anchor through anchor + 2 days. */
export function computeThreeDayRange(anchorKey: string): DateRange {
  return {
    startDate: anchorKey,
    endDate: addDaysToDateKey(anchorKey, THREE_DAY_VISIBLE_COUNT - 1),
  };
}

/**
 * Wide range for the 3-day scroll strip so items exist while the user pans
 * forward/backward. Centered on `centerKey`.
 */
export function computeThreeDayScrollRange(
  centerKey: string,
  bufferDays: number
): DateRange {
  return {
    startDate: addDaysToDateKey(centerKey, -bufferDays),
    endDate: addDaysToDateKey(centerKey, bufferDays + THREE_DAY_VISIBLE_COUNT - 1),
  };
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

export function buildDayColumns(
  startDateKey: string,
  count: number,
  todayKey: string
): WeekDayColumn[] {
  const columns: WeekDayColumn[] = [];
  for (let i = 0; i < count; i += 1) {
    const dateKey = addDaysToDateKey(startDateKey, i);
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

export function buildWeekGrid(anchorKey: string, todayKey: string): WeekDayColumn[] {
  const { startDate } = computeWeekRange(anchorKey);
  return buildDayColumns(startDate, 7, todayKey);
}

export function buildThreeDayGrid(anchorKey: string, todayKey: string): WeekDayColumn[] {
  return buildDayColumns(anchorKey, THREE_DAY_VISIBLE_COUNT, todayKey);
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

export function shiftThreeDay(anchorKey: string, deltaDays: number): string {
  return addDaysToDateKey(anchorKey, deltaDays);
}

/**
 * Fraction of a day column (0–1) visible inside the horizontal viewport.
 */
export function dayColumnVisibleFraction(
  dayIndex: number,
  scrollLeftPx: number,
  viewportWidthPx: number,
  dayWidthPx: number
): number {
  if (dayWidthPx <= 0) return 0;
  const columnStart = dayIndex * dayWidthPx;
  const columnEnd = columnStart + dayWidthPx;
  const viewportEnd = scrollLeftPx + viewportWidthPx;
  const overlapStart = Math.max(columnStart, scrollLeftPx);
  const overlapEnd = Math.min(columnEnd, viewportEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  return overlap / dayWidthPx;
}

/** True when no day outside the 3-day window peeks in by more than 50%. */
export function isValidThreeDaySnapWindow(
  anchorIndex: number,
  scrollLeftPx: number,
  viewportWidthPx: number,
  dayWidthPx: number
): boolean {
  const leftPeekIndex = anchorIndex - 1;
  if (leftPeekIndex >= 0) {
    const leftPeek = dayColumnVisibleFraction(
      leftPeekIndex,
      scrollLeftPx,
      viewportWidthPx,
      dayWidthPx
    );
    if (leftPeek > 0.5) return false;
  }

  const rightPeekIndex = anchorIndex + THREE_DAY_VISIBLE_COUNT;
  const rightPeek = dayColumnVisibleFraction(
    rightPeekIndex,
    scrollLeftPx,
    viewportWidthPx,
    dayWidthPx
  );
  return rightPeek <= 0.5;
}

/**
 * After horizontal scrolling in the 3-day view, picks the anchor whose aligned
 * window is closest to the user's scroll position while keeping the >50% peek
 * rule: no day outside the three visible columns may show more than half.
 */
export function computeThreeDaySnapAnchorIndex(
  scrollLeftPx: number,
  dayWidthPx: number,
  minAnchorIndex = 0,
  maxAnchorIndex = Number.POSITIVE_INFINITY
): number {
  if (dayWidthPx <= 0) return Math.max(minAnchorIndex, 0);

  const viewportWidth = THREE_DAY_VISIBLE_COUNT * dayWidthPx;
  const centerIndex = Math.floor(scrollLeftPx / dayWidthPx);
  const searchStart = Math.max(minAnchorIndex, centerIndex - 2);
  const searchEnd = Math.min(maxAnchorIndex, centerIndex + 2);

  let bestAnchor = Math.max(minAnchorIndex, centerIndex);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let candidate = searchStart; candidate <= searchEnd; candidate += 1) {
    if (!isValidThreeDaySnapWindow(candidate, scrollLeftPx, viewportWidth, dayWidthPx)) {
      continue;
    }
    const distance = Math.abs(scrollLeftPx - threeDaySnapScrollLeft(candidate, dayWidthPx));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAnchor = candidate;
    }
  }

  return bestAnchor;
}

/** Pixel offset that aligns the scroll strip to `anchorIndex`. */
export function threeDaySnapScrollLeft(anchorIndex: number, dayWidthPx: number): number {
  return anchorIndex * dayWidthPx;
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
 * Horizontal placement defaults to full width; use {@link computeTimedOverlapLayouts}
 * for week-view overlap lanes.
 */
export function computeTimedItemLayout(item: CalendarItem): TimedItemLayout {
  const { topMinutes, durationMinutes } = computeTimedItemVerticalLayout(item);
  const { leftPercent, widthPercent } = laneGeometry(0, 1);
  return {
    topMinutes,
    durationMinutes,
    laneIndex: 0,
    laneCount: 1,
    leftPercent,
    widthPercent,
    zIndex: 1,
  };
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
  return formatDateRangeTitle(startDate, endDate);
}

export function formatThreeDayRangeTitle(anchorKey: string): string {
  const { startDate, endDate } = computeThreeDayRange(anchorKey);
  return formatDateRangeTitle(startDate, endDate);
}

function formatDateRangeTitle(startDate: string, endDate: string): string {
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
  const start = formatHHMMToDisplayTime(item.startTime);
  if (item.endTime) return `${start} – ${formatHHMMToDisplayTime(item.endTime)}`;
  return start;
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
