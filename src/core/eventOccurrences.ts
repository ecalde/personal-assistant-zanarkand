// Pure life-event occurrence mutations (Phase 34A).
//
// Skip, move, truncate, and detach recurring occurrences via RecurrenceException
// persistence. No React, storage, or Supabase; never mutates inputs.

import type { LifeEvent } from "./model";
import {
  expandRecurrenceInstances,
  getRecurrenceDateKeys,
  normalizeRecurrenceRule,
  type RecurrenceException,
  type RecurrenceRule,
} from "./recurrence";
import { addDaysToDateKey } from "./events";

const FAR_FUTURE = "2099-12-31";

function compareDateKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function cloneEvent(event: LifeEvent): LifeEvent {
  return {
    ...event,
    recurrence: event.recurrence ? { ...event.recurrence } : undefined,
  };
}

function firstOccurrenceOfSeries(rule: RecurrenceRule, fallbackDate: string): string {
  const start = rule.startDate ?? rule.anchorDate;
  const keys = getRecurrenceDateKeys(rule, start, FAR_FUTURE);
  return keys[0] ?? fallbackDate;
}

function withUpdatedRecurrence(
  event: LifeEvent,
  rule: RecurrenceRule | undefined,
  nowIso: string
): LifeEvent {
  const next = cloneEvent(event);
  next.recurrence = rule;
  next.updatedAtIso = nowIso;
  if (!rule) {
    delete next.recurrence;
    delete next.seriesId;
  }
  return next;
}

/** Merges one exception by scheduled date; duplicate dates resolve last-wins. */
export function upsertRecurrenceException(
  rule: RecurrenceRule,
  exception: RecurrenceException
): RecurrenceRule {
  const existing = rule.exceptions ?? [];
  const filtered = existing.filter((exc) => exc.date !== exception.date);
  return {
    ...rule,
    exceptions: [...filtered, exception],
  };
}

/** Adds a skip exception for the scheduled occurrence date. Non-recurring: unchanged. */
export function skipOccurrenceAtDate(
  event: LifeEvent,
  occurrenceDate: string,
  nowIso: string
): LifeEvent {
  const recurrence = event.recurrence;
  if (!recurrence?.frequency) {
    return cloneEvent(event);
  }

  const nextRule = normalizeRecurrenceRule(
    upsertRecurrenceException(recurrence, { kind: "skip", date: occurrenceDate })
  );
  if (!nextRule) {
    return cloneEvent(event);
  }

  return withUpdatedRecurrence(event, nextRule, nowIso);
}

/** Moves one occurrence via override exception (scheduled date → overrideDate). */
export function moveOccurrenceAtDate(
  event: LifeEvent,
  occurrenceDate: string,
  overrideDate: string,
  nowIso: string
): LifeEvent {
  const recurrence = event.recurrence;
  if (!recurrence?.frequency) {
    return cloneEvent(event);
  }

  const nextRule = normalizeRecurrenceRule(
    upsertRecurrenceException(recurrence, {
      kind: "override",
      date: occurrenceDate,
      overrideDate,
    })
  );
  if (!nextRule) {
    return cloneEvent(event);
  }

  return withUpdatedRecurrence(event, nextRule, nowIso);
}

/**
 * Truncates a series so no occurrences remain on or after `fromDate`.
 * Returns null when the entire series should be deleted (fromDate at/before first occurrence).
 */
export function truncateRecurringEventBeforeDate(
  event: LifeEvent,
  fromDate: string,
  nowIso: string
): LifeEvent | null {
  const recurrence = event.recurrence;
  if (!recurrence?.frequency) {
    return cloneEvent(event);
  }

  const seriesFirst = firstOccurrenceOfSeries(recurrence, event.date);
  if (compareDateKeys(fromDate, seriesFirst) <= 0) {
    return null;
  }

  const dayBefore = addDaysToDateKey(fromDate, -1);
  if (!dayBefore) {
    return null;
  }

  const truncated: RecurrenceRule = {
    ...recurrence,
    end: { kind: "onDate", endDate: dayBefore },
  };

  const nextRule = normalizeRecurrenceRule(truncated);
  if (!nextRule) {
    return null;
  }

  return withUpdatedRecurrence(event, nextRule, nowIso);
}

export type DetachOccurrenceInput = {
  parent: LifeEvent;
  /** Scheduled occurrence date used as the exception key. */
  occurrenceDate: string;
  editedEvent: LifeEvent;
  detachedId: string;
  nowIso: string;
};

export type DetachOccurrenceResult = {
  parentEvent: LifeEvent;
  detachedEvent: LifeEvent;
};

function editedFieldsFrom(edited: LifeEvent): Omit<
  LifeEvent,
  "id" | "createdAtIso" | "updatedAtIso" | "seriesId" | "date" | "recurrence"
> {
  return {
    title: edited.title,
    type: edited.type,
    reminder: edited.reminder,
    personId: edited.personId,
    personName: edited.personName,
    notes: edited.notes,
    startTime: edited.startTime,
    endTime: edited.endTime,
  };
}

/**
 * Skips one occurrence on the parent series and creates a standalone one-time event
 * with the edited field values on `editedEvent.date`.
 */
export function detachOccurrenceAsOneTimeEvent(
  input: DetachOccurrenceInput
): DetachOccurrenceResult {
  const { parent, occurrenceDate, editedEvent, detachedId, nowIso } = input;

  const parentEvent = skipOccurrenceAtDate(parent, occurrenceDate, nowIso);

  const detachedEvent: LifeEvent = {
    ...cloneEvent(parent),
    ...editedFieldsFrom(editedEvent),
    id: detachedId,
    date: editedEvent.date,
    recurrence: undefined,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  delete detachedEvent.seriesId;

  return { parentEvent, detachedEvent };
}

/** Returns occurrence dates for a range (test helper). */
export function listOccurrenceDates(
  event: LifeEvent,
  rangeStart: string,
  rangeEnd: string
): string[] {
  const rule = event.recurrence;
  if (!rule?.frequency) {
    return compareDateKeys(event.date, rangeStart) >= 0 &&
      compareDateKeys(event.date, rangeEnd) <= 0
      ? [event.date]
      : [];
  }
  return expandRecurrenceInstances(rule, rangeStart, rangeEnd).map((inst) => inst.date);
}
