import type { EventType, LifeEvent, Person, Skill, Weekday } from "./model";
import { buildPeopleById, resolveEventPersonLabel } from "./people";
import {
  addMinutesToHHMM,
  parseHHMMToMinutes,
  weekdayFromDate,
} from "./schedule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnifiedTimelineItemKind = "scheduleBlock" | "lifeEvent";

export type TimeSortTier = 0 | 1 | 2;

export type UnifiedTimelineItemBase = {
  kind: UnifiedTimelineItemKind;
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  startMin?: number;
  endMin?: number;
  durationMinutes?: number;
  hasConflict?: boolean;
};

export type ScheduleBlockTimelineItem = UnifiedTimelineItemBase & {
  kind: "scheduleBlock";
  skillId: string;
  skillName: string;
  skillPriority?: 1 | 2 | 3 | 4;
  blockId: string;
  plannedMinutes: number;
};

export type LifeEventTimelineItem = UnifiedTimelineItemBase & {
  kind: "lifeEvent";
  eventId: string;
  eventType: EventType;
  reminder: boolean;
  personName?: string;
};

export type UnifiedTimelineItem = ScheduleBlockTimelineItem | LifeEventTimelineItem;

export type TimelineConflictReason =
  | "eventBlocksSchedule"
  | "scheduleOverlap"
  | "eventOverlap";

export type TimelineConflict = {
  date: string;
  aId: string;
  bId: string;
  overlapStartTime: string;
  overlapEndTime: string;
  overlapMinutes: number;
  severity: "info" | "warn";
  reason: TimelineConflictReason;
};

export type UnifiedTimelineDay = {
  date: string;
  items: UnifiedTimelineItem[];
  conflicts: TimelineConflict[];
};

export type DailyWorkloadTotals = {
  date: string;
  plannedSkillMinutes: number;
  blockedMinutes: number;
  conflictMinutes: number;
  netAvailableForSkillsMinutes: number;
  netFreeMinutes: number;
};

export type WeekWorkloadSummary = {
  totalPlanned: number;
  totalBlocked: number;
  totalConflict: number;
  totalNetAvailable: number;
};

export type BuildUnifiedTimelineOptions = {
  includeUntimedEvents?: boolean;
  includeScheduleBlocks?: boolean;
  people?: Person[];
};

type TimedInterval = {
  item: UnifiedTimelineItem;
  id: string;
  startMin: number;
  endMin: number;
};

// ---------------------------------------------------------------------------
// String date helpers (storage stays YYYY-MM-DD / HH:MM)
// ---------------------------------------------------------------------------

