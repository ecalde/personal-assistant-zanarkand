import type { AppPayload, EventType, LifeEvent } from "./model";
import { isValidRecurrenceRule } from "./recurrence";
import { formatLocalDateKey } from "./timeline";

export type UpcomingEventUrgencyLabel = "Today" | "Tomorrow" | `In ${number} days`;

export type UpcomingEventItem = {
  event: LifeEvent;
  urgencyLabel: UpcomingEventUrgencyLabel;
  daysUntil: number;
};

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  const date = parseDateKey(dateKey);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
}

export function daysBetweenDateKeys(fromKey: string, toKey: string): number | null {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return null;
  const diffMs = to.getTime() - from.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function formatUpcomingEventUrgencyLabel(daysUntil: number): UpcomingEventUrgencyLabel {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

/** Linked person ids, including legacy single `personId`. */
export function eventPersonIds(event: Pick<LifeEvent, "personId" | "personIds">): string[] {
  if (event.personIds && event.personIds.length > 0) {
    const unique: string[] = [];
    for (const id of event.personIds) {
      if (!unique.includes(id)) unique.push(id);
    }
    return unique;
  }
  if (event.personId) return [event.personId];
  return [];
}

export function eventIncludesPerson(
  event: Pick<LifeEvent, "personId" | "personIds">,
  personId: string
): boolean {
  return eventPersonIds(event).includes(personId);
}

/** Canonical person-link fields: omit extras for 0–1 people; keep `personId` as first. */
export function linkedPeopleFields(personIds: string[]): {
  personId?: string;
  personIds?: string[];
} {
  const unique: string[] = [];
  for (const id of personIds) {
    if (id && !unique.includes(id)) unique.push(id);
  }
  if (unique.length === 0) return {};
  if (unique.length === 1) return { personId: unique[0] };
  return { personId: unique[0], personIds: unique };
}

export function buildUpcomingEventItems(
  events: LifeEvent[],
  todayKey: string,
  windowDays = 14,
  maxItems = 10
): UpcomingEventItem[] {
  const endKey = addDaysToDateKey(todayKey, windowDays);
  if (!endKey) return [];

  const inWindow = events.filter((event) => {
    if (event.date < todayKey || event.date > endKey) return false;
    return daysBetweenDateKeys(todayKey, event.date) !== null;
  });

  return sortUpcomingEvents(inWindow)
    .slice(0, maxItems)
    .map((event) => {
      const daysUntil = daysBetweenDateKeys(todayKey, event.date)!;
      return {
        event,
        daysUntil,
        urgencyLabel: formatUpcomingEventUrgencyLabel(daysUntil),
      };
    });
}

export function compareLifeEventsWithinDay(a: LifeEvent, b: LifeEvent): number {
  const aHasTime = a.startTime !== undefined;
  const bHasTime = b.startTime !== undefined;

  if (aHasTime && !bHasTime) return -1;
  if (!aHasTime && bHasTime) return 1;

  if (aHasTime && bHasTime) {
    const byStart = a.startTime!.localeCompare(b.startTime!);
    if (byStart !== 0) return byStart;
  }

  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;

  return a.id.localeCompare(b.id);
}

export function sortUpcomingEvents(events: LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return compareLifeEventsWithinDay(a, b);
  });
}

export function sortPastEvents(events: LifeEvent[]): LifeEvent[] {
  return [...events].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return compareLifeEventsWithinDay(a, b);
  });
}

/** Renames legacy event types on load/import. */
export function migrateLegacyEventTypes(payload: AppPayload): AppPayload {
  let changed = false;
  const events = payload.events.map((event) => {
    if ((event.type as string) === "deadline") {
      changed = true;
      return { ...event, type: "school" as EventType };
    }
    if ((event.type as string) === "career") {
      changed = true;
      return { ...event, type: "vacation" as EventType };
    }
    return event;
  });
  if (!changed) return payload;
  return { ...payload, events };
}

/** Clears person links when the linked person no longer exists (legacy/orphan cleanup). */
export function cleanupOrphanedEventPersonRefs(payload: AppPayload): AppPayload {
  const knownPersonIds = new Set(payload.people.map((p) => p.id));
  let changed = false;
  const events = payload.events.map((event) => {
    const originalIds = eventPersonIds(event);
    const keptIds = originalIds.filter((id) => knownPersonIds.has(id));
    const personIdOrphan =
      event.personId !== undefined && !knownPersonIds.has(event.personId);

    if (keptIds.length === originalIds.length && !personIdOrphan) {
      return event;
    }

    changed = true;
    const next = { ...event };
    delete next.personId;
    delete next.personIds;
    const linked = linkedPeopleFields(keptIds);
    if (linked.personId) next.personId = linked.personId;
    if (linked.personIds) next.personIds = linked.personIds;
    return next;
  });
  if (!changed) return payload;
  return { ...payload, events };
}

/** Drops invalid recurrence metadata so upload validation and DB checks can succeed. */
export function cleanupInvalidEventRecurrence(payload: AppPayload): AppPayload {
  let changed = false;
  const events = payload.events.map((event) => {
    if (event.recurrence !== undefined && !isValidRecurrenceRule(event.recurrence)) {
      changed = true;
      const next = { ...event };
      delete next.recurrence;
      delete next.seriesId;
      return next;
    }
    return event;
  });
  if (!changed) return payload;
  return { ...payload, events };
}

/** Repairs event references on load/import (does not remove valid events). */
export function sanitizeEventReferences(payload: AppPayload): AppPayload {
  let next = migrateLegacyEventTypes(payload);
  next = cleanupOrphanedEventPersonRefs(next);
  next = cleanupInvalidEventRecurrence(next);
  return next;
}

export function partitionEventsByToday(
  events: LifeEvent[],
  today: string
): { upcoming: LifeEvent[]; past: LifeEvent[] } {
  const upcoming: LifeEvent[] = [];
  const past: LifeEvent[] = [];

  for (const event of events) {
    if (event.date >= today) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }

  return {
    upcoming: sortUpcomingEvents(upcoming),
    past: sortPastEvents(past),
  };
}
