// Pure, read-only calendar derivation layer.
//
// Converts skills, life events, people birthdays, and optional fitness history
// into common CalendarItem rows for an inclusive YYYY-MM-DD date range. This is
// a broader, multi-day DTO than timeline.ts (which stays the today-focused merge
// with conflict/workload detection). No UI, schema, dependencies, or side effects;
// total functions that never mutate their inputs.
//
// Career is reserved in the source-type union but emits no items: career
// interviews/deadlines currently flow through life events (sourceType "event").
// Recurring life events (event.recurrence) expand via the pure recurrence engine
// into one CalendarItem per occurrence. Skill weekly blocks remain a separate
// implicit recurrence (weekday template expansion).

import type {
  EventType,
  LifeEvent,
  Person,
  Priority,
  Skill,
  WorkoutFocus,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import { buildPeopleById, resolveEventPersonLabel } from "./people";
import {
  expandWorkoutOccurrencesForDateRange,
  formatSessionHeadline,
  isPlanSchedulable,
} from "./fitness";
import { addMinutesToHHMM } from "./schedule";
import { isSkillActiveOnDate, getSkillSeriesDateRange } from "./skillSeries";
import { getWorkoutPlanSeriesDateRange } from "./workoutSeries";
import { iterateDateRange, weekdayFromDateString } from "./timeline";
import { expandRecurrenceInstances, type RecurrenceInstance } from "./recurrence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarSourceType =
  | "skill"
  | "event"
  | "people"
  | "fitness"
  | "career"; // reserved; no items emitted yet

export type CalendarTimeSortTier = 0 | 1 | 2;

export type CalendarItemSourceMeta =
  | {
      kind: "skillScheduleBlock";
      skillId: string;
      blockId: string;
      skillName: string;
      skillPriority?: Priority;
      plannedMinutes: number;
    }
  | {
      kind: "lifeEvent";
      eventId: string;
      eventType: EventType;
      reminder: boolean;
      personName?: string;
      // Present only for recurring-event instances (one-time events omit these).
      recurrenceDate?: string; // instance.date (where it appears)
      originalDate?: string; // instance.originalDate when an override moved it
      occurrenceIndex?: number;
      isRecurrenceException?: boolean;
    }
  | {
      kind: "personBirthday";
      personId: string;
      personName: string;
      birthdayMonthDay: string;
    }
  | {
      kind: "workoutSession";
      sessionId: string;
      planId?: string;
      focus?: WorkoutFocus;
      durationMinutes?: number;
      completedAtIso: string;
    }
  | {
      kind: "workoutScheduleBlock";
      planId: string;
      blockId: string;
      planName: string;
      focus?: WorkoutFocus;
      plannedMinutes: number;
      occurrenceDate: string;
    };

export type CalendarItem = {
  id: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  date: string; // YYYY-MM-DD local
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  allDay?: boolean;
  categoryKey: string; // mirrors sourceType; assignable to CalendarColorResolutionInput
  subcategoryKey?: string;
  colorKey?: string; // per-item color override hook (unused here)
  iconKey?: string; // per-item icon override hook (unused here)
  description?: string;
  isTimed: boolean;
  isMultiDay: boolean;
  sourceMeta: CalendarItemSourceMeta;
};

export type BuildCalendarItemsForRangeInput = {
  startDate: string;
  endDate: string;
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions?: WorkoutSession[];
  workoutPlans?: WorkoutPlan[];
};

export type BuildCalendarItemsForRangeOptions = {
  includeSkills?: boolean; // default true
  includeEvents?: boolean; // default true
  includePeopleBirthdays?: boolean; // default true
  includeFitnessHistory?: boolean; // default false
  includeWorkoutSchedules?: boolean; // default false
};

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

export function buildStableCalendarItemId(
  meta: CalendarItemSourceMeta,
  date: string
): string {
  switch (meta.kind) {
    case "skillScheduleBlock":
      return `skill:${meta.skillId}:${meta.blockId}:${date}`;
    case "lifeEvent":
      return meta.recurrenceDate !== undefined
        ? `event:${meta.eventId}:${meta.recurrenceDate}`
        : `event:${meta.eventId}`;
    case "personBirthday":
      return `people:birthday:${meta.personId}:${date}`;
    case "workoutSession":
      return `fitness:session:${meta.sessionId}`;
    case "workoutScheduleBlock":
      return `fitness:plan:${meta.planId}:${meta.blockId}:${meta.occurrenceDate}`;
  }
}

// ---------------------------------------------------------------------------
// Sorting (mirrors compareUnifiedTimelineItems for cross-surface consistency)
// ---------------------------------------------------------------------------

export function calendarTimeSortTier(item: CalendarItem): CalendarTimeSortTier {
  const hasStart = item.startTime !== undefined;
  const hasEnd = item.endTime !== undefined;
  if (hasStart && hasEnd) return 0;
  if (hasStart) return 1;
  return 2;
}

const SOURCE_SORT_ORDER: Record<CalendarSourceType, number> = {
  skill: 0,
  event: 1,
  people: 2,
  fitness: 3,
  career: 4,
};

export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;

  const tierA = calendarTimeSortTier(a);
  const tierB = calendarTimeSortTier(b);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0) {
    const byStart = a.startTime!.localeCompare(b.startTime!);
    if (byStart !== 0) return byStart;
    const byEnd = a.endTime!.localeCompare(b.endTime!);
    if (byEnd !== 0) return byEnd;
  } else if (tierA === 1) {
    const byStart = a.startTime!.localeCompare(b.startTime!);
    if (byStart !== 0) return byStart;
  }

  const bySource =
    SOURCE_SORT_ORDER[a.sourceType] - SOURCE_SORT_ORDER[b.sourceType];
  if (bySource !== 0) return bySource;

  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;

  return a.id.localeCompare(b.id);
}

