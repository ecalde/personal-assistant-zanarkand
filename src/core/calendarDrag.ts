// Pure calendar drag/reschedule math (Phase 34B).
//
// Snaps timed blocks to a grid and computes reschedule targets for week-view
// drag. No React, storage, or side effects.

import type { CalendarItem } from "./calendar";
import { computeTimedItemLayout } from "./calendarView";
import { addMinutesToHHMM, parseHHMMToMinutes } from "./schedule";

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_GRID_MINUTES = 15;

export type RescheduleTarget = {
  dateKey: string;
  startTime: string;
  endTime?: string;
};

export type ComputeRescheduleTargetInput = {
  item: CalendarItem;
  originDateKey: string;
  originStartMinutes: number;
  targetDateKey: string;
  deltaYMinutes: number;
};

/** Snapshot of the fields a calendar drag/resize mutates, for ephemeral undo. */
export type CalendarEventUndoPayload = {
  eventId: string;
  date: string;
  startTime?: string;
  endTime?: string;
};

export type ComputeMonthDropTargetInput = {
  item: CalendarItem;
  originDateKey: string;
  targetDateKey: string;
};

export type MonthDropTarget = {
  dateKey: string;
};

export type ComputeResizeTargetInput = {
  item: CalendarItem;
  originEndMinutes: number;
  deltaYMinutes: number;
};

export type ResizeTarget = {
  endTime: string;
};

export type CalendarSelectionInput = {
  dateKey: string;
  startMinutes?: number;
  endMinutes?: number;
};

/**
 * Minimal seed for prefilling the Events form from a calendar gesture. Kept as
 * a plain shape (not the page-level `EventFormDraft`) so this pure module stays
 * decoupled from the UI layer.
 */
export type CalendarEventDraftSeed = {
  date: string;
  startTime?: string;
  endTime?: string;
};

const MIN_EVENT_DURATION_MINUTES = 15;

