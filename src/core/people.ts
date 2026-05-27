/**
 * Pure helpers for the People domain.
 *
 * Future AI extension points (not implemented in v1):
 * - PersonContext bundle for prompt injection (name, preferences, linked events)
 * - Message drafting, gift suggestions, proactive nudges, CSV/vCard import
 */

import {
  daysBetweenDateKeys,
  formatUpcomingEventUrgencyLabel,
  type UpcomingEventUrgencyLabel,
} from "./events";
import type { LifeEvent, Person } from "./model";
import { formatLocalDateKey } from "./timeline";

export type UpcomingBirthdayItem = {
  person: Person;
  nextDateKey: string;
  daysUntil: number;
  urgencyLabel: UpcomingEventUrgencyLabel;
};

export type PersonFollowUpItem = {
  person: Person;
  daysSinceContact: number;
  cadenceDays: number;
};

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function birthdayMonthDayToDay(month: number, day: number, year: number): number {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return 28;
  }
  return day;
}

export function buildPeopleById(people: Person[]): Map<string, Person> {
  return new Map(people.map((person) => [person.id, person]));
}

export function resolveEventPersonLabel(
  event: LifeEvent,
  peopleById: Map<string, Person>
): string | undefined {
  if (event.personId) {
    const person = peopleById.get(event.personId);
    if (person) return person.name;
  }
  return event.personName;
}

export function getNextBirthdayDateKey(person: Person, todayKey: string): string | null {
  if (!person.birthdayMonthDay) return null;

  const [monthStr, dayStr] = person.birthdayMonthDay.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!month || !day) return null;

  const today = parseDateKey(todayKey);
  if (!today) return null;

  let year = today.getFullYear();
  let birthdayDay = birthdayMonthDayToDay(month, day, year);
  let candidate = new Date(year, month - 1, birthdayDay);

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (candidate < todayStart) {
    year += 1;
    birthdayDay = birthdayMonthDayToDay(month, day, year);
    candidate = new Date(year, month - 1, birthdayDay);
  }

  return formatLocalDateKey(candidate);
}

export function buildUpcomingBirthdayItems(
  people: Person[],
  todayKey: string,
  windowDays = 30,
  maxItems = 5
): UpcomingBirthdayItem[] {
  const endDate = parseDateKey(todayKey);
  if (!endDate) return [];

  const endMs = endDate.getTime() + windowDays * 24 * 60 * 60 * 1000;

  const items: UpcomingBirthdayItem[] = [];

  for (const person of people) {
    const nextDateKey = getNextBirthdayDateKey(person, todayKey);
    if (!nextDateKey) continue;

    const nextDate = parseDateKey(nextDateKey);
    if (!nextDate || nextDate.getTime() > endMs) continue;

    const daysUntil = daysBetweenDateKeys(todayKey, nextDateKey);
    if (daysUntil === null || daysUntil < 0) continue;

    items.push({
      person,
      nextDateKey,
      daysUntil,
      urgencyLabel: formatUpcomingEventUrgencyLabel(daysUntil),
    });
  }

  return items
    .sort((a, b) => {
      const byDate = a.nextDateKey.localeCompare(b.nextDateKey);
      if (byDate !== 0) return byDate;
      return a.person.name.localeCompare(b.person.name);
    })
    .slice(0, maxItems);
}

export function buildPeopleNeedingFollowUp(
  people: Person[],
  todayKey: string,
  maxItems = 5
): PersonFollowUpItem[] {
  const items: PersonFollowUpItem[] = [];

  for (const person of people) {
    if (!person.lastContactDate || !person.contactCadenceDays) continue;

    const daysSinceContact = daysBetweenDateKeys(person.lastContactDate, todayKey);
    if (daysSinceContact === null) continue;

    if (daysSinceContact >= person.contactCadenceDays) {
      items.push({
        person,
        daysSinceContact,
        cadenceDays: person.contactCadenceDays,
      });
    }
  }

  return items
    .sort((a, b) => {
      const overdueA = a.daysSinceContact - a.cadenceDays;
      const overdueB = b.daysSinceContact - b.cadenceDays;
      if (overdueB !== overdueA) return overdueB - overdueA;
      return a.person.name.localeCompare(b.person.name);
    })
    .slice(0, maxItems);
}

export function eventsForPerson(events: LifeEvent[], personId: string): LifeEvent[] {
  return events.filter((event) => event.personId === personId);
}

export function sortPeopleByName(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

export function sortPeopleByUpcomingBirthday(
  people: Person[],
  todayKey: string
): Person[] {
  return [...people].sort((a, b) => {
    const aDate = getNextBirthdayDateKey(a, todayKey);
    const bDate = getNextBirthdayDateKey(b, todayKey);
    if (aDate && bDate) {
      const byDate = aDate.localeCompare(bDate);
      if (byDate !== 0) return byDate;
    }
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return a.name.localeCompare(b.name);
  });
}