export function sortCalendarItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(compareCalendarItems);
}

/** Buckets sorted items per day; preserves sort order within each day. */
export function groupCalendarItemsByDate(
  items: CalendarItem[]
): Map<string, CalendarItem[]> {
  const sorted = sortCalendarItems(items);
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of sorted) {
    const existing = byDate.get(item.date);
    if (existing) {
      existing.push(item);
    } else {
      byDate.set(item.date, [item]);
    }
  }
  return byDate;
}

// ---------------------------------------------------------------------------
// Local helpers (kept private to avoid widening other modules' exports)
// ---------------------------------------------------------------------------

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function birthdayDayForYear(month: number, day: number, year: number): number {
  if (month === 2 && day === 29 && !isLeapYear(year)) return 28;
  return day;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localTimeFromIso(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function skillSeriesIntersectsRange(
  skill: Skill,
  queryStart: string,
  queryEnd: string
): boolean {
  const range = getSkillSeriesDateRange(skill);
  if (range.kind === "unbounded") return true;
  return range.startDate <= queryEnd && range.endDate >= queryStart;
}

function collectSkillItems(
  skills: Skill[],
  dates: string[],
  queryStart: string,
  queryEnd: string
): CalendarItem[] {
  const items: CalendarItem[] = [];
  const eligibleSkills = skills.filter((skill) =>
    skillSeriesIntersectsRange(skill, queryStart, queryEnd)
  );

  for (const date of dates) {
    const weekday = weekdayFromDateString(date);
    for (const skill of eligibleSkills) {
      if (!isSkillActiveOnDate(skill, date)) continue;
      const blocks = skill.schedule[weekday] ?? [];
      for (const block of blocks) {
        const plannedMinutes = Number.isInteger(block.minutes) ? block.minutes : 0;
        const endTime = addMinutesToHHMM(block.startTime, plannedMinutes);
        const meta: CalendarItemSourceMeta = {
          kind: "skillScheduleBlock",
          skillId: skill.id,
          blockId: block.id,
          skillName: skill.name,
          skillPriority: skill.priority,
          plannedMinutes,
        };
        items.push({
          id: buildStableCalendarItemId(meta, date),
          sourceType: "skill",
          sourceId: block.id,
          title: skill.name,
          date,
          startTime: block.startTime,
          endTime,
          allDay: false,
          categoryKey: "skill",
          subcategoryKey: "scheduleBlock",
          isTimed: true,
          isMultiDay: false,
          sourceMeta: meta,
        });
      }
    }
  }

  return items;
}

function buildEventCalendarItem(
  event: LifeEvent,
  date: string,
  personLabel: string | undefined,
  instance?: RecurrenceInstance
): CalendarItem {
  const hasStart = event.startTime !== undefined;
  const hasEnd = hasStart && event.endTime !== undefined;

  const meta: CalendarItemSourceMeta = {
    kind: "lifeEvent",
    eventId: event.id,
    eventType: event.type,
    reminder: event.reminder,
    ...(personLabel ? { personName: personLabel } : {}),
    ...(instance
      ? {
          recurrenceDate: instance.date,
          ...(instance.originalDate !== undefined
            ? { originalDate: instance.originalDate }
            : {}),
          occurrenceIndex: instance.occurrenceIndex,
          isRecurrenceException: instance.isException,
        }
      : {}),
  };

  const item: CalendarItem = {
    id: buildStableCalendarItemId(meta, date),
    sourceType: "event",
    sourceId: event.id,
    title: event.title,
    date,
    allDay: !hasStart,
    categoryKey: "event",
    subcategoryKey: event.type,
    isTimed: hasStart,
    isMultiDay: false,
    sourceMeta: meta,
  };

  if (hasStart) item.startTime = event.startTime;
  if (hasEnd) item.endTime = event.endTime;
  if (event.notes) item.description = event.notes;

  return item;
}

function collectEventItems(
  events: LifeEvent[],
  startDate: string,
  endDate: string,
  peopleById: Map<string, Person>
): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const event of events) {
    const personLabel = resolveEventPersonLabel(event, peopleById);

    // Recurring events expand into one CalendarItem per occurrence in range.
    if (event.recurrence) {
      const instances = expandRecurrenceInstances(event.recurrence, startDate, endDate);
      for (const instance of instances) {
        items.push(buildEventCalendarItem(event, instance.date, personLabel, instance));
      }
      continue;
    }

    // One-time events keep their original single-date behavior.
    if (event.date < startDate || event.date > endDate) continue;
    items.push(buildEventCalendarItem(event, event.date, personLabel));
  }

  return items;
}

