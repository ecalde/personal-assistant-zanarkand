// Pure, dependency-free recurrence engine.
//
// Expands recurrence rules into concrete calendar date keys for a query range,
// without touching schema, AppPayload, UI, or any domain data. Total functions
// that never throw and never mutate their inputs; invalid input yields safe
// empty results. Dates are local YYYY-MM-DD calendar keys compared
// lexicographically (storage stays date-only — no timezone/DST handling here).
//
// This module is standalone in Phase 22A: nothing consumes it yet. It is built
// so that calendar.ts, life events, fitness schedules, and skills can later share
// one expansion step (see the architecture "Recurrence engine" subsection).

import type { Weekday } from "./model";
import { weekdayFromDateString } from "./timeline";
import { addDaysToDateKey, daysBetweenDateKeys } from "./events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** How the series stops. Omitted on a rule means "never" (bounded only by the query range). */
export type RecurrenceEnd =
  | { kind: "never" }
  | { kind: "onDate"; endDate: string }
  | { kind: "afterCount"; maxOccurrences: number };

export type RecurrenceException =
  | { kind: "skip"; date: string }
  | {
      kind: "override";
      date: string; // original occurrence date
      overrideDate: string; // where the instance appears instead
    };

export type RecurrenceRule = {
  /** First scheduled occurrence / series anchor (required). */
  anchorDate: string;
  /** Undefined = one-time (only anchorDate). Present = recurring from the anchor. */
  frequency?: RecurrenceFrequency;
  /** Step: every N days/weeks/months/years (integer >= 1, default 1). */
  interval?: number;
  /** Weekly only: at least one weekday is required when frequency is weekly. */
  byWeekdays?: Weekday[];
  /** Monthly only: day 1-31; defaults to the anchor's day-of-month. */
  dayOfMonth?: number;
  /** Effective series start (>= anchor). Defaults to anchorDate; used after splits/delayed starts. */
  startDate?: string;
  end?: RecurrenceEnd;
  exceptions?: RecurrenceException[];
};

export type RecurrenceInstance = {
  /** Calendar date of this occurrence (after overrides). */
  date: string;
  /** Set when an override moved the instance from its scheduled date. */
  originalDate?: string;
  /** 1-based index among scheduled candidates (counts skipped slots, not overrides). */
  occurrenceIndex: number;
  isException: boolean;
};

