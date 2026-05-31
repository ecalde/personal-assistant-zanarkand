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

/** Resolves the life-event id from a draggable calendar item. */
export function eventIdFromCalendarItem(item: CalendarItem): string | undefined {
  if (item.sourceMeta.kind !== "lifeEvent") return undefined;
  return item.sourceMeta.eventId;
}

export const DRAG_MOVE_THRESHOLD_PX = 5;