function hasBirthdayEventForPerson(
  person: Person,
  date: string,
  events: LifeEvent[]
): boolean {
  return events.some(
    (event) =>
      event.type === "birthday" &&
      event.date === date &&
      (event.personId === person.id ||
        (event.personName !== undefined && event.personName === person.name))
  );
}

function collectBirthdayItems(
  people: Person[],
  events: LifeEvent[],
  startDate: string,
  endDate: string
): CalendarItem[] {
  const items: CalendarItem[] = [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return items;

  for (const person of people) {
    if (!person.birthdayMonthDay) continue;
    const [monthStr, dayStr] = person.birthdayMonthDay.split("-");
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!month || !day) continue;

    for (let year = startYear; year <= endYear; year += 1) {
      const birthdayDay = birthdayDayForYear(month, day, year);
      const date = `${year}-${pad2(month)}-${pad2(birthdayDay)}`;
      if (date < startDate || date > endDate) continue;
      if (hasBirthdayEventForPerson(person, date, events)) continue;

      const meta: CalendarItemSourceMeta = {
        kind: "personBirthday",
        personId: person.id,
        personName: person.name,
        birthdayMonthDay: person.birthdayMonthDay,
      };
      items.push({
        id: buildStableCalendarItemId(meta, date),
        sourceType: "people",
        sourceId: person.id,
        title: `${person.name}'s birthday`,
        date,
        allDay: true,
        categoryKey: "people",
        subcategoryKey: "birthday",
        isTimed: false,
        isMultiDay: false,
        sourceMeta: meta,
      });
    }
  }

  return items;
}

function workoutPlanSeriesIntersectsRange(
  plan: WorkoutPlan,
  queryStart: string,
  queryEnd: string
): boolean {
  const range = getWorkoutPlanSeriesDateRange(plan);
  if (range.kind === "unbounded") return true;
  return range.startDate <= queryEnd && range.endDate >= queryStart;
}