function formatMinutesToHHMM(minutes: number): string {
  const clamped = Math.min(Math.max(0, Math.round(minutes)), MINUTES_PER_DAY - 1);
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Snaps minutes to the nearest grid interval (default 15). */
export function snapMinutes(minutes: number, gridMinutes = DEFAULT_GRID_MINUTES): number {
  if (gridMinutes <= 0) return minutes;
  return Math.round(minutes / gridMinutes) * gridMinutes;
}

/** Converts vertical pointer delta to minutes using the week column scale. */
export function minutesFromPointerDelta(deltaY: number, pixelsPerMinute: number): number {
  if (pixelsPerMinute <= 0) return 0;
  return deltaY / pixelsPerMinute;
}

/** True for timed, one-time life events eligible for week-view drag. */
export function canDragCalendarItem(item: CalendarItem): boolean {
  if (item.sourceType !== "event") return false;
  if (item.sourceMeta.kind !== "lifeEvent") return false;
  if (item.sourceMeta.recurrenceDate !== undefined) return false;
  if (!item.isTimed || !item.startTime) return false;
  return true;
}

/**
 * Computes a snapped reschedule target for a dragged calendar item.
 * Returns null when the target date is invalid or the item is not draggable.
 */
export function computeRescheduleTarget(
  input: ComputeRescheduleTargetInput
): RescheduleTarget | null {
  const { item, originDateKey, originStartMinutes, targetDateKey, deltaYMinutes } = input;

  if (!canDragCalendarItem(item)) return null;
  if (!targetDateKey || targetDateKey === originDateKey && deltaYMinutes === 0) {
    // still allow same-day time moves
  }

  const layout = computeTimedItemLayout(item);
  const rawStart = originStartMinutes + deltaYMinutes;
  const snappedStart = snapMinutes(rawStart);
  const maxStart = MINUTES_PER_DAY - layout.durationMinutes;
  const clampedStart = Math.min(Math.max(0, snappedStart), maxStart);
  const startTime = formatMinutesToHHMM(clampedStart);

  let endTime: string | undefined;
  if (item.startTime && item.endTime) {
    endTime = addMinutesToHHMM(startTime, layout.durationMinutes);
  }

  return {
    dateKey: targetDateKey,
    startTime,
    endTime,
  };
}

/** Reads start minutes from a calendar item for drag origin tracking. */
export function originStartMinutesForItem(item: CalendarItem): number {
  return item.startTime ? parseHHMMToMinutes(item.startTime) : 0;
}

/** Reads end minutes from a calendar item for resize origin tracking. */
export function originEndMinutesForItem(item: CalendarItem): number {
  if (item.endTime) return parseHHMMToMinutes(item.endTime);
  if (item.startTime) return parseHHMMToMinutes(item.startTime) + MIN_EVENT_DURATION_MINUTES;
  return 0;
}

/** True for one-time life events eligible for month-view date drag (timed or all-day). */
export function canDragCalendarItemInMonth(item: CalendarItem): boolean {
  if (item.sourceType !== "event") return false;
  if (item.sourceMeta.kind !== "lifeEvent") return false;
  if (item.sourceMeta.recurrenceDate !== undefined) return false;
  return true;
}

/** True for timed, one-time life events eligible for week-view resize. */
export function canResizeCalendarItem(item: CalendarItem): boolean {
  return canDragCalendarItem(item);
}

/**
 * Computes a month-view drop target. Returns null when the item is not
 * eligible or the target is the same date (no-op).
 */
export function computeMonthDropTarget(
  input: ComputeMonthDropTargetInput
): MonthDropTarget | null {
  const { item, originDateKey, targetDateKey } = input;
  if (!canDragCalendarItemInMonth(item)) return null;
  if (!targetDateKey) return null;
  if (targetDateKey === originDateKey) return null;
  return { dateKey: targetDateKey };
}

/**
 * Computes a snapped end time for a week-view resize (end edge only; start is
 * fixed). Returns null when the item is not resizable or the resulting end is
 * not strictly after the start by at least the minimum duration.
 */
export function computeResizeTarget(input: ComputeResizeTargetInput): ResizeTarget | null {
  const { item, originEndMinutes, deltaYMinutes } = input;
  if (!canResizeCalendarItem(item) || !item.startTime) return null;

  const startMinutes = parseHHMMToMinutes(item.startTime);
  const snappedEnd = snapMinutes(originEndMinutes + deltaYMinutes);
  const cappedEnd = Math.min(Math.max(0, snappedEnd), MINUTES_PER_DAY - 1);
  if (cappedEnd < startMinutes + MIN_EVENT_DURATION_MINUTES) return null;

  return { endTime: formatMinutesToHHMM(cappedEnd) };
}

/**
 * Builds a draft seed from a calendar selection. A date-only selection (month
 * day click) yields just the date; a time range (future week create) snaps and
 * validates start/end. Returns null for an empty date key.
 */
export function buildEventDraftFromCalendarSelection(
  input: CalendarSelectionInput
): CalendarEventDraftSeed | null {
  if (!input.dateKey) return null;
  if (input.startMinutes === undefined) {
    return { date: input.dateKey };
  }

  const start = Math.min(Math.max(0, snapMinutes(input.startMinutes)), MINUTES_PER_DAY - 1);
  const rawEnd = input.endMinutes ?? start + MIN_EVENT_DURATION_MINUTES;
  let end = snapMinutes(rawEnd);
  if (end < start + MIN_EVENT_DURATION_MINUTES) {
    end = start + MIN_EVENT_DURATION_MINUTES;
  }
  end = Math.min(Math.max(0, end), MINUTES_PER_DAY - 1);

  return {
    date: input.dateKey,
    startTime: formatMinutesToHHMM(start),
    endTime: formatMinutesToHHMM(end),
  };
}

/** Resolves the life-event id from a draggable calendar item. */
export function eventIdFromCalendarItem(item: CalendarItem): string | undefined {
  if (item.sourceMeta.kind !== "lifeEvent") return undefined;
  return item.sourceMeta.eventId;
}

export const DRAG_MOVE_THRESHOLD_PX = 5;
