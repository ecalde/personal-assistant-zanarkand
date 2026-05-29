import type { RecurrenceEnd, RecurrenceRule } from "../../core/recurrence";
import { isValidRecurrenceRule, normalizeRecurrenceRule } from "../../core/recurrence";
import type { Weekday } from "../../core/model";
import { weekdayFromDateString } from "../../core/timeline";

// Future: support series splitting, occurrence exceptions, edit-this-occurrence vs
// edit-series, and drag/drop recurrence edits.

export type EventRecurrenceUiMode = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceEndUiKind = "never" | "onDate" | "afterCount";

export type EventRecurrenceFormState = {
  mode: EventRecurrenceUiMode;
  byWeekdays: Weekday[];
  dayOfMonth: string;
  endKind: RecurrenceEndUiKind;
  endDate: string;
  maxOccurrences: string;
};

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

const WEEKDAY_PRESET_WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];

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

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

export function emptyEventRecurrenceFormState(): EventRecurrenceFormState {
  return {
    mode: "none",
    byWeekdays: [],
    dayOfMonth: "",
    endKind: "never",
    endDate: "",
    maxOccurrences: "",
  };
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  if (!DATE_KEY_RE.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function endFromForm(form: EventRecurrenceFormState): RecurrenceEnd | undefined {
  switch (form.endKind) {
    case "never":
      return undefined;
    case "onDate":
      return { kind: "onDate", endDate: form.endDate.trim() };
    case "afterCount": {
      const count = Number(form.maxOccurrences.trim());
      return { kind: "afterCount", maxOccurrences: count };
    }
  }
}

function endToForm(end: RecurrenceEnd | undefined): Pick<
  EventRecurrenceFormState,
  "endKind" | "endDate" | "maxOccurrences"
> {
  if (end === undefined || end.kind === "never") {
    return { endKind: "never", endDate: "", maxOccurrences: "" };
  }
  if (end.kind === "onDate") {
    return { endKind: "onDate", endDate: end.endDate, maxOccurrences: "" };
  }
  return {
    endKind: "afterCount",
    endDate: "",
    maxOccurrences: String(end.maxOccurrences),
  };
}

function anchorDayOfMonth(anchorDate: string): number | null {
  return parseDateKey(anchorDate)?.day ?? null;
}

function defaultWeeklyWeekdays(anchorDate: string): Weekday[] {
  return [weekdayFromDateString(anchorDate)];
}

function resolveWeeklyWeekdays(anchorDate: string, byWeekdays: Weekday[]): Weekday[] {
  if (byWeekdays.length > 0) {
    return byWeekdays.filter((day) => WEEKDAY_SET.has(day));
  }
  return defaultWeeklyWeekdays(anchorDate);
}

function resolveDayOfMonth(anchorDate: string, dayOfMonth: string): number {
  const trimmed = dayOfMonth.trim();
  if (trimmed) {
    return Number(trimmed);
  }
  return anchorDayOfMonth(anchorDate) ?? 1;
}

export function eventRecurrenceFormFromRule(
  anchorDate: string,
  rule?: RecurrenceRule
): EventRecurrenceFormState {
  if (rule === undefined) {
    return emptyEventRecurrenceFormState();
  }

  const normalized = normalizeRecurrenceRule(rule);
  if (!normalized?.frequency) {
    return emptyEventRecurrenceFormState();
  }

  const endFields = endToForm(normalized.end);
  const base: EventRecurrenceFormState = {
    mode: normalized.frequency,
    byWeekdays: [],
    dayOfMonth: "",
    ...endFields,
  };

  switch (normalized.frequency) {
    case "weekly":
      return {
        ...base,
        byWeekdays: normalized.byWeekdays ?? [],
      };
    case "monthly": {
      const anchorDay = anchorDayOfMonth(anchorDate);
      const dom = normalized.dayOfMonth ?? anchorDay ?? 1;
      return {
        ...base,
        dayOfMonth: anchorDay !== null && dom === anchorDay ? "" : String(dom),
      };
    }
    default:
      return base;
  }
}

export function buildEventRecurrenceCandidate(
  anchorDate: string,
  form: EventRecurrenceFormState
): RecurrenceRule | undefined {
  if (form.mode === "none") {
    return undefined;
  }

  const rule: RecurrenceRule = {
    anchorDate,
    frequency: form.mode,
  };

  if (form.mode === "weekly") {
    rule.byWeekdays = resolveWeeklyWeekdays(anchorDate, form.byWeekdays);
  }

  if (form.mode === "monthly") {
    const dom = resolveDayOfMonth(anchorDate, form.dayOfMonth);
    const anchorDay = anchorDayOfMonth(anchorDate);
    if (anchorDay !== null && dom !== anchorDay) {
      rule.dayOfMonth = dom;
    }
  }

  const end = endFromForm(form);
  if (end !== undefined) {
    rule.end = end;
  }

  return rule;
}

export function validateEventRecurrenceForm(
  anchorDate: string,
  form: EventRecurrenceFormState
): string | null {
  if (!anchorDate.trim()) {
    return "Date is required for recurrence.";
  }
  if (!parseDateKey(anchorDate.trim())) {
    return "Enter a valid date (YYYY-MM-DD).";
  }

  if (form.mode === "none") {
    return null;
  }

  if (form.mode === "weekly") {
    const weekdays = resolveWeeklyWeekdays(anchorDate, form.byWeekdays);
    if (weekdays.length === 0) {
      return "Select at least one weekday.";
    }
  }

  if (form.mode === "monthly") {
    const trimmed = form.dayOfMonth.trim();
    if (trimmed) {
      const dom = Number(trimmed);
      if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
        return "Day of month must be between 1 and 31.";
      }
    }
  }

  if (form.endKind === "onDate") {
    const endDate = form.endDate.trim();
    if (!endDate) return "End date is required.";
    if (!parseDateKey(endDate)) return "Enter a valid end date (YYYY-MM-DD).";
    if (endDate < anchorDate.trim()) {
      return "End date must be on or after the event date.";
    }
  }

  if (form.endKind === "afterCount") {
    const trimmed = form.maxOccurrences.trim();
    if (!trimmed) return "Number of occurrences is required.";
    const count = Number(trimmed);
    if (!Number.isInteger(count) || count < 1) {
      return "Number of occurrences must be at least 1.";
    }
  }

  const candidate = buildEventRecurrenceCandidate(anchorDate.trim(), form);
  if (candidate === undefined) {
    return "Invalid recurrence settings.";
  }

  if (!isValidRecurrenceRule(candidate)) {
    return "Invalid recurrence settings.";
  }

  if (normalizeRecurrenceRule(candidate) === undefined) {
    return "Invalid recurrence settings.";
  }

  return null;
}

export function eventRecurrenceRuleFromForm(
  anchorDate: string,
  form: EventRecurrenceFormState
): RecurrenceRule | undefined {
  const candidate = buildEventRecurrenceCandidate(anchorDate.trim(), form);
  if (candidate === undefined) return undefined;
  return normalizeRecurrenceRule(candidate);
}

export function eventRecurrenceEqual(
  a: RecurrenceRule | undefined,
  b: RecurrenceRule | undefined
): boolean {
  const normalizedA = a === undefined ? undefined : normalizeRecurrenceRule(a);
  const normalizedB = b === undefined ? undefined : normalizeRecurrenceRule(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function formatShortDate(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const month = MONTH_LABELS[parsed.month - 1].slice(0, 3);
  return `${month} ${parsed.day}, ${parsed.year}`;
}

function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatDayOfMonth(day: number): string {
  return `${day}${ordinalSuffix(day)}`;
}

function orderedWeekdays(byWeekdays: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => byWeekdays.includes(day));
}

function isWeekdayPreset(byWeekdays: Weekday[], preset: Weekday[]): boolean {
  if (byWeekdays.length !== preset.length) return false;
  const set = new Set(byWeekdays);
  return preset.every((day) => set.has(day));
}

function formatWeeklyLabel(byWeekdays: Weekday[], interval: number): string {
  const ordered = orderedWeekdays(byWeekdays);
  if (ordered.length === 0) return "Every week";

  const intervalPrefix = interval === 1 ? "Every" : `Every ${interval} weeks on`;

  if (isWeekdayPreset(ordered, WEEKDAY_PRESET_WEEKDAYS)) {
    return interval === 1 ? "Every weekday" : `Every ${interval} weeks on weekdays`;
  }

  if (ordered.length === 1) {
    const day = WEEKDAY_LABELS[ordered[0]];
    return interval === 1 ? `Every ${day}` : `Every ${interval} weeks on ${day}`;
  }

  const names = ordered.map((day) => WEEKDAY_LABELS[day]).join(", ");
  return interval === 1 ? `Every ${names}` : `${intervalPrefix} ${names}`;
}

function formatEndSuffix(
  end: RecurrenceEnd,
  frequency: EventRecurrenceUiMode,
  interval: number,
  weeklyHasEndDate: boolean
): string {
  switch (end.kind) {
    case "never":
      return "";
    case "onDate": {
      const formatted = formatShortDate(end.endDate);
      if (frequency === "weekly" && interval === 1 && weeklyHasEndDate) {
        return ` until ${formatted}`;
      }
      if (frequency === "monthly" && interval === 1) {
        return ` until ${formatted}`;
      }
      if (frequency === "daily" && interval === 1) {
        return ` until ${formatted}`;
      }
      if (frequency === "yearly" && interval === 1) {
        return ` until ${formatted}`;
      }
      return ` until ${formatted}`;
    }
    case "afterCount": {
      const times = end.maxOccurrences === 1 ? "1 time" : `${end.maxOccurrences} times`;
      if (frequency === "monthly" && interval === 1) {
        return ` (${times})`;
      }
      if (frequency === "weekly" && interval === 1) {
        return ` (${times})`;
      }
      return ` (${times})`;
    }
  }
}

/** Human-readable recurrence label for event cards and form previews. */
export function formatEventRecurrenceLabel(rule: RecurrenceRule): string {
  const normalized = normalizeRecurrenceRule(rule);
  if (!normalized?.frequency) return "Does not repeat";

  const frequency = normalized.frequency;
  const interval = normalized.interval ?? rule.interval ?? 1;
  const byWeekdays = normalized.byWeekdays ?? rule.byWeekdays ?? [];
  const end: RecurrenceEnd = normalized.end ?? rule.end ?? { kind: "never" };
  const weeklyHasEndDate = frequency === "weekly" && end.kind === "onDate";

  let base: string;

  switch (frequency) {
    case "daily":
      base = interval === 1 ? "Every day" : `Every ${interval} days`;
      break;
    case "weekly":
      if (weeklyHasEndDate && interval === 1) {
        base = "Every week";
      } else {
        base = formatWeeklyLabel(byWeekdays, interval);
      }
      break;
    case "monthly": {
      const anchor = parseDateKey(normalized.anchorDate);
      const dom = normalized.dayOfMonth ?? rule.dayOfMonth ?? anchor?.day ?? 1;
      const formattedDom = formatDayOfMonth(dom);
      base =
        interval === 1 && end.kind === "afterCount"
          ? "Every month"
          : interval === 1
            ? `Monthly on the ${formattedDom}`
            : `Every ${interval} months on the ${formattedDom}`;
      break;
    }
    case "yearly": {
      const anchor = parseDateKey(normalized.anchorDate);
      if (!anchor) return "Does not repeat";
      const monthDay = `${MONTH_LABELS[anchor.month - 1]} ${anchor.day}`;
      base = interval === 1 ? `Yearly on ${monthDay}` : `Every ${interval} years on ${monthDay}`;
      break;
    }
  }

  return `${base}${formatEndSuffix(end, frequency, interval, weeklyHasEndDate)}`.trim();
}

export function seedWeeklyWeekdays(
  anchorDate: string,
  current: Weekday[]
): Weekday[] {
  if (current.length > 0) return current;
  return defaultWeeklyWeekdays(anchorDate);
}

export const EVENT_RECURRENCE_WEEKDAYS = WEEKDAYS;

export const EVENT_RECURRENCE_WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
