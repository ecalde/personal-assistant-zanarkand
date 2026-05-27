import type { LifeEvent } from "./model";

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
