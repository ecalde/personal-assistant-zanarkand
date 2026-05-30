// Pure life-event series split helpers (Phase 33).
//
// Orchestrates recurring-event "this and future" edits by delegating date math to
// recurrence.ts. No React, storage, or Supabase; total functions that never mutate
// inputs. Invalid/non-recurring input yields a safe replace-only result.

import type { LifeEvent } from "./model";
import {
  expandRecurrenceInstances,
  getRecurrenceDateKeys,
  normalizeRecurrenceRule,
  splitRecurrenceSeriesAtDate,
  type RecurrenceRule,
} from "./recurrence";

export type EventSeriesEditScope = "entire" | "thisAndFuture";

export type SplitEventSeriesInput = {
  original: LifeEvent;
  /** Inclusive split date (YYYY-MM-DD). Future half starts on the first occurrence on/after this date. */
  splitDate: string;
  /** Edited field values; `id` is ignored (original id kept on beforeEvent, new id on afterEvent). */
  editedEvent: LifeEvent;
  seriesId: string;
  afterEventId: string;
  nowIso: string;
};

export type SplitEventSeriesResult = {
  /** Truncated original series ending the day before splitDate. Omitted when split is at/before the first occurrence. */
  beforeEvent?: LifeEvent;
  /** New event carrying the edited fields and the continuing recurrence from splitDate onward. */
  afterEvent: LifeEvent;
};

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

function firstOccurrenceOnOrAfter(rule: RecurrenceRule, fromDate: string): string {
  const keys = getRecurrenceDateKeys(rule, fromDate, FAR_FUTURE);
  return keys[0] ?? fromDate;
}

function firstOccurrenceOfSeries(rule: RecurrenceRule, fallbackDate: string): string {
  const start = rule.startDate ?? rule.anchorDate;
  const keys = getRecurrenceDateKeys(rule, start, FAR_FUTURE);
  return keys[0] ?? fallbackDate;
}

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

function buildAfterRecurrence(
  afterRule: RecurrenceRule,
  firstDate: string
): RecurrenceRule | undefined {
  const withAnchor: RecurrenceRule = {
    ...afterRule,
    anchorDate: firstDate,
  };
  return normalizeRecurrenceRule(withAnchor);
}

/**
 * Splits a recurring life event at `splitDate` into a truncated before event (same
 * id) and a new after event (new id). Both share `seriesId`. When the split is at
 * or before the series' first occurrence, only `afterEvent` is returned (caller
 * should remove the original row).
 */
export function splitEventSeriesAtDate(input: SplitEventSeriesInput): SplitEventSeriesResult {
  const { original, splitDate, editedEvent, seriesId, afterEventId, nowIso } = input;

  const originalRecurrence = original.recurrence;
  if (!originalRecurrence?.frequency) {
    const fields = editedFieldsFrom(editedEvent);
    const afterEvent: LifeEvent = {
      ...cloneEvent(original),
      ...fields,
      id: afterEventId,
      date: editedEvent.date,
      recurrence: editedEvent.recurrence
        ? normalizeRecurrenceRule(editedEvent.recurrence)
        : undefined,
      seriesId: editedEvent.recurrence?.frequency ? seriesId : undefined,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    if (!afterEvent.recurrence) {
      delete afterEvent.seriesId;
    }
    return { afterEvent };
  }

  const editedRecurrence = editedEvent.recurrence;
  const afterRuleInput: RecurrenceRule = editedRecurrence?.frequency
    ? { ...editedRecurrence, anchorDate: editedRecurrence.anchorDate ?? splitDate }
    : { anchorDate: splitDate };

  const { beforeRule, afterRule } = splitRecurrenceSeriesAtDate(
    originalRecurrence,
    splitDate,
    afterRuleInput
  );

  const seriesFirst = firstOccurrenceOfSeries(originalRecurrence, original.date);
  const includeBefore = compareDateKeys(splitDate, seriesFirst) > 0;

  const afterFirstDate = editedRecurrence?.frequency
    ? firstOccurrenceOnOrAfter(afterRule, splitDate)
    : splitDate;

  const normalizedAfterRecurrence = editedRecurrence?.frequency
    ? buildAfterRecurrence(afterRule, afterFirstDate)
    : undefined;

  const afterEvent: LifeEvent = {
    ...cloneEvent(original),
    ...editedFieldsFrom(editedEvent),
    id: afterEventId,
    date: afterFirstDate,
    recurrence: normalizedAfterRecurrence,
    seriesId,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  if (!afterEvent.recurrence) {
    delete afterEvent.seriesId;
  }

  if (!includeBefore) {
    return { afterEvent };
  }

  const beforeEvent: LifeEvent = {
    ...cloneEvent(original),
    recurrence: normalizeRecurrenceRule(beforeRule),
    seriesId,
    updatedAtIso: nowIso,
  };

  return { beforeEvent, afterEvent };
}

/** True when the event has a recurring rule suitable for series-scope editing. */
export function isRecurringLifeEvent(event: LifeEvent): boolean {
  return Boolean(event.recurrence?.frequency);
}

/** Returns occurrence dates for preview/debug; exported for tests. */
export function listOccurrenceDates(rule: RecurrenceRule, rangeStart: string, rangeEnd: string): string[] {
  return expandRecurrenceInstances(rule, rangeStart, rangeEnd).map((inst) => inst.date);
}
