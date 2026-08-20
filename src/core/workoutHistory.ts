/**
 * Groups completed workout sessions for the Fitness history list.
 *
 * Recent work stays in week dropdowns; older than ~a month collapses to months;
 * older than a year collapses to years. In-progress sessions stay in their own
 * always-open group so they are not buried.
 */

import { startOfWeekLocal } from "./dashboardStats";
import { isWorkoutSessionInProgress } from "./fitness";
import type { WorkoutSession } from "./model";
import { formatLocalDateKey } from "./timeline";

const MONTH_AGE_DAYS = 28;
const YEAR_AGE_DAYS = 365;

export type SessionHistoryBucketKind = "in_progress" | "week" | "month" | "year";

export type SessionHistoryGroup = {
  id: string;
  kind: SessionHistoryBucketKind;
  label: string;
  sessions: WorkoutSession[];
  defaultExpanded: boolean;
};

function parseDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function daysBetweenDateKeys(fromKey: string, toKey: string): number | undefined {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return undefined;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function addDaysToDateKey(dateKey: string, days: number): string | undefined {
  const date = parseDateKey(dateKey);
  if (!date) return undefined;
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
}

function formatWeekOfLabel(weekStartKey: string): string {
  const date = parseDateKey(weekStartKey);
  if (!date) return `Week of ${weekStartKey}`;
  return `Week of ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function compareSessionsDesc(a: WorkoutSession, b: WorkoutSession): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  return b.updatedAtIso.localeCompare(a.updatedAtIso);
}

function pushIntoGroup(
  groups: Map<string, SessionHistoryGroup>,
  group: Omit<SessionHistoryGroup, "sessions">,
  session: WorkoutSession
): void {
  const existing = groups.get(group.id);
  if (existing) {
    existing.sessions.push(session);
    return;
  }
  groups.set(group.id, { ...group, sessions: [session] });
}

/**
 * Buckets sessions for a collapsible history list. `todayKey` is YYYY-MM-DD.
 * Completed sessions older than 28 days group by month; older than 365 days
 * group by year. In-progress sessions are listed first.
 */
export function groupWorkoutSessionsForHistory(
  sessions: readonly WorkoutSession[],
  todayKey: string
): SessionHistoryGroup[] {
  const today = parseDateKey(todayKey);
  const thisWeekStartKey = today ? formatLocalDateKey(startOfWeekLocal(today)) : todayKey;
  const lastWeekStartKey = addDaysToDateKey(thisWeekStartKey, -7);

  const groups = new Map<string, SessionHistoryGroup>();

  for (const session of sessions) {
    if (isWorkoutSessionInProgress(session)) {
      pushIntoGroup(
        groups,
        {
          id: "in_progress",
          kind: "in_progress",
          label: "In progress",
          defaultExpanded: true,
        },
        session
      );
      continue;
    }

    const age = daysBetweenDateKeys(session.date, todayKey);
    const sessionDate = parseDateKey(session.date);

    if (age === undefined || !sessionDate || age >= YEAR_AGE_DAYS) {
      const year = (sessionDate ?? new Date(0)).getFullYear();
      const yearLabel = Number.isFinite(year) && year > 0 ? String(year) : session.date.slice(0, 4);
      pushIntoGroup(
        groups,
        {
          id: `year:${yearLabel}`,
          kind: "year",
          label: yearLabel,
          defaultExpanded: false,
        },
        session
      );
      continue;
    }

    if (age >= MONTH_AGE_DAYS) {
      const yearMonth = session.date.slice(0, 7);
      pushIntoGroup(
        groups,
        {
          id: `month:${yearMonth}`,
          kind: "month",
          label: formatMonthLabel(yearMonth),
          defaultExpanded: false,
        },
        session
      );
      continue;
    }

    const weekStartKey = formatLocalDateKey(startOfWeekLocal(sessionDate));
    let label = formatWeekOfLabel(weekStartKey);
    if (weekStartKey === thisWeekStartKey) label = "This week";
    else if (weekStartKey === lastWeekStartKey) label = "Last week";

    pushIntoGroup(
      groups,
      {
        id: `week:${weekStartKey}`,
        kind: "week",
        label,
        defaultExpanded: weekStartKey === thisWeekStartKey,
      },
      session
    );
  }

  const ordered = [...groups.values()].map((group) => ({
    ...group,
    sessions: [...group.sessions].sort(compareSessionsDesc),
  }));

  ordered.sort((a, b) => {
    if (a.kind === "in_progress") return -1;
    if (b.kind === "in_progress") return 1;
    const aKey = a.sessions[0]?.date ?? "";
    const bKey = b.sessions[0]?.date ?? "";
    return bKey.localeCompare(aKey);
  });

  return ordered;
}