export function formatLocalDateKey(d: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function iterateDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return [];

  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const current = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates: string[] = [];

  while (current <= end) {
    dates.push(formatLocalDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function weekdayFromDateString(date: string): Weekday {
  const [year, month, day] = date.split("-").map(Number);
  return weekdayFromDate(new Date(year, month - 1, day));
}

export function minutesToHHMM(minutes: number): string {
  const clamped = Math.max(0, minutes);
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function isForecastableTimed(item: UnifiedTimelineItem): boolean {
  return (
    item.startTime !== undefined &&
    item.endTime !== undefined &&
    item.startMin !== undefined &&
    item.endMin !== undefined &&
    item.endMin > item.startMin
  );
}

export function timeSortTier(item: UnifiedTimelineItem): TimeSortTier {
  const hasStart = item.startTime !== undefined;
  const hasEnd = item.endTime !== undefined;
  if (hasStart && hasEnd) return 0;
  if (hasStart) return 1;
  return 2;
}

export function stableItemId(item: UnifiedTimelineItem): string {
  if (item.kind === "scheduleBlock") {
    return `scheduleBlock:${item.skillId}:${item.blockId}:${item.date}`;
  }
  return `lifeEvent:${item.eventId}`;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export function compareUnifiedTimelineItems(
  a: UnifiedTimelineItem,
  b: UnifiedTimelineItem
): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;

  const tierA = timeSortTier(a);
  const tierB = timeSortTier(b);
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

  if (a.kind !== b.kind) {
    return a.kind === "scheduleBlock" ? -1 : 1;
  }

  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;

  return stableItemId(a).localeCompare(stableItemId(b));
}

export function sortUnifiedTimelineItems(items: UnifiedTimelineItem[]): UnifiedTimelineItem[] {
  return [...items].sort(compareUnifiedTimelineItems);
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

function scheduleBlockToItem(
  skill: Skill,
  block: Skill["schedule"][Weekday][number],
  date: string
): ScheduleBlockTimelineItem {
  const blockMinutes = Number.isInteger(block.minutes) ? block.minutes : 0;
  const startMin = parseHHMMToMinutes(block.startTime);
  const endTime = addMinutesToHHMM(block.startTime, blockMinutes);
  const endMin = startMin + blockMinutes;

  return {
    kind: "scheduleBlock",
    date,
    title: skill.name,
    startTime: block.startTime,
    endTime,
    startMin,
    endMin,
    durationMinutes: blockMinutes,
    skillId: skill.id,
    skillName: skill.name,
    skillPriority: skill.priority,
    blockId: block.id,
    plannedMinutes: blockMinutes,
  };
}

function lifeEventToItem(
  event: LifeEvent,
  peopleById: Map<string, Person>
): LifeEventTimelineItem {
  const item: LifeEventTimelineItem = {
    kind: "lifeEvent",
    date: event.date,
    title: event.title,
    eventId: event.id,
    eventType: event.type,
    reminder: event.reminder,
  };

  const personLabel = resolveEventPersonLabel(event, peopleById);
  if (personLabel) {
    item.personName = personLabel;
  }

  if (event.startTime) {
    item.startTime = event.startTime;
    item.startMin = parseHHMMToMinutes(event.startTime);
  }

  if (event.startTime && event.endTime) {
    item.endTime = event.endTime;
    item.endMin = parseHHMMToMinutes(event.endTime);
    const duration = item.endMin - (item.startMin ?? 0);
    if (duration > 0) {
      item.durationMinutes = duration;
    }
  }

  return item;
}

function generateScheduleItems(
  skills: Skill[],
  dates: string[]
): ScheduleBlockTimelineItem[] {
  const items: ScheduleBlockTimelineItem[] = [];

  for (const date of dates) {
    const dayKey = weekdayFromDateString(date);
    for (const skill of skills) {
      const blocks = skill.schedule[dayKey] ?? [];
      for (const block of blocks) {
        items.push(scheduleBlockToItem(skill, block, date));
      }
    }
  }

  return items;
}

function generateEventItems(
  events: LifeEvent[],
  startDate: string,
  endDate: string,
  includeUntimedEvents: boolean,
  peopleById: Map<string, Person>
): LifeEventTimelineItem[] {
  const items: LifeEventTimelineItem[] = [];

  for (const event of events) {
    if (event.date < startDate || event.date > endDate) continue;
    const item = lifeEventToItem(event, peopleById);
    if (!includeUntimedEvents && timeSortTier(item) === 2) continue;
    items.push(item);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

function classifyConflictReason(
  a: UnifiedTimelineItem,
  b: UnifiedTimelineItem
): TimelineConflictReason {
  if (a.kind === "scheduleBlock" && b.kind === "lifeEvent") {
    return "eventBlocksSchedule";
  }
  if (a.kind === "lifeEvent" && b.kind === "scheduleBlock") {
    return "eventBlocksSchedule";
  }
  if (a.kind === "scheduleBlock" && b.kind === "scheduleBlock") {
    return "scheduleOverlap";
  }
  return "eventOverlap";
}

function conflictSeverity(reason: TimelineConflictReason): "info" | "warn" {
  return reason === "eventBlocksSchedule" ? "warn" : "info";
}

function buildTimedIntervals(items: UnifiedTimelineItem[]): TimedInterval[] {
  return items
    .filter(isForecastableTimed)
    .map((item) => ({
      item,
      id: stableItemId(item),
      startMin: item.startMin!,
      endMin: item.endMin!,
    }))
    .sort((a, b) => a.startMin - b.startMin);
}

export function detectConflictsForDay(
  date: string,
  items: UnifiedTimelineItem[]
): TimelineConflict[] {
  const intervals = buildTimedIntervals(items);
  const conflicts: TimelineConflict[] = [];
  const active: TimedInterval[] = [];

  for (const current of intervals) {
    const stillActive: TimedInterval[] = [];

    for (const prior of active) {
      if (prior.endMin <= current.startMin) continue;
      stillActive.push(prior);

      const overlapStart = Math.max(prior.startMin, current.startMin);
      const overlapEnd = Math.min(prior.endMin, current.endMin);
      if (overlapEnd <= overlapStart) continue;

      const reason = classifyConflictReason(prior.item, current.item);
      conflicts.push({
        date,
        aId: prior.id,
        bId: current.id,
        overlapStartTime: minutesToHHMM(overlapStart),
        overlapEndTime: minutesToHHMM(overlapEnd),
        overlapMinutes: overlapEnd - overlapStart,
        severity: conflictSeverity(reason),
        reason,
      });
    }

    stillActive.push(current);
    active.length = 0;
    active.push(...stillActive);
  }

  return conflicts;
}

function annotateConflictFlags(
  items: UnifiedTimelineItem[],
  conflicts: TimelineConflict[]
): UnifiedTimelineItem[] {
  const conflictIds = new Set<string>();
  for (const conflict of conflicts) {
    conflictIds.add(conflict.aId);
    conflictIds.add(conflict.bId);
  }

  return items.map((item) => ({
    ...item,
    hasConflict: conflictIds.has(stableItemId(item)),
  }));
}

// ---------------------------------------------------------------------------
// Merge + range build
// ---------------------------------------------------------------------------

export function buildUnifiedTimelineRange(
  skills: Skill[],
  events: LifeEvent[],
  startDate: string,
  endDate: string,
  opts: BuildUnifiedTimelineOptions = {}
): UnifiedTimelineDay[] {
  const includeUntimedEvents = opts.includeUntimedEvents ?? true;
  const includeScheduleBlocks = opts.includeScheduleBlocks ?? true;
  const peopleById = buildPeopleById(opts.people ?? []);

  const dates = iterateDateRange(startDate, endDate);
  const items: UnifiedTimelineItem[] = [];

  if (includeScheduleBlocks) {
    items.push(...generateScheduleItems(skills, dates));
  }

  items.push(
    ...generateEventItems(
      events,
      startDate,
      endDate,
      includeUntimedEvents,
      peopleById
    )
  );

  const sorted = sortUnifiedTimelineItems(items);
  const byDate = new Map<string, UnifiedTimelineItem[]>();

  for (const date of dates) {
    byDate.set(date, []);
  }

  for (const item of sorted) {
    const dayItems = byDate.get(item.date);
    if (dayItems) {
      dayItems.push(item);
    } else if (item.date >= startDate && item.date <= endDate) {
      byDate.set(item.date, [item]);
    }
  }

  const days: UnifiedTimelineDay[] = [];

  for (const date of dates) {
    const dayItems = byDate.get(date) ?? [];
    const conflicts = detectConflictsForDay(date, dayItems);
    days.push({
      date,
      items: annotateConflictFlags(dayItems, conflicts),
      conflicts,
    });
  }

  return days;
}

// ---------------------------------------------------------------------------
// Workload aggregation
// ---------------------------------------------------------------------------

export function computeDailyWorkloadForDay(day: UnifiedTimelineDay): DailyWorkloadTotals {
  let plannedSkillMinutes = 0;
  let blockedMinutes = 0;

  for (const item of day.items) {
    if (item.kind === "scheduleBlock") {
      plannedSkillMinutes += item.plannedMinutes;
    } else if (item.kind === "lifeEvent" && isForecastableTimed(item)) {
      blockedMinutes += item.durationMinutes ?? 0;
    }
  }

  let conflictMinutes = 0;
  for (const conflict of day.conflicts) {
    if (conflict.reason === "eventBlocksSchedule") {
      conflictMinutes += conflict.overlapMinutes;
    }
  }

  return {
    date: day.date,
    plannedSkillMinutes,
    blockedMinutes,
    conflictMinutes,
    netAvailableForSkillsMinutes: plannedSkillMinutes - conflictMinutes,
    netFreeMinutes: 1440 - blockedMinutes,
  };
}

export function computeDailyWorkload(days: UnifiedTimelineDay[]): DailyWorkloadTotals[] {
  return days.map(computeDailyWorkloadForDay);
}

export function summarizeWeek(workloads: DailyWorkloadTotals[]): WeekWorkloadSummary {
  return workloads.reduce(
    (acc, day) => ({
      totalPlanned: acc.totalPlanned + day.plannedSkillMinutes,
      totalBlocked: acc.totalBlocked + day.blockedMinutes,
      totalConflict: acc.totalConflict + day.conflictMinutes,
      totalNetAvailable: acc.totalNetAvailable + day.netAvailableForSkillsMinutes,
    }),
    {
      totalPlanned: 0,
      totalBlocked: 0,
      totalConflict: 0,
      totalNetAvailable: 0,
    }
  );
}
