// Pure domain ↔ Postgres row mappers (no Supabase client).

import { defaultWeeklySchedule } from "./state";
import type {
  AppPayload,
  Priority,
  ScheduleBlock,
  Session,
  Skill,
  Weekday,
  WeeklySchedule,
} from "./model";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HHMM_RE = /^(\d{2}):(\d{2})$/;

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
  overrideRows: OverrideRow[]
): AppPayload {
  const skills = skillRows.map((row) => skillFromRow(row));
  const sessions = sessionRows.map((row) => sessionFromRow(row));
  const overrides = overrideRows.map((row) => overrideFromRow(row));

  const payload: AppPayload = { skills, sessions, overrides };
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
}
