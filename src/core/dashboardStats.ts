import type { ScheduleBlock, Session, Skill, Weekday } from "./model";
import {
  addMinutesToHHMM,
  expectedMinutesByNow,
  minutesSinceMidnight,
  parseHHMMToMinutes,
  weekdayFromDate,
  type BlockStatus,
  type CompletionStatus,
} from "./schedule";
import { isSameLocalDay } from "./time";

export type SkillDayRow = {
  skill: Skill;
  todayMinutes: number;
  expectedByNow: number;
  plannedTodayMinutes: number;
  status: CompletionStatus;
  progressTargetMinutes: number | null;
  progressPercent: number | null;
};

export type TimelineItem = {
  skill: Skill;
  block: ScheduleBlock;
  startTime: string;
  endTime: string;
  startMin: number;
  endMin: number;
  plannedUpToStart: number;
  plannedUpToEnd: number;
  loggedSoFar: number;
  status: BlockStatus;
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function minutesOnLocalDay(
  sessions: Session[],
  day: Date,
  opts?: { skillId?: string; excludeAfter?: Date }
): number {
  return sessions
    .filter((s) => {
      if (!isSameLocalDay(s.startedAtIso, day)) return false;
      if (opts?.skillId !== undefined && s.skillId !== opts.skillId) return false;
      if (opts?.excludeAfter !== undefined && new Date(s.startedAtIso) > opts.excludeAfter) {
        return false;
      }
      return true;
    })
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function plannedMinutesForDay(skill: Skill, dayKey: Weekday): number {
  const blocks = skill.schedule[dayKey] ?? [];
  return blocks.reduce(
    (sum, b) => sum + (Number.isInteger(b.minutes) ? b.minutes : 0),
    0
  );
}

export function startOfWeekLocal(date: Date = new Date()): Date {
  const d = startOfLocalDay(date);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

export function isInLocalWeek(iso: string, weekStart: Date): boolean {
  const sessionDate = new Date(iso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return sessionDate >= weekStart && sessionDate < weekEnd;
}

export function minutesThisWeekForSkill(
  sessions: Session[],
  skillId: string,
  now: Date = new Date()
): number {
  const weekStart = startOfWeekLocal(now);
  return sessions
    .filter((s) => s.skillId === skillId && isInLocalWeek(s.startedAtIso, weekStart))
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function totalMinutesToday(sessions: Session[], now: Date = new Date()): number {
  const today = startOfLocalDay(now);
  return minutesOnLocalDay(sessions, today);
}

function progressTargetForSkill(skill: Skill, plannedTodayMinutes: number): number | null {
  const target = skill.dailyGoalMinutes ?? plannedTodayMinutes;
  return target > 0 ? target : null;
}

function progressPercentFor(todayMinutes: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.min(100, Math.round((todayMinutes / target) * 100));
}

export function buildSkillDayRows(
  skills: Skill[],
  sessions: Session[],
  now: Date = new Date()
): SkillDayRow[] {
  const today = startOfLocalDay(now);
  const dayKey = weekdayFromDate(now);

  return skills.map((skill) => {
    const todayMinutes = minutesOnLocalDay(sessions, today, { skillId: skill.id });
    const blocks = skill.schedule[dayKey] ?? [];
    const expectedByNow = expectedMinutesByNow(blocks, now);
    const plannedTodayMinutes = plannedMinutesForDay(skill, dayKey);

    const status: CompletionStatus =
      expectedByNow === 0
        ? "idle"
        : todayMinutes >= expectedByNow
          ? "onTrack"
          : "overdue";

    const progressTargetMinutes = progressTargetForSkill(skill, plannedTodayMinutes);
    const progressPercent = progressPercentFor(todayMinutes, progressTargetMinutes);

    return {
      skill,
      todayMinutes,
      expectedByNow,
      plannedTodayMinutes,
      status,
      progressTargetMinutes,
      progressPercent,
    };
  });
}

export function aggregateProgressTarget(rows: SkillDayRow[]): number {
  return rows.reduce((sum, r) => sum + (r.progressTargetMinutes ?? 0), 0);
}

/** @deprecated Prefer `buildUnifiedTimelineRange` from `timeline.ts` for merged schedule + event views. */
export function buildTimelineItems(
  skills: Skill[],
  sessions: Session[],
  now: Date = new Date()
): TimelineItem[] {
  const today = startOfLocalDay(now);
  const dayKey = weekdayFromDate(now);
  const currentMinute = minutesSinceMidnight(now);

  const loggedBySkill: Record<string, number> = {};
  for (const skill of skills) {
    loggedBySkill[skill.id] = minutesOnLocalDay(sessions, today, {
      skillId: skill.id,
      excludeAfter: now,
    });
  }

  const items: TimelineItem[] = [];

  for (const skill of skills) {
    const blocks = skill.schedule[dayKey] ?? [];
    const sortedBlocks = [...blocks].sort(
      (a, b) => parseHHMMToMinutes(a.startTime) - parseHHMMToMinutes(b.startTime)
    );

    let cumulative = 0;
    const loggedSoFar = loggedBySkill[skill.id] ?? 0;

    for (const block of sortedBlocks) {
      const startMin = parseHHMMToMinutes(block.startTime);
      const blockMinutes = Number.isInteger(block.minutes) ? block.minutes : 0;
      const endMin = startMin + blockMinutes;

      const plannedUpToStart = cumulative;
      const plannedUpToEnd = cumulative + blockMinutes;

      let status: BlockStatus = "upcoming";

      if (currentMinute < startMin) {
        status = "upcoming";
      } else if (currentMinute >= startMin && currentMinute < endMin) {
        status = loggedSoFar >= plannedUpToStart ? "inProgress" : "behind";
      } else {
        status = loggedSoFar >= plannedUpToEnd ? "done" : "behind";
      }

      items.push({
        skill,
        block,
        startTime: block.startTime,
        endTime: addMinutesToHHMM(block.startTime, block.minutes),
        startMin,
        endMin,
        plannedUpToStart,
        plannedUpToEnd,
        loggedSoFar,
        status,
      });

      cumulative = plannedUpToEnd;
    }
  }

  items.sort((a, b) => a.startMin - b.startMin);
  return items;
}
