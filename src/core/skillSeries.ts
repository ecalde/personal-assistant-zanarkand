// Pure skill schedule-series helpers.
//
// Validates optional schedule bounds on Skill (when the weekly template applies),
// without touching UI, calendar expansion, or recurrence rules. Total functions
// that never throw and never mutate inputs. Dates are local YYYY-MM-DD keys
// compared lexicographically (no timezone/DST handling).

import type { AppPayload, Skill, SkillRecurrenceMode, SkillScheduleSeries } from "./model";

export type SkillSeriesDateRange =
  | { kind: "unbounded" }
  | { kind: "bounded"; startDate: string; endDate: string };

const SKILL_RECURRENCE_MODES: SkillRecurrenceMode[] = [
  "indefinite",
  "date_range",
  "single_day",
];

const ALLOWED_KEYS = ["mode", "startDate", "endDate", "singleDate"] as const;

/** Open-ended upper bound for indefinite series with a startDate (range hints only). */
const OPEN_END_DATE = "9999-12-31";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type ParsedDate = { year: number; month: number; day: number };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

function parseDateKey(key: unknown): ParsedDate | null {
  if (typeof key !== "string" || !DATE_KEY_RE.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function compareDateKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isValidDateField(value: unknown): value is string {
  return typeof value === "string" && parseDateKey(value) !== null;
}

export function isValidSkillScheduleSeries(raw: unknown): raw is SkillScheduleSeries {
  return normalizeSkillScheduleSeries(raw) !== undefined;
}

export function normalizeSkillScheduleSeries(raw: unknown): SkillScheduleSeries | undefined {
  if (!isPlainObject(raw)) return undefined;

  for (const key of Object.keys(raw)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) return undefined;
  }

  const mode = raw.mode;
  if (typeof mode !== "string" || !SKILL_RECURRENCE_MODES.includes(mode as SkillRecurrenceMode)) {
    return undefined;
  }

  const startDate = raw.startDate;
  const endDate = raw.endDate;
  const singleDate = raw.singleDate;

  switch (mode) {
    case "indefinite": {
      if (endDate !== undefined || singleDate !== undefined) return undefined;
      if (startDate === undefined) {
        return { mode: "indefinite" };
      }
      if (!isValidDateField(startDate)) return undefined;
      return { mode: "indefinite", startDate };
    }
    case "date_range": {
      if (singleDate !== undefined) return undefined;
      if (!isValidDateField(startDate) || !isValidDateField(endDate)) return undefined;
      if (compareDateKeys(startDate, endDate) > 0) return undefined;
      return { mode: "date_range", startDate, endDate };
    }
    case "single_day": {
      if (startDate !== undefined || endDate !== undefined) return undefined;
      if (!isValidDateField(singleDate)) return undefined;
      return { mode: "single_day", singleDate };
    }
    default:
      return undefined;
  }
}

export function isSkillActiveOnDate(skill: Skill, dateKey: string): boolean {
  if (!parseDateKey(dateKey)) return false;

  if (skill.scheduleSeries === undefined) return true;

  const series = normalizeSkillScheduleSeries(skill.scheduleSeries);
  if (series === undefined) return false;

  switch (series.mode) {
    case "indefinite":
      if (series.startDate === undefined) return true;
      return compareDateKeys(dateKey, series.startDate) >= 0;
    case "date_range":
      return (
        compareDateKeys(dateKey, series.startDate!) >= 0 &&
        compareDateKeys(dateKey, series.endDate!) <= 0
      );
    case "single_day":
      return dateKey === series.singleDate;
    default:
      return false;
  }
}

export function buildActiveSkillsForDate(skills: Skill[], dateKey: string): Skill[] {
  return skills.filter((skill) => isSkillActiveOnDate(skill, dateKey));
}

export function getSkillSeriesDateRange(skill: Skill): SkillSeriesDateRange {
  if (skill.scheduleSeries === undefined) {
    return { kind: "unbounded" };
  }

  const series = normalizeSkillScheduleSeries(skill.scheduleSeries);
  if (series === undefined) {
    return { kind: "bounded", startDate: "9999-12-31", endDate: "9999-01-01" };
  }

  switch (series.mode) {
    case "indefinite":
      if (series.startDate === undefined) {
        return { kind: "unbounded" };
      }
      return { kind: "bounded", startDate: series.startDate, endDate: OPEN_END_DATE };
    case "date_range":
      return { kind: "bounded", startDate: series.startDate!, endDate: series.endDate! };
    case "single_day":
      return { kind: "bounded", startDate: series.singleDate!, endDate: series.singleDate! };
    default:
      return { kind: "bounded", startDate: "9999-12-31", endDate: "9999-01-01" };
  }
}

function formatSkillScheduleDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human-readable availability label for Skills page cards. */
export function formatSkillScheduleSeriesLabel(skill: Skill): string {
  if (skill.scheduleSeries === undefined) {
    return "Available indefinitely";
  }

  const series = normalizeSkillScheduleSeries(skill.scheduleSeries);
  if (series === undefined) {
    return "Available indefinitely";
  }

  switch (series.mode) {
    case "indefinite":
      if (series.startDate === undefined) {
        return "Available indefinitely";
      }
      return `Available from ${formatSkillScheduleDateKey(series.startDate)}`;
    case "date_range":
      return `Available ${formatSkillScheduleDateKey(series.startDate!)} – ${formatSkillScheduleDateKey(series.endDate!)}`;
    case "single_day":
      return `Available only on ${formatSkillScheduleDateKey(series.singleDate!)}`;
    default:
      return "Available indefinitely";
  }
}

/** Drops invalid scheduleSeries from skills on load/import (fail-closed repair). */
export function cleanupInvalidSkillScheduleSeries(payload: AppPayload): AppPayload {
  let changed = false;
  const skills = payload.skills.map((skill) => {
    if (skill.scheduleSeries !== undefined && !isValidSkillScheduleSeries(skill.scheduleSeries)) {
      changed = true;
      const next = { ...skill };
      delete next.scheduleSeries;
      return next;
    }
    return skill;
  });
  if (!changed) return payload;
  return { ...payload, skills };
}
