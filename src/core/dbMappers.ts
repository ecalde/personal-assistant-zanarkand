// Pure domain ↔ Postgres row mappers (no Supabase client).

import { defaultWeeklySchedule } from "./state";
import { parseHHMMToMinutes } from "./schedule";
import {
  isCalendarCategoryKey,
  isCalendarColorToken,
  sanitizeCategoryAlias,
  type CalendarCategoryKey,
  type CalendarColorPreferences,
  type CalendarColorToken,
} from "./calendarColors";
import {
  isValidRecurrenceRule,
  type RecurrenceEnd,
  type RecurrenceException,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from "./recurrence";
import {
  normalizeSkillScheduleSeries,
} from "./skillSeries";
import { ACHIEVEMENT_CATALOG } from "./achievementCatalog";
import { isGamificationStateAllowedKey } from "./progressionModel";
import type {
  AppPayload,
  ApplicationStatus,
  CareerTarget,
  GamificationState,
  EventType,
  ExerciseEntry,
  JobApplication,
  LifeEvent,
  Person,
  Priority,
  RemotePolicy,
  ScheduleBlock,
  Session,
  Skill,
  SkillScheduleSeries,
  Weekday,
  WeeklySchedule,
  WorkoutFocus,
  WorkoutPlan,
  WorkoutSession,
  FocusFeedback,
  FocusFeedbackAction,
} from "./model";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HHMM_RE = /^(\d{2}):(\d{2})$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BIRTHDAY_MONTH_DAY_RE = /^((0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]))$/;

const EVENT_TYPES: EventType[] = [
  "birthday",
  "hangout",
  "trip",
  "holiday",
  "deadline",
  "other",
];

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
];

const REMOTE_POLICIES: RemotePolicy[] = ["remote", "hybrid", "onsite", "unknown"];

const WORKOUT_FOCUSES: WorkoutFocus[] = [
  "push",
  "pull",
  "legs",
  "full_body",
  "cardio",
  "mobility",
];

const FOCUS_FEEDBACK_ACTIONS: FocusFeedbackAction[] = ["dismissed", "snoozed"];

export type SkillRow = {
  id: string;
  user_id: string;
  name: string;
  priority: number | null;
  daily_goal_minutes: number | null;
  weekly_goal_minutes: number | null;
  schedule: WeeklySchedule;
  schedule_series: SkillScheduleSeries | null;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  skill_id: string;
  minutes: number;
  started_at: string;
  created_at: string;
};

export type OverrideRow = {
  id: string;
  user_id: string;
  kind: string | null;
  payload: unknown;
  created_at: string;
};

export type EventRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  type: string;
  start_time: string | null;
  end_time: string | null;
  person_name: string | null;
  person_id: string | null;
  notes: string | null;
  reminder: boolean;
  recurrence: unknown | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonRow = {
  id: string;
  user_id: string;
  name: string;
  nickname: string | null;
  birthday_month_day: string | null;
  relationship: string | null;
  likes: string | null;
  dislikes: string | null;
  gift_ideas: string | null;
  notes: string | null;
  last_contact_date: string | null;
  contact_cadence_days: number | null;
  created_at: string;
  updated_at: string;
};

export type JobApplicationRow = {
  id: string;
  user_id: string;
  company: string;
  role_title: string;
  status: string;
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
  remote_policy: string | null;
  applied_date: string | null;
  url: string | null;
  notes: string | null;
  required_skill_ids: unknown;
  required_skills_text: string | null;
  created_at: string;
  updated_at: string;
};

export type CareerTargetRow = {
  id: string;
  user_id: string;
  role_title: string;
  company: string | null;
  notes: string | null;
  required_skill_ids: unknown;
  required_skills_text: string | null;
  updated_at: string;
};

export type WorkoutPlanRow = {
  id: string;
  user_id: string;
  name: string;
  focus: string | null;
  exercises: unknown;
  notes: string | null;
  schedule: WeeklySchedule;
  schedule_series: SkillScheduleSeries | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSessionRow = {
  id: string;
  user_id: string;
  workout_date: string;
  focus: string | null;
  plan_id: string | null;
  exercises: unknown;
  notes: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FocusFeedbackRow = {
  id: string;
  user_id: string;
  focus_item_id: string;
  action: string;
  until_iso: string | null;
  source_snapshot: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarPreferencesRow = {
  user_id: string;
  preferences: unknown;
  updated_at: string;
};

export type GamificationStateRow = {
  user_id: string;
  state: unknown;
  updated_at: string;
};

export class MapperError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "MapperError";
    this.field = field;
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function isPriority(value: number): value is Priority {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

export function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function isBirthdayMonthDay(value: string): boolean {
  return BIRTHDAY_MONTH_DAY_RE.test(value);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as string[]).includes(value);
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as string[]).includes(value);
}

export function isRemotePolicy(value: string): value is RemotePolicy {
  return (REMOTE_POLICIES as string[]).includes(value);
}

export function isHhMm(value: string): boolean {
  const match = HHMM_RE.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function assertUuid(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new MapperError(`Invalid UUID: ${field}`, field);
  }
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!isIsoTimestamp(value)) {
    throw new MapperError(`Invalid ISO timestamp: ${field}`, field);
  }
}

function assertIsoDate(value: string, field: string): void {
  if (!isIsoDate(value)) {
    throw new MapperError(`Invalid ISO date: ${field}`, field);
  }
}

function assertNonEmptyName(name: string, field: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new MapperError(`Invalid name: ${field}`, field);
  }
}

function parseScheduleBlock(raw: unknown, context: string): ScheduleBlock {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapperError(`Invalid schedule block at ${context}`, context);
  }

  const block = raw as Record<string, unknown>;
  const id = block.id;
  const startTime = block.startTime;
  const minutes = block.minutes;

  if (typeof id !== "string" || !isUuid(id)) {
    throw new MapperError(`Invalid schedule block id at ${context}`, context);
  }
  if (typeof startTime !== "string" || !HHMM_RE.test(startTime)) {
    throw new MapperError(`Invalid schedule block startTime at ${context}`, context);
  }
  if (typeof minutes !== "number" || !isPositiveInteger(minutes)) {
    throw new MapperError(`Invalid schedule block minutes at ${context}`, context);
  }

  return { id, startTime, minutes };
}

/** Validates and normalizes a weekly schedule object. */
export function parseWeeklySchedule(raw: unknown, context = "schedule"): WeeklySchedule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapperError(`Invalid ${context}: expected object`, context);
  }

  const obj = raw as Record<string, unknown>;
  const schedule = defaultWeeklySchedule();

  for (const day of WEEKDAYS) {
    const blocks = obj[day];
    if (blocks === undefined) continue;
    if (!Array.isArray(blocks)) {
      throw new MapperError(`Invalid ${context}.${day}: expected array`, `${context}.${day}`);
    }
    schedule[day] = blocks.map((block, index) =>
      parseScheduleBlock(block, `${context}.${day}[${index}]`)
    );
  }

  for (const key of Object.keys(obj)) {
    if (!WEEKDAYS.includes(key as Weekday)) {
      throw new MapperError(`Invalid ${context}: unknown weekday "${key}"`, context);
    }
  }

  return schedule;
}

const SKILL_SCHEDULE_SERIES_ALLOWED_KEYS = ["mode", "startDate", "endDate", "singleDate"];

/**
 * Parses untrusted schedule-series jsonb into a canonical SkillScheduleSeries.
 * Cross-checks with normalizeSkillScheduleSeries so semantic rules have one source of truth.
 */
