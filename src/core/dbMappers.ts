// Pure domain ↔ Postgres row mappers (no Supabase client).

import { defaultWeeklySchedule } from "./state";
import { parseHHMMToMinutes } from "./schedule";
import type {
  AppPayload,
  ApplicationStatus,
  CareerTarget,
  EventType,
  JobApplication,
  LifeEvent,
  Person,
  Priority,
  RemotePolicy,
  ScheduleBlock,
  Session,
  Skill,
  Weekday,
  WeeklySchedule,
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

export type SkillRow = {
  id: string;
  user_id: string;
  name: string;
  priority: number | null;
  daily_goal_minutes: number | null;
  weekly_goal_minutes: number | null;
  schedule: WeeklySchedule;
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
  careerTargetRows: CareerTargetRow[] = []
): AppPayload {
  const skills = skillRows.map((row) => skillFromRow(row));
  const sessions = sessionRows.map((row) => sessionFromRow(row));
  const overrides = overrideRows.map((row) => overrideFromRow(row));
  const events = eventRows.map((row) => eventFromRow(row));
  const people = peopleRows.map((row) => personFromRow(row));
  const jobApplications = jobApplicationRows.map((row) => jobApplicationFromRow(row));

  let careerTarget: CareerTarget | undefined;
  if (careerTargetRows.length > 0) {
    const sorted = [...careerTargetRows].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
    careerTarget = careerTargetFromRow(sorted[0]!);
  }

  const payload: AppPayload = {
    skills,
    sessions,
    overrides,
    events,
    people,
    jobApplications,
    careerTarget,
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
}