function collectWorkoutScheduleItems(
  plans: WorkoutPlan[],
  startDate: string,
  endDate: string
): CalendarItem[] {
  const items: CalendarItem[] = [];
  const eligiblePlans = plans.filter(
    (plan) => isPlanSchedulable(plan) && workoutPlanSeriesIntersectsRange(plan, startDate, endDate)
  );

  const occurrences = expandWorkoutOccurrencesForDateRange(eligiblePlans, startDate, endDate);
  for (const occurrence of occurrences) {
    const plannedMinutes = Number.isInteger(occurrence.block.minutes)
      ? occurrence.block.minutes
      : 0;
    const endTime = addMinutesToHHMM(occurrence.block.startTime, plannedMinutes);
    const meta: CalendarItemSourceMeta = {
      kind: "workoutScheduleBlock",
      planId: occurrence.planId,
      blockId: occurrence.blockId,
      planName: occurrence.planName,
      plannedMinutes,
      occurrenceDate: occurrence.dateKey,
      ...(occurrence.focus ? { focus: occurrence.focus } : {}),
    };

    items.push({
      id: buildStableCalendarItemId(meta, occurrence.dateKey),
      sourceType: "fitness",
      sourceId: occurrence.blockId,
      title: occurrence.planName,
      date: occurrence.dateKey,
      startTime: occurrence.block.startTime,
      endTime,
      allDay: false,
      categoryKey: "fitness",
      subcategoryKey: "scheduled",
      isTimed: true,
      isMultiDay: false,
      sourceMeta: meta,
    });
  }

  return items;
}

function collectFitnessItems(
  sessions: WorkoutSession[],
  startDate: string,
  endDate: string
): CalendarItem[] {
  const items: CalendarItem[] = [];

  for (const session of sessions) {
    if (session.date < startDate || session.date > endDate) continue;
    if (!session.completedAtIso) continue;

    const startTime = localTimeFromIso(session.completedAtIso);
    if (!startTime) continue; // defensive: skip unparseable ISO

    const hasDuration =
      session.durationMinutes !== undefined && session.durationMinutes > 0;
    const endTime = hasDuration
      ? addMinutesToHHMM(startTime, session.durationMinutes!)
      : undefined;

    const meta: CalendarItemSourceMeta = {
      kind: "workoutSession",
      sessionId: session.id,
      ...(session.planId ? { planId: session.planId } : {}),
      ...(session.focus ? { focus: session.focus } : {}),
      ...(hasDuration ? { durationMinutes: session.durationMinutes } : {}),
      completedAtIso: session.completedAtIso,
    };

    const item: CalendarItem = {
      id: buildStableCalendarItemId(meta, session.date),
      sourceType: "fitness",
      sourceId: session.id,
      title: formatSessionHeadline(session),
      date: session.date,
      startTime,
      allDay: false,
      categoryKey: "fitness",
      isTimed: true,
      isMultiDay: false,
      sourceMeta: meta,
    };

    if (session.focus) item.subcategoryKey = session.focus;
    if (endTime) item.endTime = endTime;
    if (session.notes) item.description = session.notes;

    items.push(item);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function buildCalendarItemsForRange(
  input: BuildCalendarItemsForRangeInput,
  options: BuildCalendarItemsForRangeOptions = {}
): CalendarItem[] {
  const includeSkills = options.includeSkills ?? true;
  const includeEvents = options.includeEvents ?? true;
  const includePeopleBirthdays = options.includePeopleBirthdays ?? true;
  const includeFitnessHistory = options.includeFitnessHistory ?? false;
  const includeWorkoutSchedules = options.includeWorkoutSchedules ?? false;

  const dates = iterateDateRange(input.startDate, input.endDate);
  if (dates.length === 0) return [];

  const peopleById = buildPeopleById(input.people);
  const items: CalendarItem[] = [];

  if (includeSkills) {
    items.push(
      ...collectSkillItems(input.skills, dates, input.startDate, input.endDate)
    );
  }
  if (includeEvents) {
    items.push(
      ...collectEventItems(input.events, input.startDate, input.endDate, peopleById)
    );
  }
  if (includePeopleBirthdays) {
    items.push(
      ...collectBirthdayItems(
        input.people,
        input.events,
        input.startDate,
        input.endDate
      )
    );
  }
  if (includeFitnessHistory) {
    items.push(
      ...collectFitnessItems(
        input.workoutSessions ?? [],
        input.startDate,
        input.endDate
      )
    );
  }
  if (includeWorkoutSchedules) {
    items.push(
      ...collectWorkoutScheduleItems(
        input.workoutPlans ?? [],
        input.startDate,
        input.endDate
      )
    );
  }

  return sortCalendarItems(items);
}