export function parseSkillScheduleSeries(
  raw: unknown,
  field = "scheduleSeries"
): SkillScheduleSeries {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  for (const key of Object.keys(raw)) {
    if (!SKILL_SCHEDULE_SERIES_ALLOWED_KEYS.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  const normalized = normalizeSkillScheduleSeries(raw);
  if (normalized === undefined) {
    throw new MapperError(`Invalid ${field}: failed validation`, field);
  }

  return normalized;
}

function assertValidSkill(skill: Skill): WeeklySchedule {
  assertUuid(skill.id, "skill.id");
  assertNonEmptyName(skill.name, "skill.name");
  assertIsoTimestamp(skill.createdAtIso, "skill.createdAtIso");
  assertIsoTimestamp(skill.updatedAtIso, "skill.updatedAtIso");

  if (skill.priority !== undefined && !isPriority(skill.priority)) {
    throw new MapperError("Invalid skill.priority", "skill.priority");
  }
  if (
    skill.dailyGoalMinutes !== undefined &&
    !isNonNegativeInteger(skill.dailyGoalMinutes)
  ) {
    throw new MapperError("Invalid skill.dailyGoalMinutes", "skill.dailyGoalMinutes");
  }
  if (
    skill.weeklyGoalMinutes !== undefined &&
    !isNonNegativeInteger(skill.weeklyGoalMinutes)
  ) {
    throw new MapperError("Invalid skill.weeklyGoalMinutes", "skill.weeklyGoalMinutes");
  }

  if (skill.scheduleSeries !== undefined) {
    parseSkillScheduleSeries(skill.scheduleSeries, "skill.scheduleSeries");
  }

  return parseWeeklySchedule(skill.schedule, "skill.schedule");
}

function assertValidSession(session: Session): void {
  assertUuid(session.id, "session.id");
  assertUuid(session.skillId, "session.skillId");
  assertIsoTimestamp(session.startedAtIso, "session.startedAtIso");
  assertIsoTimestamp(session.createdAtIso, "session.createdAtIso");

  if (!isPositiveInteger(session.minutes)) {
    throw new MapperError("Invalid session.minutes", "session.minutes");
  }
}

const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

const RECURRENCE_ALLOWED_KEYS = [
  "anchorDate",
  "frequency",
  "interval",
  "byWeekdays",
  "dayOfMonth",
  "startDate",
  "end",
  "exceptions",
];

const RECURRENCE_END_ALLOWED_KEYS = ["kind", "endDate", "maxOccurrences"];

const RECURRENCE_EXCEPTION_ALLOWED_KEYS = ["kind", "date", "overrideDate"];

function parseRecurrenceEnd(raw: unknown, field: string): RecurrenceEnd {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  for (const key of Object.keys(raw)) {
    if (!RECURRENCE_END_ALLOWED_KEYS.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  const kind = raw.kind;
  if (kind === "never") return { kind: "never" };
  if (kind === "onDate") {
    if (typeof raw.endDate !== "string" || !isIsoDate(raw.endDate)) {
      throw new MapperError(`Invalid ${field}.endDate`, `${field}.endDate`);
    }
    return { kind: "onDate", endDate: raw.endDate };
  }
  if (kind === "afterCount") {
    if (typeof raw.maxOccurrences !== "number" || !isPositiveInteger(raw.maxOccurrences)) {
      throw new MapperError(`Invalid ${field}.maxOccurrences`, `${field}.maxOccurrences`);
    }
    return { kind: "afterCount", maxOccurrences: raw.maxOccurrences };
  }
  throw new MapperError(`Invalid ${field}.kind`, `${field}.kind`);
}

function parseRecurrenceException(raw: unknown, field: string): RecurrenceException {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  for (const key of Object.keys(raw)) {
    if (!RECURRENCE_EXCEPTION_ALLOWED_KEYS.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  if (typeof raw.date !== "string" || !isIsoDate(raw.date)) {
    throw new MapperError(`Invalid ${field}.date`, `${field}.date`);
  }
  if (raw.kind === "skip") {
    return { kind: "skip", date: raw.date };
  }
  if (raw.kind === "override") {
    if (typeof raw.overrideDate !== "string" || !isIsoDate(raw.overrideDate)) {
      throw new MapperError(`Invalid ${field}.overrideDate`, `${field}.overrideDate`);
    }
    return { kind: "override", date: raw.date, overrideDate: raw.overrideDate };
  }
  throw new MapperError(`Invalid ${field}.kind`, `${field}.kind`);
}

/**
 * Validates untrusted recurrence input and returns a canonical RecurrenceRule:
 * allowlisted keys, ISO date strings, allowlisted frequency/weekday/end/exception
 * shapes. Cross-checks the result with the engine's isValidRecurrenceRule so the
 * semantic rules (e.g. weekly requires byWeekdays) have a single source of truth.
 * Throws MapperError on invalid input.
 */
export function parseRecurrenceRule(raw: unknown, field = "recurrence"): RecurrenceRule {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  for (const key of Object.keys(raw)) {
    if (!RECURRENCE_ALLOWED_KEYS.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  if (typeof raw.anchorDate !== "string" || !isIsoDate(raw.anchorDate)) {
    throw new MapperError(`Invalid ${field}.anchorDate`, `${field}.anchorDate`);
  }

  const rule: RecurrenceRule = { anchorDate: raw.anchorDate };

  if (raw.frequency !== undefined) {
    if (
      typeof raw.frequency !== "string" ||
      !(RECURRENCE_FREQUENCIES as string[]).includes(raw.frequency)
    ) {
      throw new MapperError(`Invalid ${field}.frequency`, `${field}.frequency`);
    }
    rule.frequency = raw.frequency as RecurrenceFrequency;
  }

  if (raw.interval !== undefined) {
    if (typeof raw.interval !== "number" || !isPositiveInteger(raw.interval)) {
      throw new MapperError(`Invalid ${field}.interval`, `${field}.interval`);
    }
    rule.interval = raw.interval;
  }

  if (raw.byWeekdays !== undefined) {
    if (!Array.isArray(raw.byWeekdays)) {
      throw new MapperError(`Invalid ${field}.byWeekdays: expected array`, `${field}.byWeekdays`);
    }
    const days: Weekday[] = [];
    for (const day of raw.byWeekdays) {
      if (typeof day !== "string" || !WEEKDAYS.includes(day as Weekday)) {
        throw new MapperError(
          `Invalid ${field}.byWeekdays: unknown weekday`,
          `${field}.byWeekdays`
        );
      }
      if (!days.includes(day as Weekday)) days.push(day as Weekday);
    }
    rule.byWeekdays = days;
  }

  if (raw.dayOfMonth !== undefined) {
    if (
      typeof raw.dayOfMonth !== "number" ||
      !Number.isInteger(raw.dayOfMonth) ||
      raw.dayOfMonth < 1 ||
      raw.dayOfMonth > 31
    ) {
      throw new MapperError(`Invalid ${field}.dayOfMonth`, `${field}.dayOfMonth`);
    }
    rule.dayOfMonth = raw.dayOfMonth;
  }

  if (raw.startDate !== undefined) {
    if (typeof raw.startDate !== "string" || !isIsoDate(raw.startDate)) {
      throw new MapperError(`Invalid ${field}.startDate`, `${field}.startDate`);
    }
    rule.startDate = raw.startDate;
  }

  if (raw.end !== undefined) {
    rule.end = parseRecurrenceEnd(raw.end, `${field}.end`);
  }

  if (raw.exceptions !== undefined) {
    if (!Array.isArray(raw.exceptions)) {
      throw new MapperError(`Invalid ${field}.exceptions: expected array`, `${field}.exceptions`);
    }
    rule.exceptions = raw.exceptions.map((exc, index) =>
      parseRecurrenceException(exc, `${field}.exceptions[${index}]`)
    );
  }

  if (!isValidRecurrenceRule(rule)) {
    throw new MapperError(`Invalid ${field}: rule failed validation`, field);
  }

  return rule;
}

function assertValidEvent(event: LifeEvent): void {
  assertUuid(event.id, "event.id");
  assertNonEmptyName(event.title, "event.title");
  assertIsoDate(event.date, "event.date");
  assertIsoTimestamp(event.createdAtIso, "event.createdAtIso");
  assertIsoTimestamp(event.updatedAtIso, "event.updatedAtIso");

  if (!isEventType(event.type)) {
    throw new MapperError("Invalid event.type", "event.type");
  }
  if (typeof event.reminder !== "boolean") {
    throw new MapperError("Invalid event.reminder", "event.reminder");
  }
  if (event.personName !== undefined && typeof event.personName !== "string") {
    throw new MapperError("Invalid event.personName", "event.personName");
  }
  if (event.personId !== undefined) {
    assertUuid(event.personId, "event.personId");
  }
  if (event.notes !== undefined && typeof event.notes !== "string") {
    throw new MapperError("Invalid event.notes", "event.notes");
  }
  if (event.startTime !== undefined) {
    if (typeof event.startTime !== "string" || !isHhMm(event.startTime)) {
      throw new MapperError("Invalid event.startTime", "event.startTime");
    }
  }
  if (event.endTime !== undefined) {
    if (typeof event.endTime !== "string" || !isHhMm(event.endTime)) {
      throw new MapperError("Invalid event.endTime", "event.endTime");
    }
    if (event.startTime === undefined) {
      throw new MapperError("event.endTime requires event.startTime", "event.endTime");
    }
    if (parseHHMMToMinutes(event.endTime) < parseHHMMToMinutes(event.startTime)) {
      throw new MapperError("event.endTime must be >= event.startTime", "event.endTime");
    }
  }
  if (event.recurrence !== undefined) {
    parseRecurrenceRule(event.recurrence, "event.recurrence");
  }
  if (event.seriesId !== undefined) {
    assertUuid(event.seriesId, "event.seriesId");
  }
}

export function assertValidPerson(person: Person): void {
  assertUuid(person.id, "person.id");
  assertNonEmptyName(person.name, "person.name");
  assertIsoTimestamp(person.createdAtIso, "person.createdAtIso");
  assertIsoTimestamp(person.updatedAtIso, "person.updatedAtIso");

  if (person.nickname !== undefined && typeof person.nickname !== "string") {
    throw new MapperError("Invalid person.nickname", "person.nickname");
  }
  if (person.birthdayMonthDay !== undefined) {
    if (
      typeof person.birthdayMonthDay !== "string" ||
      !isBirthdayMonthDay(person.birthdayMonthDay)
    ) {
      throw new MapperError("Invalid person.birthdayMonthDay", "person.birthdayMonthDay");
    }
  }
  if (person.relationship !== undefined && typeof person.relationship !== "string") {
    throw new MapperError("Invalid person.relationship", "person.relationship");
  }
  if (person.likes !== undefined && typeof person.likes !== "string") {
    throw new MapperError("Invalid person.likes", "person.likes");
  }
  if (person.dislikes !== undefined && typeof person.dislikes !== "string") {
    throw new MapperError("Invalid person.dislikes", "person.dislikes");
  }
  if (person.giftIdeas !== undefined && typeof person.giftIdeas !== "string") {
    throw new MapperError("Invalid person.giftIdeas", "person.giftIdeas");
  }
  if (person.notes !== undefined && typeof person.notes !== "string") {
    throw new MapperError("Invalid person.notes", "person.notes");
  }
  if (person.lastContactDate !== undefined) {
    assertIsoDate(person.lastContactDate, "person.lastContactDate");
  }
  if (
    person.contactCadenceDays !== undefined &&
    !isPositiveInteger(person.contactCadenceDays)
  ) {
    throw new MapperError("Invalid person.contactCadenceDays", "person.contactCadenceDays");
  }
}

function assertValidHttpUrl(url: string, field: string): void {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new MapperError(`Invalid URL: ${field}`, field);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new MapperError(`Invalid URL: ${field}`, field);
    }
  } catch {
    throw new MapperError(`Invalid URL: ${field}`, field);
  }
}

export function parseRequiredSkillIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isUuid(item)) {
      throw new MapperError(`Invalid ${field}: expected UUID strings`, field);
    }
    if (!ids.includes(item)) {
      ids.push(item);
    }
  }
  return ids;
}

export function assertValidJobApplication(app: JobApplication): void {
  assertUuid(app.id, "jobApplication.id");
  assertNonEmptyName(app.company, "jobApplication.company");
  assertNonEmptyName(app.roleTitle, "jobApplication.roleTitle");
  assertIsoTimestamp(app.createdAtIso, "jobApplication.createdAtIso");
  assertIsoTimestamp(app.updatedAtIso, "jobApplication.updatedAtIso");

  if (!isApplicationStatus(app.status)) {
    throw new MapperError("Invalid jobApplication.status", "jobApplication.status");
  }
  if (app.salaryMin !== undefined && !isPositiveInteger(app.salaryMin)) {
    throw new MapperError("Invalid jobApplication.salaryMin", "jobApplication.salaryMin");
  }
  if (app.salaryMax !== undefined && !isPositiveInteger(app.salaryMax)) {
    throw new MapperError("Invalid jobApplication.salaryMax", "jobApplication.salaryMax");
  }
  if (
    app.salaryMin !== undefined &&
    app.salaryMax !== undefined &&
    app.salaryMax < app.salaryMin
  ) {
    throw new MapperError(
      "jobApplication.salaryMax must be >= salaryMin",
      "jobApplication.salaryMax"
    );
  }
  if (app.location !== undefined && typeof app.location !== "string") {
    throw new MapperError("Invalid jobApplication.location", "jobApplication.location");
  }
  if (app.remotePolicy !== undefined && !isRemotePolicy(app.remotePolicy)) {
    throw new MapperError("Invalid jobApplication.remotePolicy", "jobApplication.remotePolicy");
  }
  if (app.appliedDate !== undefined) {
    assertIsoDate(app.appliedDate, "jobApplication.appliedDate");
  }
  if (app.url !== undefined) {
    assertValidHttpUrl(app.url, "jobApplication.url");
  }
  if (app.notes !== undefined && typeof app.notes !== "string") {
    throw new MapperError("Invalid jobApplication.notes", "jobApplication.notes");
  }
  if (!Array.isArray(app.requiredSkillIds)) {
    throw new MapperError(
      "Invalid jobApplication.requiredSkillIds",
      "jobApplication.requiredSkillIds"
    );
  }
  for (const skillId of app.requiredSkillIds) {
    assertUuid(skillId, "jobApplication.requiredSkillIds");
  }
  if (app.requiredSkillsText !== undefined && typeof app.requiredSkillsText !== "string") {
    throw new MapperError(
      "Invalid jobApplication.requiredSkillsText",
      "jobApplication.requiredSkillsText"
    );
  }
}

export function assertValidCareerTarget(target: CareerTarget): void {
  assertUuid(target.id, "careerTarget.id");
  assertNonEmptyName(target.roleTitle, "careerTarget.roleTitle");
  assertIsoTimestamp(target.updatedAtIso, "careerTarget.updatedAtIso");

  if (target.company !== undefined && typeof target.company !== "string") {
    throw new MapperError("Invalid careerTarget.company", "careerTarget.company");
  }
  if (target.notes !== undefined && typeof target.notes !== "string") {
    throw new MapperError("Invalid careerTarget.notes", "careerTarget.notes");
  }
  if (!Array.isArray(target.requiredSkillIds)) {
    throw new MapperError(
      "Invalid careerTarget.requiredSkillIds",
      "careerTarget.requiredSkillIds"
    );
  }
  for (const skillId of target.requiredSkillIds) {
    assertUuid(skillId, "careerTarget.requiredSkillIds");
  }
  if (target.requiredSkillsText !== undefined && typeof target.requiredSkillsText !== "string") {
    throw new MapperError(
      "Invalid careerTarget.requiredSkillsText",
      "careerTarget.requiredSkillsText"
    );
  }
}

export function isWorkoutFocus(value: string): value is WorkoutFocus {
  return WORKOUT_FOCUSES.includes(value as WorkoutFocus);
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function parseExerciseEntries(value: unknown, field: string): ExerciseEntry[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const entries: ExerciseEntry[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const obj = item as Record<string, unknown>;
    const entryId = obj.id;
    if (typeof entryId !== "string" || !isUuid(entryId)) {
      throw new MapperError(`Invalid ${field}: expected UUID id`, field);
    }
    if (seenIds.has(entryId)) {
      throw new MapperError(`Invalid ${field}: duplicate exercise id`, field);
    }
    seenIds.add(entryId);

    const name = obj.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new MapperError(`Invalid ${field}: exercise name required`, field);
    }

    const entry: ExerciseEntry = {
      id: entryId,
      name: name.trim(),
    };

    if (obj.sets !== undefined && obj.sets !== null) {
      if (typeof obj.sets !== "number" || !isPositiveInteger(obj.sets)) {
        throw new MapperError(`Invalid ${field}: sets must be positive integer`, field);
      }
      entry.sets = obj.sets;
    }

    if (obj.reps !== undefined && obj.reps !== null) {
      if (typeof obj.reps !== "number" || !isPositiveInteger(obj.reps)) {
        throw new MapperError(`Invalid ${field}: reps must be positive integer`, field);
      }
      entry.reps = obj.reps;
    }

    if (obj.weight !== undefined && obj.weight !== null) {
      if (typeof obj.weight !== "number" || !isNonNegativeNumber(obj.weight)) {
        throw new MapperError(`Invalid ${field}: weight must be non-negative number`, field);
      }
      entry.weight = obj.weight;
    }

    if (obj.notes !== undefined && obj.notes !== null) {
      if (typeof obj.notes !== "string") {
        throw new MapperError(`Invalid ${field}: notes must be string`, field);
      }
      const trimmedNotes = obj.notes.trim();
      if (trimmedNotes.length > 0) {
        entry.notes = trimmedNotes;
      }
    }

    entries.push(entry);
  }

  return entries;
}

export function assertValidExerciseEntry(entry: ExerciseEntry): void {
  assertUuid(entry.id, "exerciseEntry.id");
  assertNonEmptyName(entry.name, "exerciseEntry.name");

  if (entry.sets !== undefined && !isPositiveInteger(entry.sets)) {
    throw new MapperError("Invalid exerciseEntry.sets", "exerciseEntry.sets");
  }
  if (entry.reps !== undefined && !isPositiveInteger(entry.reps)) {
    throw new MapperError("Invalid exerciseEntry.reps", "exerciseEntry.reps");
  }
  if (entry.weight !== undefined && !isNonNegativeNumber(entry.weight)) {
    throw new MapperError("Invalid exerciseEntry.weight", "exerciseEntry.weight");
  }
  if (entry.notes !== undefined && typeof entry.notes !== "string") {
    throw new MapperError("Invalid exerciseEntry.notes", "exerciseEntry.notes");
  }
}

export function assertValidWorkoutPlan(plan: WorkoutPlan): void {
  assertUuid(plan.id, "workoutPlan.id");
  assertNonEmptyName(plan.name, "workoutPlan.name");
  assertIsoTimestamp(plan.createdAtIso, "workoutPlan.createdAtIso");
  assertIsoTimestamp(plan.updatedAtIso, "workoutPlan.updatedAtIso");

  if (plan.focus !== undefined && !isWorkoutFocus(plan.focus)) {
    throw new MapperError("Invalid workoutPlan.focus", "workoutPlan.focus");
  }
  if (!Array.isArray(plan.exercises)) {
    throw new MapperError("Invalid workoutPlan.exercises", "workoutPlan.exercises");
  }
  if (plan.exercises.length === 0) {
    throw new MapperError("workoutPlan.exercises must not be empty", "workoutPlan.exercises");
  }
  for (const entry of plan.exercises) {
    assertValidExerciseEntry(entry);
  }
  if (plan.notes !== undefined && typeof plan.notes !== "string") {
    throw new MapperError("Invalid workoutPlan.notes", "workoutPlan.notes");
  }
  if (plan.scheduleSeries !== undefined) {
    parseSkillScheduleSeries(plan.scheduleSeries, "workoutPlan.scheduleSeries");
  }
  if (plan.seriesId !== undefined) {
    assertUuid(plan.seriesId, "workoutPlan.seriesId");
  }
  if (plan.schedule !== undefined) {
    parseWeeklySchedule(plan.schedule, "workoutPlan.schedule");
  }
}

export function assertValidWorkoutSession(session: WorkoutSession): void {
  assertUuid(session.id, "workoutSession.id");
  assertIsoDate(session.date, "workoutSession.date");
  assertIsoTimestamp(session.createdAtIso, "workoutSession.createdAtIso");
  assertIsoTimestamp(session.updatedAtIso, "workoutSession.updatedAtIso");

  if (session.focus !== undefined && !isWorkoutFocus(session.focus)) {
    throw new MapperError("Invalid workoutSession.focus", "workoutSession.focus");
  }
  if (session.planId !== undefined) {
    assertUuid(session.planId, "workoutSession.planId");
  }
  if (!Array.isArray(session.exercises)) {
    throw new MapperError("Invalid workoutSession.exercises", "workoutSession.exercises");
  }
  if (session.exercises.length === 0) {
    throw new MapperError(
      "workoutSession.exercises must not be empty",
      "workoutSession.exercises"
    );
  }
  for (const entry of session.exercises) {
    assertValidExerciseEntry(entry);
  }
  if (session.notes !== undefined && typeof session.notes !== "string") {
    throw new MapperError("Invalid workoutSession.notes", "workoutSession.notes");
  }
  if (session.durationMinutes !== undefined && !isPositiveInteger(session.durationMinutes)) {
    throw new MapperError(
      "Invalid workoutSession.durationMinutes",
      "workoutSession.durationMinutes"
    );
  }
  if (session.completedAtIso !== undefined) {
    assertIsoTimestamp(session.completedAtIso, "workoutSession.completedAtIso");
  }
}

function isFocusFeedbackAction(value: string): value is FocusFeedbackAction {
  return (FOCUS_FEEDBACK_ACTIONS as string[]).includes(value);
}

export function assertValidFocusFeedback(entry: FocusFeedback): void {
  assertUuid(entry.id, "focusFeedback.id");
  if (typeof entry.focusItemId !== "string" || entry.focusItemId.trim().length === 0) {
    throw new MapperError("focusFeedback.focusItemId must not be empty", "focusFeedback.focusItemId");
  }
  if (!isFocusFeedbackAction(entry.action)) {
    throw new MapperError("Invalid focusFeedback.action", "focusFeedback.action");
  }
  assertIsoTimestamp(entry.createdAtIso, "focusFeedback.createdAtIso");
  assertIsoTimestamp(entry.updatedAtIso, "focusFeedback.updatedAtIso");

  if (entry.action === "snoozed") {
    if (entry.untilIso === undefined) {
      throw new MapperError("Snoozed focusFeedback requires untilIso", "focusFeedback.untilIso");
    }
    assertIsoTimestamp(entry.untilIso, "focusFeedback.untilIso");
  } else if (entry.untilIso !== undefined) {
    throw new MapperError("Dismissed focusFeedback cannot include untilIso", "focusFeedback.untilIso");
  }
  if (entry.sourceSnapshot !== undefined) {
    if (typeof entry.sourceSnapshot !== "string" || entry.sourceSnapshot.trim().length === 0) {
      throw new MapperError(
        "focusFeedback.sourceSnapshot must be a non-empty string when set",
        "focusFeedback.sourceSnapshot"
      );
    }
  }
}

export function skillToRow(skill: Skill, userId: string): SkillRow {
  assertUuid(userId, "userId");
  const schedule = assertValidSkill(skill);

  return {
    id: skill.id,
    user_id: userId,
    name: skill.name.trim(),
    priority: skill.priority ?? null,
    daily_goal_minutes: skill.dailyGoalMinutes ?? null,
    weekly_goal_minutes: skill.weeklyGoalMinutes ?? null,
    schedule,
    schedule_series: skill.scheduleSeries
      ? parseSkillScheduleSeries(skill.scheduleSeries, "skill.scheduleSeries")
      : null,
    created_at: skill.createdAtIso,
    updated_at: skill.updatedAtIso,
  };
}

export function skillFromRow(row: SkillRow): Skill {
  assertUuid(row.id, "skills.id");
  assertUuid(row.user_id, "skills.user_id");
  assertNonEmptyName(row.name, "skills.name");
  assertIsoTimestamp(row.created_at, "skills.created_at");
  assertIsoTimestamp(row.updated_at, "skills.updated_at");

  if (row.priority !== null && !isPriority(row.priority)) {
    throw new MapperError("Invalid skills.priority", "skills.priority");
  }
  if (
    row.daily_goal_minutes !== null &&
    !isNonNegativeInteger(row.daily_goal_minutes)
  ) {
    throw new MapperError("Invalid skills.daily_goal_minutes", "skills.daily_goal_minutes");
  }
  if (
    row.weekly_goal_minutes !== null &&
    !isNonNegativeInteger(row.weekly_goal_minutes)
  ) {
    throw new MapperError(
      "Invalid skills.weekly_goal_minutes",
      "skills.weekly_goal_minutes"
    );
  }

  const schedule = parseWeeklySchedule(row.schedule, "skills.schedule");

  const skill: Skill = {
    id: row.id,
    name: row.name.trim(),
    schedule,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.priority !== null) {
    skill.priority = row.priority;
  }
  if (row.daily_goal_minutes !== null) {
    skill.dailyGoalMinutes = row.daily_goal_minutes;
  }
  if (row.weekly_goal_minutes !== null) {
    skill.weeklyGoalMinutes = row.weekly_goal_minutes;
  }
  if (row.schedule_series !== null && row.schedule_series !== undefined) {
    skill.scheduleSeries = parseSkillScheduleSeries(
      row.schedule_series,
      "skills.schedule_series"
    );
  }

  return skill;
}

export function sessionToRow(session: Session, userId: string): SessionRow {
  assertUuid(userId, "userId");
  assertValidSession(session);

  return {
    id: session.id,
    user_id: userId,
    skill_id: session.skillId,
    minutes: session.minutes,
    started_at: session.startedAtIso,
    created_at: session.createdAtIso,
  };
}

export function sessionFromRow(row: SessionRow): Session {
  assertUuid(row.id, "sessions.id");
  assertUuid(row.user_id, "sessions.user_id");
  assertUuid(row.skill_id, "sessions.skill_id");
  assertIsoTimestamp(row.started_at, "sessions.started_at");
  assertIsoTimestamp(row.created_at, "sessions.created_at");

  if (!isPositiveInteger(row.minutes)) {
    throw new MapperError("Invalid sessions.minutes", "sessions.minutes");
  }

  return {
    id: row.id,
    skillId: row.skill_id,
    minutes: row.minutes,
    startedAtIso: row.started_at,
    createdAtIso: row.created_at,
  };
}

export function eventToRow(event: LifeEvent, userId: string): EventRow {
  assertUuid(userId, "userId");
  assertValidEvent(event);

  return {
    id: event.id,
    user_id: userId,
    title: event.title.trim(),
    date: event.date,
    type: event.type,
    start_time: event.startTime ?? null,
    end_time: event.endTime ?? null,
    person_name: event.personName?.trim() || null,
    person_id: event.personId ?? null,
    notes: event.notes?.trim() || null,
    reminder: event.reminder,
    recurrence: event.recurrence ? parseRecurrenceRule(event.recurrence) : null,
    series_id: event.seriesId ?? null,
    created_at: event.createdAtIso,
    updated_at: event.updatedAtIso,
  };
}

export function eventFromRow(row: EventRow): LifeEvent {
  assertUuid(row.id, "events.id");
  assertUuid(row.user_id, "events.user_id");
  assertNonEmptyName(row.title, "events.title");
  assertIsoDate(row.date, "events.date");
  assertIsoTimestamp(row.created_at, "events.created_at");
  assertIsoTimestamp(row.updated_at, "events.updated_at");

  if (!isEventType(row.type)) {
    throw new MapperError("Invalid events.type", "events.type");
  }
  if (typeof row.reminder !== "boolean") {
    throw new MapperError("Invalid events.reminder", "events.reminder");
  }

  const event: LifeEvent = {
    id: row.id,
    title: row.title.trim(),
    date: row.date,
    type: row.type,
    reminder: row.reminder,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.person_name !== null && row.person_name.trim().length > 0) {
    event.personName = row.person_name.trim();
  }
  if (row.person_id !== null) {
    assertUuid(row.person_id, "events.person_id");
    event.personId = row.person_id;
  }
  if (row.notes !== null && row.notes.trim().length > 0) {
    event.notes = row.notes.trim();
  }
  if (row.start_time !== null && isHhMm(row.start_time)) {
    event.startTime = row.start_time;
  }
  if (row.end_time !== null && isHhMm(row.end_time)) {
    event.endTime = row.end_time;
  }
  if (row.recurrence !== null && row.recurrence !== undefined) {
    event.recurrence = parseRecurrenceRule(row.recurrence, "events.recurrence");
  }
  if (row.series_id !== null && row.series_id !== undefined) {
    assertUuid(row.series_id, "events.series_id");
    event.seriesId = row.series_id;
  }

  return event;
}

export function personToRow(person: Person, userId: string): PersonRow {
  assertUuid(userId, "userId");
  assertValidPerson(person);

  return {
    id: person.id,
    user_id: userId,
    name: person.name.trim(),
    nickname: person.nickname?.trim() || null,
    birthday_month_day: person.birthdayMonthDay ?? null,
    relationship: person.relationship?.trim() || null,
    likes: person.likes?.trim() || null,
    dislikes: person.dislikes?.trim() || null,
    gift_ideas: person.giftIdeas?.trim() || null,
    notes: person.notes?.trim() || null,
    last_contact_date: person.lastContactDate ?? null,
    contact_cadence_days: person.contactCadenceDays ?? null,
    created_at: person.createdAtIso,
    updated_at: person.updatedAtIso,
  };
}

export function personFromRow(row: PersonRow): Person {
  assertUuid(row.id, "people.id");
  assertUuid(row.user_id, "people.user_id");
  assertNonEmptyName(row.name, "people.name");
  assertIsoTimestamp(row.created_at, "people.created_at");
  assertIsoTimestamp(row.updated_at, "people.updated_at");

  if (
    row.birthday_month_day !== null &&
    !isBirthdayMonthDay(row.birthday_month_day)
  ) {
    throw new MapperError("Invalid people.birthday_month_day", "people.birthday_month_day");
  }
  if (row.last_contact_date !== null) {
    assertIsoDate(row.last_contact_date, "people.last_contact_date");
  }
  if (
    row.contact_cadence_days !== null &&
    !isPositiveInteger(row.contact_cadence_days)
  ) {
    throw new MapperError(
      "Invalid people.contact_cadence_days",
      "people.contact_cadence_days"
    );
  }

  const person: Person = {
    id: row.id,
    name: row.name.trim(),
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.nickname !== null && row.nickname.trim().length > 0) {
    person.nickname = row.nickname.trim();
  }
  if (row.birthday_month_day !== null) {
    person.birthdayMonthDay = row.birthday_month_day;
  }
  if (row.relationship !== null && row.relationship.trim().length > 0) {
    person.relationship = row.relationship.trim();
  }
  if (row.likes !== null && row.likes.trim().length > 0) {
    person.likes = row.likes.trim();
  }
  if (row.dislikes !== null && row.dislikes.trim().length > 0) {
    person.dislikes = row.dislikes.trim();
  }
  if (row.gift_ideas !== null && row.gift_ideas.trim().length > 0) {
    person.giftIdeas = row.gift_ideas.trim();
  }
  if (row.notes !== null && row.notes.trim().length > 0) {
    person.notes = row.notes.trim();
  }
  if (row.last_contact_date !== null) {
    person.lastContactDate = row.last_contact_date;
  }
  if (row.contact_cadence_days !== null) {
    person.contactCadenceDays = row.contact_cadence_days;
  }

  return person;
}

export function jobApplicationToRow(app: JobApplication, userId: string): JobApplicationRow {
  assertUuid(userId, "userId");
  assertValidJobApplication(app);

  return {
    id: app.id,
    user_id: userId,
    company: app.company.trim(),
    role_title: app.roleTitle.trim(),
    status: app.status,
    salary_min: app.salaryMin ?? null,
    salary_max: app.salaryMax ?? null,
    location: app.location?.trim() || null,
    remote_policy: app.remotePolicy ?? null,
    applied_date: app.appliedDate ?? null,
    url: app.url?.trim() || null,
    notes: app.notes?.trim() || null,
    required_skill_ids: app.requiredSkillIds,
    required_skills_text: app.requiredSkillsText?.trim() || null,
    created_at: app.createdAtIso,
    updated_at: app.updatedAtIso,
  };
}

export function jobApplicationFromRow(row: JobApplicationRow): JobApplication {
  assertUuid(row.id, "job_applications.id");
  assertUuid(row.user_id, "job_applications.user_id");
  assertNonEmptyName(row.company, "job_applications.company");
  assertNonEmptyName(row.role_title, "job_applications.role_title");
  assertIsoTimestamp(row.created_at, "job_applications.created_at");
  assertIsoTimestamp(row.updated_at, "job_applications.updated_at");

  if (!isApplicationStatus(row.status)) {
    throw new MapperError("Invalid job_applications.status", "job_applications.status");
  }
  if (row.salary_min !== null && !isPositiveInteger(row.salary_min)) {
    throw new MapperError("Invalid job_applications.salary_min", "job_applications.salary_min");
  }
  if (row.salary_max !== null && !isPositiveInteger(row.salary_max)) {
    throw new MapperError("Invalid job_applications.salary_max", "job_applications.salary_max");
  }
  if (
    row.salary_min !== null &&
    row.salary_max !== null &&
    row.salary_max < row.salary_min
  ) {
    throw new MapperError(
      "Invalid job_applications.salary_max",
      "job_applications.salary_max"
    );
  }
  if (row.remote_policy !== null && !isRemotePolicy(row.remote_policy)) {
    throw new MapperError(
      "Invalid job_applications.remote_policy",
      "job_applications.remote_policy"
    );
  }
  if (row.applied_date !== null) {
    assertIsoDate(row.applied_date, "job_applications.applied_date");
  }
  if (row.url !== null && row.url.trim().length > 0) {
    assertValidHttpUrl(row.url, "job_applications.url");
  }

  const requiredSkillIds = parseRequiredSkillIds(
    row.required_skill_ids,
    "job_applications.required_skill_ids"
  );

  const app: JobApplication = {
    id: row.id,
    company: row.company.trim(),
    roleTitle: row.role_title.trim(),
    status: row.status,
    requiredSkillIds,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.salary_min !== null) app.salaryMin = row.salary_min;
  if (row.salary_max !== null) app.salaryMax = row.salary_max;
  if (row.location !== null && row.location.trim().length > 0) {
    app.location = row.location.trim();
  }
  if (row.remote_policy !== null) app.remotePolicy = row.remote_policy;
  if (row.applied_date !== null) app.appliedDate = row.applied_date;
  if (row.url !== null && row.url.trim().length > 0) app.url = row.url.trim();
  if (row.notes !== null && row.notes.trim().length > 0) app.notes = row.notes.trim();
  if (row.required_skills_text !== null && row.required_skills_text.trim().length > 0) {
    app.requiredSkillsText = row.required_skills_text.trim();
  }

  return app;
}

export function careerTargetToRow(target: CareerTarget, userId: string): CareerTargetRow {
  assertUuid(userId, "userId");
  assertValidCareerTarget(target);

  return {
    id: target.id,
    user_id: userId,
    role_title: target.roleTitle.trim(),
    company: target.company?.trim() || null,
    notes: target.notes?.trim() || null,
    required_skill_ids: target.requiredSkillIds,
    required_skills_text: target.requiredSkillsText?.trim() || null,
    updated_at: target.updatedAtIso,
  };
}

export function careerTargetFromRow(row: CareerTargetRow): CareerTarget {
  assertUuid(row.id, "career_targets.id");
  assertUuid(row.user_id, "career_targets.user_id");
  assertNonEmptyName(row.role_title, "career_targets.role_title");
  assertIsoTimestamp(row.updated_at, "career_targets.updated_at");

  const requiredSkillIds = parseRequiredSkillIds(
    row.required_skill_ids,
    "career_targets.required_skill_ids"
  );

  const target: CareerTarget = {
    id: row.id,
    roleTitle: row.role_title.trim(),
    requiredSkillIds,
    updatedAtIso: row.updated_at,
  };

  if (row.company !== null && row.company.trim().length > 0) {
    target.company = row.company.trim();
  }
  if (row.notes !== null && row.notes.trim().length > 0) {
    target.notes = row.notes.trim();
  }
  if (row.required_skills_text !== null && row.required_skills_text.trim().length > 0) {
    target.requiredSkillsText = row.required_skills_text.trim();
  }

  return target;
}

export function workoutPlanToRow(plan: WorkoutPlan, userId: string): WorkoutPlanRow {
  assertUuid(userId, "userId");
  assertValidWorkoutPlan(plan);

  const schedule = parseWeeklySchedule(
    plan.schedule ?? defaultWeeklySchedule(),
    "workoutPlan.schedule"
  );

  return {
    id: plan.id,
    user_id: userId,
    name: plan.name.trim(),
    focus: plan.focus ?? null,
    exercises: plan.exercises,
    notes: plan.notes?.trim() || null,
    schedule,
    schedule_series: plan.scheduleSeries
      ? parseSkillScheduleSeries(plan.scheduleSeries, "workoutPlan.scheduleSeries")
      : null,
    series_id: plan.seriesId ?? null,
    created_at: plan.createdAtIso,
    updated_at: plan.updatedAtIso,
  };
}

export function workoutPlanFromRow(row: WorkoutPlanRow): WorkoutPlan {
  assertUuid(row.id, "workout_plans.id");
  assertUuid(row.user_id, "workout_plans.user_id");
  assertNonEmptyName(row.name, "workout_plans.name");
  assertIsoTimestamp(row.created_at, "workout_plans.created_at");
  assertIsoTimestamp(row.updated_at, "workout_plans.updated_at");

  if (row.focus !== null && !isWorkoutFocus(row.focus)) {
    throw new MapperError("Invalid workout_plans.focus", "workout_plans.focus");
  }

  const exercises = parseExerciseEntries(row.exercises, "workout_plans.exercises");
  if (exercises.length === 0) {
    throw new MapperError(
      "workout_plans.exercises must not be empty",
      "workout_plans.exercises"
    );
  }

  const schedule = parseWeeklySchedule(row.schedule, "workout_plans.schedule");

  const plan: WorkoutPlan = {
    id: row.id,
    name: row.name.trim(),
    exercises,
    schedule,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.focus !== null) plan.focus = row.focus;
  if (row.notes !== null && row.notes.trim().length > 0) {
    plan.notes = row.notes.trim();
  }
  if (row.schedule_series !== null && row.schedule_series !== undefined) {
    plan.scheduleSeries = parseSkillScheduleSeries(
      row.schedule_series,
      "workout_plans.schedule_series"
    );
  }
  if (row.series_id !== null) {
    assertUuid(row.series_id, "workout_plans.series_id");
    plan.seriesId = row.series_id;
  }

  return plan;
}

export function workoutSessionToRow(session: WorkoutSession, userId: string): WorkoutSessionRow {
  assertUuid(userId, "userId");
  assertValidWorkoutSession(session);

  return {
    id: session.id,
    user_id: userId,
    workout_date: session.date,
    focus: session.focus ?? null,
    plan_id: session.planId ?? null,
    exercises: session.exercises,
    notes: session.notes?.trim() || null,
    duration_minutes: session.durationMinutes ?? null,
    completed_at: session.completedAtIso ?? null,
    created_at: session.createdAtIso,
    updated_at: session.updatedAtIso,
  };
}

export function workoutSessionFromRow(row: WorkoutSessionRow): WorkoutSession {
  assertUuid(row.id, "workout_sessions.id");
  assertUuid(row.user_id, "workout_sessions.user_id");
  assertIsoDate(row.workout_date, "workout_sessions.workout_date");
  assertIsoTimestamp(row.created_at, "workout_sessions.created_at");
  assertIsoTimestamp(row.updated_at, "workout_sessions.updated_at");

  if (row.focus !== null && !isWorkoutFocus(row.focus)) {
    throw new MapperError("Invalid workout_sessions.focus", "workout_sessions.focus");
  }
  if (row.plan_id !== null) {
    assertUuid(row.plan_id, "workout_sessions.plan_id");
  }

  const exercises = parseExerciseEntries(row.exercises, "workout_sessions.exercises");
  if (exercises.length === 0) {
    throw new MapperError(
      "workout_sessions.exercises must not be empty",
      "workout_sessions.exercises"
    );
  }

  const session: WorkoutSession = {
    id: row.id,
    date: row.workout_date,
    exercises,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.focus !== null) session.focus = row.focus;
  if (row.plan_id !== null) session.planId = row.plan_id;
  if (row.notes !== null && row.notes.trim().length > 0) {
    session.notes = row.notes.trim();
  }
  if (row.duration_minutes !== null) {
    if (!isPositiveInteger(row.duration_minutes)) {
      throw new MapperError(
        "Invalid workout_sessions.duration_minutes",
        "workout_sessions.duration_minutes"
      );
    }
    session.durationMinutes = row.duration_minutes;
  }
  if (row.completed_at !== null) {
    assertIsoTimestamp(row.completed_at, "workout_sessions.completed_at");
    session.completedAtIso = row.completed_at;
  }

  return session;
}

export function focusFeedbackToRow(entry: FocusFeedback, userId: string): FocusFeedbackRow {
  assertUuid(userId, "userId");
  assertValidFocusFeedback(entry);

  return {
    id: entry.id,
    user_id: userId,
    focus_item_id: entry.focusItemId.trim(),
    action: entry.action,
    until_iso: entry.untilIso ?? null,
    source_snapshot: entry.sourceSnapshot?.trim() || null,
    created_at: entry.createdAtIso,
    updated_at: entry.updatedAtIso,
  };
}

export function focusFeedbackFromRow(row: FocusFeedbackRow): FocusFeedback {
  assertUuid(row.id, "focus_feedback.id");
  assertUuid(row.user_id, "focus_feedback.user_id");
  if (typeof row.focus_item_id !== "string" || row.focus_item_id.trim().length === 0) {
    throw new MapperError("Invalid focus_feedback.focus_item_id", "focus_feedback.focus_item_id");
  }
  if (!isFocusFeedbackAction(row.action)) {
    throw new MapperError("Invalid focus_feedback.action", "focus_feedback.action");
  }
  assertIsoTimestamp(row.created_at, "focus_feedback.created_at");
  assertIsoTimestamp(row.updated_at, "focus_feedback.updated_at");

  if (row.action === "snoozed") {
    if (row.until_iso === null) {
      throw new MapperError("Snoozed focus_feedback requires until_iso", "focus_feedback.until_iso");
    }
    assertIsoTimestamp(row.until_iso, "focus_feedback.until_iso");
  } else if (row.until_iso !== null) {
    throw new MapperError("Dismissed focus_feedback cannot include until_iso", "focus_feedback.until_iso");
  }

  const entry: FocusFeedback = {
    id: row.id,
    focusItemId: row.focus_item_id.trim(),
    action: row.action,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.until_iso !== null) {
    entry.untilIso = row.until_iso;
  }
  if (row.source_snapshot !== null) {
    if (typeof row.source_snapshot !== "string" || row.source_snapshot.trim().length === 0) {
      throw new MapperError(
        "Invalid focus_feedback.source_snapshot",
        "focus_feedback.source_snapshot"
      );
    }
    entry.sourceSnapshot = row.source_snapshot.trim();
  }

  return entry;
}

const CALENDAR_PREFERENCES_ALLOWED_KEYS = ["categories", "subcategories", "aliases"];
const SUBCATEGORY_KEY_MAX_LENGTH = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Subcategory keys are user-influenced; allowlist the shape "<category>:<suffix>"
// with an allowlisted category prefix, a non-empty single-segment suffix, no
// control characters, and a capped length (SECURITY_RULES: allowlist + size limits).
function isSafeSubcategoryKey(key: string): boolean {
  if (key.length === 0 || key.length > SUBCATEGORY_KEY_MAX_LENGTH) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) return false;
  const prefix = key.slice(0, separator);
  const suffix = key.slice(separator + 1);
  return isCalendarCategoryKey(prefix) && suffix.length > 0 && !suffix.includes(":");
}

/**
 * Validates untrusted calendar preferences and returns a canonical object:
 * allowlisted category/subcategory keys, palette-backed color tokens, sanitized
 * aliases (empty dropped), unknown top-level fields rejected. Throws MapperError
 * on invalid input. Used by both the row mapper and upload validation.
 */
export function parseCalendarColorPreferences(
  raw: unknown,
  field = "calendarPreferences"
): CalendarColorPreferences {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }

  for (const key of Object.keys(raw)) {
    if (!CALENDAR_PREFERENCES_ALLOWED_KEYS.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  const prefs: CalendarColorPreferences = {};

  if (raw.categories !== undefined) {
    if (!isPlainObject(raw.categories)) {
      throw new MapperError(`Invalid ${field}.categories: expected object`, `${field}.categories`);
    }
    const categories: Partial<Record<CalendarCategoryKey, CalendarColorToken>> = {};
    for (const [key, value] of Object.entries(raw.categories)) {
      if (!isCalendarCategoryKey(key)) {
        throw new MapperError(
          `Invalid ${field}.categories: unknown category "${key}"`,
          `${field}.categories`
        );
      }
      if (!isCalendarColorToken(value)) {
        throw new MapperError(
          `Invalid ${field}.categories: invalid token for "${key}"`,
          `${field}.categories`
        );
      }
      categories[key] = value;
    }
    if (Object.keys(categories).length > 0) prefs.categories = categories;
  }

  if (raw.subcategories !== undefined) {
    if (!isPlainObject(raw.subcategories)) {
      throw new MapperError(
        `Invalid ${field}.subcategories: expected object`,
        `${field}.subcategories`
      );
    }
    const subcategories: Record<string, CalendarColorToken> = {};
    for (const [key, value] of Object.entries(raw.subcategories)) {
      if (!isSafeSubcategoryKey(key)) {
        throw new MapperError(
          `Invalid ${field}.subcategories: unsafe key "${key}"`,
          `${field}.subcategories`
        );
      }
      if (!isCalendarColorToken(value)) {
        throw new MapperError(
          `Invalid ${field}.subcategories: invalid token for "${key}"`,
          `${field}.subcategories`
        );
      }
      subcategories[key] = value;
    }
    if (Object.keys(subcategories).length > 0) prefs.subcategories = subcategories;
  }

  if (raw.aliases !== undefined) {
    if (!isPlainObject(raw.aliases)) {
      throw new MapperError(`Invalid ${field}.aliases: expected object`, `${field}.aliases`);
    }
    const aliases: Partial<Record<CalendarCategoryKey, string>> = {};
    for (const [key, value] of Object.entries(raw.aliases)) {
      if (!isCalendarCategoryKey(key)) {
        throw new MapperError(
          `Invalid ${field}.aliases: unknown category "${key}"`,
          `${field}.aliases`
        );
      }
      if (typeof value !== "string") {
        throw new MapperError(
          `Invalid ${field}.aliases: alias for "${key}" must be a string`,
          `${field}.aliases`
        );
      }
      const alias = sanitizeCategoryAlias(value);
      if (alias !== undefined) aliases[key] = alias;
    }
    if (Object.keys(aliases).length > 0) prefs.aliases = aliases;
  }

  return prefs;
}

export function assertValidCalendarPreferences(prefs: CalendarColorPreferences): void {
  parseCalendarColorPreferences(prefs);
}

export function calendarPreferencesToRow(
  prefs: CalendarColorPreferences,
  userId: string
): CalendarPreferencesRow {
  assertUuid(userId, "userId");
  const preferences = parseCalendarColorPreferences(prefs);

  return {
    user_id: userId,
    preferences,
    updated_at: new Date().toISOString(),
  };
}

export function calendarPreferencesFromRow(
  row: CalendarPreferencesRow
): CalendarColorPreferences {
  assertUuid(row.user_id, "calendar_preferences.user_id");
  assertIsoTimestamp(row.updated_at, "calendar_preferences.updated_at");

  return parseCalendarColorPreferences(
    row.preferences,
    "calendar_preferences.preferences"
  );
}

const KNOWN_ACHIEVEMENT_IDS = new Set(ACHIEVEMENT_CATALOG.map((def) => def.id));

/**
 * Validates untrusted gamification state and returns a canonical object:
 * allowlisted keys, integer level >= 1, dismissed ids limited to known
 * achievements, ISO timestamp preserved. Throws MapperError on invalid shape.
 */
export function parseGamificationState(
  raw: unknown,
  field = "gamificationState"
): GamificationState {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }

  for (const key of Object.keys(raw)) {
    if (!isGamificationStateAllowedKey(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }

  const state: GamificationState = {};

  if (raw.lastAcknowledgedGlobalLevel !== undefined) {
    const level = raw.lastAcknowledgedGlobalLevel;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
      throw new MapperError(
        `Invalid ${field}.lastAcknowledgedGlobalLevel`,
        `${field}.lastAcknowledgedGlobalLevel`
      );
    }
    state.lastAcknowledgedGlobalLevel = level;
  }

  if (raw.dismissedAchievementIds !== undefined) {
    if (!Array.isArray(raw.dismissedAchievementIds)) {
      throw new MapperError(
        `Invalid ${field}.dismissedAchievementIds: expected array`,
        `${field}.dismissedAchievementIds`
      );
    }
    const ids: string[] = [];
    for (const id of raw.dismissedAchievementIds) {
      if (typeof id !== "string") {
        throw new MapperError(
          `Invalid ${field}.dismissedAchievementIds: expected string ids`,
          `${field}.dismissedAchievementIds`
        );
      }
      if (KNOWN_ACHIEVEMENT_IDS.has(id) && !ids.includes(id)) ids.push(id);
    }
    if (ids.length > 0) state.dismissedAchievementIds = ids;
  }

  if (raw.updatedAtIso !== undefined) {
    if (typeof raw.updatedAtIso !== "string") {
      throw new MapperError(`Invalid ${field}.updatedAtIso`, `${field}.updatedAtIso`);
    }
    assertIsoTimestamp(raw.updatedAtIso, `${field}.updatedAtIso`);
    state.updatedAtIso = raw.updatedAtIso;
  }

  return state;
}

export function assertValidGamificationState(state: GamificationState): void {
  parseGamificationState(state);
}

export function gamificationStateToRow(
  state: GamificationState,
  userId: string
): GamificationStateRow {
  assertUuid(userId, "userId");
  const canonical = parseGamificationState(state);

  return {
    user_id: userId,
    state: canonical,
    updated_at: new Date().toISOString(),
  };
}

export function gamificationStateFromRow(
  row: GamificationStateRow
): GamificationState {
  assertUuid(row.user_id, "gamification_state.user_id");
  assertIsoTimestamp(row.updated_at, "gamification_state.updated_at");

  return parseGamificationState(row.state, "gamification_state.state");
}

function readOverrideId(item: unknown): string | undefined {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const id = (item as Record<string, unknown>).id;
  return typeof id === "string" && isUuid(id) ? id : undefined;
}

function readOverrideKind(item: unknown): string | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const kind = (item as Record<string, unknown>).kind;
  return typeof kind === "string" ? kind : null;
}

function readOverrideCreatedAt(item: unknown): string | undefined {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const createdAtIso = (item as Record<string, unknown>).createdAtIso;
  return typeof createdAtIso === "string" && isIsoTimestamp(createdAtIso)
    ? createdAtIso
    : undefined;
}

export function overrideToRow(
  item: unknown,
  userId: string,
  options?: { id?: string; createdAtIso?: string }
): OverrideRow {
  assertUuid(userId, "userId");

  const existingId = options?.id ?? readOverrideId(item);
  const id = existingId ?? crypto.randomUUID();
  assertUuid(id, "override.id");

  const kind = readOverrideKind(item);
  const payload =
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? item
      : { value: item };

  const createdAt =
    options?.createdAtIso ?? readOverrideCreatedAt(item) ?? new Date().toISOString();
  assertIsoTimestamp(createdAt, "override.created_at");

  return {
    id,
    user_id: userId,
    kind,
    payload,
    created_at: createdAt,
  };
}

function isWrappedPrimitivePayload(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const keys = Object.keys(payload as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "value";
}

export function overrideFromRow(row: OverrideRow): unknown {
  assertUuid(row.id, "overrides.id");
  assertUuid(row.user_id, "overrides.user_id");
  assertIsoTimestamp(row.created_at, "overrides.created_at");

  const payload = row.payload;

  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    !isWrappedPrimitivePayload(payload)
  ) {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.id !== "string" || !isUuid(obj.id)) {
      return { ...obj, id: row.id };
    }
  }

  return payload;
}

export function payloadFromRows(
  skillRows: SkillRow[],
  sessionRows: SessionRow[],
  overrideRows: OverrideRow[],
  eventRows: EventRow[] = [],
  peopleRows: PersonRow[] = [],
  jobApplicationRows: JobApplicationRow[] = [],
  careerTargetRows: CareerTargetRow[] = [],
  workoutPlanRows: WorkoutPlanRow[] = [],
  workoutSessionRows: WorkoutSessionRow[] = [],
  focusFeedbackRows: FocusFeedbackRow[] = [],
  calendarPreferencesRows: CalendarPreferencesRow[] = [],
  gamificationStateRows: GamificationStateRow[] = []
): AppPayload {
  const skills = skillRows.map((row) => skillFromRow(row));
  const sessions = sessionRows.map((row) => sessionFromRow(row));
  const overrides = overrideRows.map((row) => overrideFromRow(row));
  const events = eventRows.map((row) => eventFromRow(row));
  const people = peopleRows.map((row) => personFromRow(row));
  const jobApplications = jobApplicationRows.map((row) => jobApplicationFromRow(row));
  const workoutPlans = workoutPlanRows.map((row) => workoutPlanFromRow(row));
  const workoutSessions = workoutSessionRows.map((row) => workoutSessionFromRow(row));
  const focusFeedback = focusFeedbackRows.map((row) => focusFeedbackFromRow(row));

  let careerTarget: CareerTarget | undefined;
  if (careerTargetRows.length > 0) {
    const sorted = [...careerTargetRows].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
    careerTarget = careerTargetFromRow(sorted[0]!);
  }

  let calendarPreferences: CalendarColorPreferences | undefined;
  if (calendarPreferencesRows.length > 0) {
    const sorted = [...calendarPreferencesRows].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
    calendarPreferences = calendarPreferencesFromRow(sorted[0]!);
  }

  let gamificationState: GamificationState | undefined;
  if (gamificationStateRows.length > 0) {
    const sorted = [...gamificationStateRows].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
    gamificationState = gamificationStateFromRow(sorted[0]!);
  }

  const payload: AppPayload = {
    skills,
    sessions,
    overrides,
    events,
    people,
    jobApplications,
    careerTarget,
    workoutPlans,
    workoutSessions,
    focusFeedback,
    calendarPreferences,
    gamificationState,
  };
  validatePayloadForUpload(payload);
  return payload;
}

/** Ensures payload is safe to upload (unique ids, valid references). */
export function validatePayloadForUpload(payload: AppPayload): void {
  const skillIds = new Set<string>();

  for (const skill of payload.skills) {
    assertValidSkill(skill);
    if (skillIds.has(skill.id)) {
      throw new MapperError(`Duplicate skill id: ${skill.id}`, "skills.id");
    }
    skillIds.add(skill.id);
  }

  const sessionIds = new Set<string>();
  for (const session of payload.sessions) {
    assertValidSession(session);
    if (sessionIds.has(session.id)) {
      throw new MapperError(`Duplicate session id: ${session.id}`, "sessions.id");
    }
    sessionIds.add(session.id);
    if (!skillIds.has(session.skillId)) {
      throw new MapperError(
        `Session references unknown skill: ${session.skillId}`,
        "sessions.skillId"
      );
    }
  }

  for (const item of payload.overrides) {
    if (readOverrideId(item) !== undefined) {
      assertUuid(readOverrideId(item)!, "override.id");
    }
  }

  const eventIds = new Set<string>();
  for (const event of payload.events) {
    assertValidEvent(event);
    if (eventIds.has(event.id)) {
      throw new MapperError(`Duplicate event id: ${event.id}`, "events.id");
    }
    eventIds.add(event.id);
  }

  const personIds = new Set<string>();
  for (const person of payload.people) {
    assertValidPerson(person);
    if (personIds.has(person.id)) {
      throw new MapperError(`Duplicate person id: ${person.id}`, "people.id");
    }
    personIds.add(person.id);
  }

  for (const event of payload.events) {
    if (event.personId !== undefined && !personIds.has(event.personId)) {
      throw new MapperError(
        `Event references unknown person: ${event.personId}`,
        "events.personId"
      );
    }
  }

  const applicationIds = new Set<string>();
  for (const app of payload.jobApplications) {
    assertValidJobApplication(app);
    if (applicationIds.has(app.id)) {
      throw new MapperError(`Duplicate job application id: ${app.id}`, "jobApplications.id");
    }
    applicationIds.add(app.id);
    for (const skillId of app.requiredSkillIds) {
      if (!skillIds.has(skillId)) {
        throw new MapperError(
          `Job application references unknown skill: ${skillId}`,
          "jobApplications.requiredSkillIds"
        );
      }
    }
  }

  if (payload.careerTarget !== undefined) {
    assertValidCareerTarget(payload.careerTarget);
    for (const skillId of payload.careerTarget.requiredSkillIds) {
      if (!skillIds.has(skillId)) {
        throw new MapperError(
          `Career target references unknown skill: ${skillId}`,
          "careerTarget.requiredSkillIds"
        );
      }
    }
  }

  const planIds = new Set<string>();
  for (const plan of payload.workoutPlans) {
    assertValidWorkoutPlan(plan);
    if (planIds.has(plan.id)) {
      throw new MapperError(`Duplicate workout plan id: ${plan.id}`, "workoutPlans.id");
    }
    planIds.add(plan.id);
  }

  const workoutSessionIds = new Set<string>();
  for (const workoutSession of payload.workoutSessions) {
    assertValidWorkoutSession(workoutSession);
    if (workoutSessionIds.has(workoutSession.id)) {
      throw new MapperError(
        `Duplicate workout session id: ${workoutSession.id}`,
        "workoutSessions.id"
      );
    }
    workoutSessionIds.add(workoutSession.id);
    if (
      workoutSession.planId !== undefined &&
      !planIds.has(workoutSession.planId)
    ) {
      throw new MapperError(
        `Workout session references unknown plan: ${workoutSession.planId}`,
        "workoutSessions.planId"
      );
    }
  }

  const focusFeedbackIds = new Set<string>();
  for (const entry of payload.focusFeedback) {
    assertValidFocusFeedback(entry);
    if (focusFeedbackIds.has(entry.id)) {
      throw new MapperError(`Duplicate focus feedback id: ${entry.id}`, "focusFeedback.id");
    }
    focusFeedbackIds.add(entry.id);
  }

  if (payload.calendarPreferences !== undefined) {
    assertValidCalendarPreferences(payload.calendarPreferences);
  }

  if (payload.gamificationState !== undefined) {
    assertValidGamificationState(payload.gamificationState);
  }
}