export type SplitRecurrenceResult = {
  beforeRule: RecurrenceRule;
  afterRule: RecurrenceRule;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_SET = new Set<Weekday>(WEEKDAYS);

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Defensive guard against runaway generation on adversarial input.
const MAX_CANDIDATES = 10_000;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Private date helpers (kept local to avoid widening other modules' exports)
// ---------------------------------------------------------------------------

type ParsedDate = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

function maxDateKey(a: string, b: string): string {
  return compareDateKeys(a, b) >= 0 ? a : b;
}

function minDateKey(a: string, b: string): string {
  return compareDateKeys(a, b) <= 0 ? a : b;
}

/** Adds whole months to a base key, applying a target day clamped to month length. */
function addMonthsToDateKey(baseKey: string, monthsToAdd: number, dayOfMonth: number): string | null {
  const parsed = parseDateKey(baseKey);
  if (!parsed) return null;
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + monthsToAdd;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return toDateKey(year, month, day);
}

/** Adds whole years to a base key, mapping Feb 29 to Feb 28 in non-leap years. */
function addYearsToDateKey(baseKey: string, yearsToAdd: number): string | null {
  const parsed = parseDateKey(baseKey);
  if (!parsed) return null;
  const year = parsed.year + yearsToAdd;
  let day = parsed.day;
  if (parsed.month === 2 && parsed.day === 29 && !isLeapYear(year)) day = 28;
  return toDateKey(year, parsed.month, day);
}

// ---------------------------------------------------------------------------
// Rule normalization / validation
// ---------------------------------------------------------------------------

type NormalizedRule = {
  anchorDate: string;
  frequency?: RecurrenceFrequency;
  interval: number;
  byWeekdays: Weekday[];
  dayOfMonth: number;
  startDate: string;
  end: RecurrenceEnd;
  exceptions: RecurrenceException[];
};

function normalizeEnd(end: RecurrenceEnd | undefined): RecurrenceEnd | null {
  if (end === undefined) return { kind: "never" };
  switch (end.kind) {
    case "never":
      return { kind: "never" };
    case "onDate":
      return parseDateKey(end.endDate) ? { kind: "onDate", endDate: end.endDate } : null;
    case "afterCount":
      return Number.isInteger(end.maxOccurrences) && end.maxOccurrences >= 1
        ? { kind: "afterCount", maxOccurrences: end.maxOccurrences }
        : null;
    default:
      return null;
  }
}

function normalizeExceptions(exceptions: RecurrenceException[] | undefined): RecurrenceException[] {
  if (!Array.isArray(exceptions)) return [];
  const result: RecurrenceException[] = [];
  for (const exc of exceptions) {
    if (!exc || !parseDateKey(exc.date)) continue;
    if (exc.kind === "skip") {
      result.push({ kind: "skip", date: exc.date });
    } else if (exc.kind === "override" && parseDateKey(exc.overrideDate)) {
      result.push({ kind: "override", date: exc.date, overrideDate: exc.overrideDate });
    }
  }
  return result;
}

function normalizeRule(rule: RecurrenceRule): NormalizedRule | null {
  const anchor = parseDateKey(rule.anchorDate);
  if (!anchor) return null;

  const interval = rule.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) return null;

  const frequency = rule.frequency;
  if (frequency !== undefined && !["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
    return null;
  }

  let byWeekdays: Weekday[] = [];
  if (frequency === "weekly") {
    if (!Array.isArray(rule.byWeekdays) || rule.byWeekdays.length === 0) return null;
    byWeekdays = rule.byWeekdays.filter((day) => WEEKDAY_SET.has(day));
    if (byWeekdays.length === 0) return null;
  }

  let dayOfMonth = anchor.day;
  if (rule.dayOfMonth !== undefined) {
    if (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
      return null;
    }
    dayOfMonth = rule.dayOfMonth;
  }

  if (rule.startDate !== undefined && !parseDateKey(rule.startDate)) return null;
  const startDate = maxDateKey(rule.anchorDate, rule.startDate ?? rule.anchorDate);

  const end = normalizeEnd(rule.end);
  if (!end) return null;

  return {
    anchorDate: rule.anchorDate,
    frequency,
    interval,
    byWeekdays,
    dayOfMonth,
    startDate,
    end,
    exceptions: normalizeExceptions(rule.exceptions),
  };
}

/** True when the rule is structurally valid (parses, consistent frequency fields). */
export function isValidRecurrenceRule(rule: RecurrenceRule): boolean {
  return normalizeRule(rule) !== null;
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

type Candidate = { date: string; occurrenceIndex: number };

/**
 * Generates scheduled candidate dates from the effective series start up to
 * genEnd (inclusive), counting occurrences for the optional maxOccurrences cap.
 * Candidates before seriesStart are never generated and never counted.
 */
function generateCandidates(
  rule: NormalizedRule,
  seriesStart: string,
  genEnd: string,
  maxOccurrences: number | null
): Candidate[] {
  const candidates: Candidate[] = [];

  const push = (date: string): "continue" | "stop" => {
    if (compareDateKeys(date, genEnd) > 0) return "stop";
    candidates.push({ date, occurrenceIndex: candidates.length + 1 });
    if (maxOccurrences !== null && candidates.length >= maxOccurrences) return "stop";
    if (candidates.length >= MAX_CANDIDATES) return "stop";
    return "continue";
  };

  if (!rule.frequency) {
    if (
      compareDateKeys(rule.anchorDate, seriesStart) >= 0 &&
      compareDateKeys(rule.anchorDate, genEnd) <= 0
    ) {
      candidates.push({ date: rule.anchorDate, occurrenceIndex: 1 });
    }
    return candidates;
  }

  if (rule.frequency === "daily") {
    const diff = daysBetweenDateKeys(rule.anchorDate, seriesStart) ?? 0;
    let k = diff > 0 ? Math.ceil(diff / rule.interval) : 0;
    for (let guard = 0; guard < MAX_CANDIDATES; guard += 1, k += 1) {
      const date = addDaysToDateKey(rule.anchorDate, k * rule.interval);
      if (!date) break;
      if (compareDateKeys(date, seriesStart) < 0) continue;
      if (push(date) === "stop") break;
    }
    return candidates;
  }

  if (rule.frequency === "weekly") {
    const weekdays = new Set(rule.byWeekdays);
    let date: string | null = seriesStart;
    for (let guard = 0; guard < MAX_CANDIDATES * 7 && date; guard += 1) {
      if (compareDateKeys(date, genEnd) > 0) break;
      if (weekdays.has(weekdayFromDateString(date))) {
        const daysFromAnchor = daysBetweenDateKeys(rule.anchorDate, date) ?? 0;
        if (daysFromAnchor >= 0 && Math.floor(daysFromAnchor / 7) % rule.interval === 0) {
          if (push(date) === "stop") break;
        }
      }
      date = addDaysToDateKey(date, 1);
    }
    return candidates;
  }

  // monthly / yearly: each step is monotonically increasing.
  const step = (k: number): string | null =>
    rule.frequency === "monthly"
      ? addMonthsToDateKey(rule.anchorDate, k * rule.interval, rule.dayOfMonth)
      : addYearsToDateKey(rule.anchorDate, k * rule.interval);

  for (let k = 0; k <= MAX_CANDIDATES; k += 1) {
    const date = step(k);
    if (!date) break;
    if (compareDateKeys(date, genEnd) > 0) break;
    if (compareDateKeys(date, seriesStart) < 0) continue;
    if (push(date) === "stop") break;
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/**
 * Applies skip/override exceptions to scheduled instances. Skips remove the
 * instance; overrides move it to overrideDate (recording originalDate). Matching
 * is by date key; duplicate exceptions for one date resolve last-wins.
 */
export function applyRecurrenceExceptions(
  instances: RecurrenceInstance[],
  exceptions: RecurrenceException[]
): RecurrenceInstance[] {
  if (exceptions.length === 0) {
    return instances.map((inst) => ({ ...inst }));
  }

  const byDate = new Map<string, RecurrenceException>();
  for (const exc of exceptions) {
    byDate.set(exc.date, exc); // last wins
  }

  const result: RecurrenceInstance[] = [];
  for (const inst of instances) {
    const exc = byDate.get(inst.date);
    if (!exc) {
      result.push({ ...inst });
      continue;
    }
    if (exc.kind === "skip") continue;
    result.push({
      date: exc.overrideDate,
      originalDate: inst.date,
      occurrenceIndex: inst.occurrenceIndex,
      isException: true,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function compareInstances(a: RecurrenceInstance, b: RecurrenceInstance): number {
  const byDate = compareDateKeys(a.date, b.date);
  if (byDate !== 0) return byDate;
  const byOrigin = compareDateKeys(a.originalDate ?? a.date, b.originalDate ?? b.date);
  if (byOrigin !== 0) return byOrigin;
  return a.occurrenceIndex - b.occurrenceIndex;
}

/**
 * Expands a recurrence rule into concrete instances within the inclusive
 * [rangeStart, rangeEnd] window. Generation walks from the effective series
 * start (which may precede rangeStart) so occurrence counting and overrides that
 * move dates into range stay correct; results are clipped to the range last.
 */
export function expandRecurrenceInstances(
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string
): RecurrenceInstance[] {
  const normalized = normalizeRule(rule);
  if (!normalized) return [];
  if (!parseDateKey(rangeStart) || !parseDateKey(rangeEnd)) return [];
  if (compareDateKeys(rangeStart, rangeEnd) > 0) return [];

  const seriesStart = normalized.startDate;
  let genEnd = rangeEnd;
  let maxOccurrences: number | null = null;
  if (normalized.end.kind === "onDate") {
    genEnd = minDateKey(rangeEnd, normalized.end.endDate);
  } else if (normalized.end.kind === "afterCount") {
    maxOccurrences = normalized.end.maxOccurrences;
  }

  const candidates = generateCandidates(normalized, seriesStart, genEnd, maxOccurrences);

  const scheduled: RecurrenceInstance[] = candidates.map((candidate) => ({
    date: candidate.date,
    occurrenceIndex: candidate.occurrenceIndex,
    isException: false,
  }));

  const withExceptions = applyRecurrenceExceptions(scheduled, normalized.exceptions);

  const clipped = withExceptions.filter(
    (inst) =>
      compareDateKeys(inst.date, rangeStart) >= 0 && compareDateKeys(inst.date, rangeEnd) <= 0
  );

  clipped.sort(compareInstances);
  return clipped;
}

/** Date keys only, in expansion order. Equivalent to mapping expandRecurrenceInstances. */
export function getRecurrenceDateKeys(
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string
): string[] {
  return expandRecurrenceInstances(rule, rangeStart, rangeEnd).map((inst) => inst.date);
}

/** True when the rule produces a visible occurrence on the given date (after exceptions). */
export function isDateInRecurrenceRange(rule: RecurrenceRule, date: string): boolean {
  if (!parseDateKey(date)) return false;
  return expandRecurrenceInstances(rule, date, date).length > 0;
}

// ---------------------------------------------------------------------------
// Series split
// ---------------------------------------------------------------------------

/**
 * Splits a series at splitDate into a pure before/after pair without mutating
 * the input. beforeRule keeps the original pattern but ends the day before
 * splitDate; afterRule is the caller-supplied replacement, started on splitDate.
 * Past occurrences are untouched. Callers should set afterRule.anchorDate to the
 * first occurrence on/after splitDate for clean summaries.
 */
export function splitRecurrenceSeriesAtDate(
  rule: RecurrenceRule,
  splitDate: string,
  afterRule: RecurrenceRule
): SplitRecurrenceResult {
  const dayBefore = addDaysToDateKey(splitDate, -1) ?? splitDate;
  const originalExceptions = rule.exceptions ?? [];

  const beforeRule: RecurrenceRule = {
    ...rule,
    end: { kind: "onDate", endDate: dayBefore },
    exceptions: originalExceptions.filter((exc) => compareDateKeys(exc.date, splitDate) < 0),
  };

  const afterStart = afterRule.startDate
    ? maxDateKey(splitDate, afterRule.startDate)
    : splitDate;
  const inheritedExceptions = afterRule.exceptions ?? originalExceptions;

  const mergedAfterRule: RecurrenceRule = {
    ...afterRule,
    startDate: afterStart,
    exceptions: inheritedExceptions.filter((exc) => compareDateKeys(exc.date, splitDate) >= 0),
  };

  return { beforeRule, afterRule: mergedAfterRule };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function formatEndSuffix(end: RecurrenceEnd): string {
  switch (end.kind) {
    case "onDate":
      return ` until ${end.endDate}`;
    case "afterCount":
      return ` (${end.maxOccurrences} ${end.maxOccurrences === 1 ? "time" : "times"})`;
    case "never":
      return "";
  }
}

function formatWeekdayList(byWeekdays: Weekday[]): string {
  const ordered = WEEKDAYS.filter((day) => byWeekdays.includes(day));
  return ordered.map((day) => WEEKDAY_LABELS[day]).join(", ");
}

/** Human-readable recurrence label for UI (e.g. "Every Wednesday until 2026-12-31"). */
export function formatRecurrenceSummary(rule: RecurrenceRule): string {
  const normalized = normalizeRule(rule);
  if (!normalized || !normalized.frequency) return "Does not repeat";

  const { interval } = normalized;
  let base: string;

  switch (normalized.frequency) {
    case "daily":
      base = interval === 1 ? "Every day" : `Every ${interval} days`;
      break;
    case "weekly": {
      const days = formatWeekdayList(normalized.byWeekdays);
      if (interval === 1 && normalized.byWeekdays.length === 1) {
        base = `Every ${days}`;
      } else {
        base = interval === 1 ? `Weekly on ${days}` : `Every ${interval} weeks on ${days}`;
      }
      break;
    }
    case "monthly":
      base =
        interval === 1
          ? `Monthly on day ${normalized.dayOfMonth}`
          : `Every ${interval} months on day ${normalized.dayOfMonth}`;
      break;
    case "yearly": {
      const anchor = parseDateKey(normalized.anchorDate)!;
      const monthDay = `${MONTH_LABELS[anchor.month - 1]} ${anchor.day}`;
      base = interval === 1 ? `Annually on ${monthDay}` : `Every ${interval} years on ${monthDay}`;
      break;
    }
  }

  return `${base}${formatEndSuffix(normalized.end)}`;
}
