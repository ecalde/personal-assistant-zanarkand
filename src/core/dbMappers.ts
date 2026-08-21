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
import { eventPersonIds, linkedPeopleFields } from "./events";
import {
  normalizeSkillScheduleSeries,
} from "./skillSeries";
import { ACHIEVEMENT_CATALOG } from "./achievementCatalog";
import { isGamificationStateAllowedKey } from "./progressionModel";
import type {
  AppPayload,
  ApplicationInterview,
  ApplicationStatus,
  CareerTarget,
  CatalogRecipe,
  GamificationState,
  EventType,
  ExerciseEntry,
  InterviewFormat,
  InterviewOutcome,
  JobApplication,
  LifeEvent,
  Person,
  Priority,
  Recipe,
  RecipeIngredientLine,
  RecipeStep,
  RecipeStepKind,
  CookingSession,
  CookingTimer,
  CustomIngredient,
  Ingredient,
  IngredientAlias,
  IngredientNutrients,
  PantryItem,
  Per100g,
  NutrientSource,
  RetentionFactor,
  RemotePolicy,
  SanityImageRef,
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
  FitnessType,
  SupplementForm,
  SupplementIntakeLog,
  SupplementPhase,
  SupplementPhaseKind,
  SupplementProtocol,
  SupplementUnit,
  SupplementDoseSlot,
} from "./model";
import {
  isCookingMethod,
  isCookingTimerStatus,
  isPersistedCookingSessionStatus,
  isRecipeCategory,
  isRecipeDifficulty,
  isRecipeExperienceLevel,
  isRecipeSource,
  isRecipeStepKind,
} from "./cooking";

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
  "school",
  "vacation",
  "work",
  "other",
];

const LEGACY_EVENT_TYPE_ALIASES: Record<string, EventType> = {
  deadline: "school",
  career: "vacation",
};

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

const INTERVIEW_STAGES: ApplicationInterview["stage"][] = [
  "screening",
  "technical",
  "onsite",
];

const INTERVIEW_FORMATS: InterviewFormat[] = ["phone", "video", "onsite", "other"];

const INTERVIEW_OUTCOMES: InterviewOutcome[] = ["scheduled", "completed", "cancelled"];

const REMOTE_POLICIES: RemotePolicy[] = ["remote", "hybrid", "onsite", "unknown"];

const WORKOUT_FOCUSES: WorkoutFocus[] = [
  "push",
  "pull",
  "legs",
  "full_body",
  "cardio",
  "mobility",
];

const FITNESS_TYPES: FitnessType[] = ["workout", "supplement", "nutrition"];

const SUPPLEMENT_FORMS: SupplementForm[] = ["powder", "capsule", "liquid", "other"];

const SUPPLEMENT_UNITS: SupplementUnit[] = [
  "g",
  "mg",
  "mcg",
  "iu",
  "scoop",
  "capsule",
  "drop",
];

const SUPPLEMENT_PHASE_KINDS: SupplementPhaseKind[] = ["loading", "maintenance", "custom"];

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
  person_ids?: string[] | null;
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
  interviews: unknown;
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
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplementProtocolRow = {
  id: string;
  user_id: string;
  name: string;
  form: string | null;
  unit: string;
  notes: string | null;
  active: boolean;
  phases: unknown;
  created_at: string;
  updated_at: string;
};

export type SupplementIntakeLogRow = {
  id: string;
  user_id: string;
  protocol_id: string;
  intake_date: string;
  doses: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  difficulty: string;
  experience_level: string;
  estimated_minutes: number | null;
  servings: number | null;
  notes: string | null;
  ingredients: unknown;
  steps: unknown;
  equipment: unknown;
  hero_image: unknown | null;
  gallery: unknown;
  source: string;
  catalog_recipe_id: string | null;
  cooking_method?: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogRecipeRow = {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  experience_level: string;
  estimated_minutes: number | null;
  servings: number | null;
  notes: string | null;
  ingredients: unknown;
  steps: unknown;
  equipment: unknown;
  hero_image: unknown | null;
  gallery: unknown;
  cooking_method?: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type CookingSessionRow = {
  id: string;
  user_id: string;
  recipe_id: string | null;
  recipe_title: string;
  status: string;
  cook_date: string;
  started_at: string | null;
  finished_at: string | null;
  duration_minutes: number | null;
  servings_made: number | null;
  notes: string | null;
  current_step_index: number | null;
  timers: unknown;
  created_at: string;
  updated_at: string;
};

export type IngredientRow = {
  id: string;
  canonical_name: string;
  category: string | null;
  default_unit: string | null;
  density_g_per_ml: number | string | null;
  grams_per_piece: number | string | null;
  fdc_id: number | null;
  created_at: string;
  updated_at: string;
};

export type IngredientAliasRow = {
  id: string;
  ingredient_id: string;
  alias: string;
  alias_normalized: string;
  created_at: string;
};

export type PantryItemRow = {
  id: string;
  user_id: string;
  ingredient_id: string | null;
  custom_ingredient_id: string | null;
  label: string;
  available: boolean;
  quantity: number | string | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomIngredientRow = {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  default_unit: string | null;
  density_g_per_ml: number | string | null;
  grams_per_piece: number | string | null;
  per_100g: unknown | null;
  created_at: string;
  updated_at: string;
};

export type IngredientNutrientsRow = {
  id: string;
  ingredient_id: string;
  source: string;
  fdc_id: number | null;
  per_100g: unknown;
  fetched_at: string;
};

export type RetentionFactorRow = {
  id: string;
  cooking_method: string;
  nutrient_key: string;
  factor: number | string;
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

function resolveEventType(value: string): EventType | undefined {
  const normalized = LEGACY_EVENT_TYPE_ALIASES[value] ?? value;
  return isEventType(normalized) ? normalized : undefined;
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
  if (event.personIds !== undefined) {
    if (!Array.isArray(event.personIds)) {
      throw new MapperError("Invalid event.personIds", "event.personIds");
    }
    for (const personId of event.personIds) {
      assertUuid(personId, "event.personIds");
    }
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

function isInterviewStage(value: string): value is NonNullable<ApplicationInterview["stage"]> {
  return (INTERVIEW_STAGES as string[]).includes(value);
}

function isInterviewFormat(value: string): value is InterviewFormat {
  return (INTERVIEW_FORMATS as string[]).includes(value);
}

function isInterviewOutcome(value: string): value is InterviewOutcome {
  return (INTERVIEW_OUTCOMES as string[]).includes(value);
}

export function parseApplicationInterviews(
  value: unknown,
  field: string
): ApplicationInterview[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const interviews: ApplicationInterview[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string") {
      throw new MapperError(`Invalid ${field}.id`, `${field}.id`);
    }
    assertUuid(raw.id, `${field}.id`);
    if (seenIds.has(raw.id)) {
      throw new MapperError(`Duplicate ${field} id`, `${field}.id`);
    }
    seenIds.add(raw.id);

    if (typeof raw.date !== "string") {
      throw new MapperError(`Invalid ${field}.date`, `${field}.date`);
    }
    assertIsoDate(raw.date, `${field}.date`);

    const interview: ApplicationInterview = {
      id: raw.id,
      date: raw.date,
    };

    if (raw.startTime !== undefined && raw.startTime !== null) {
      if (typeof raw.startTime !== "string" || !isHhMm(raw.startTime)) {
        throw new MapperError(`Invalid ${field}.startTime`, `${field}.startTime`);
      }
      interview.startTime = raw.startTime;
    }

    if (raw.endTime !== undefined && raw.endTime !== null) {
      if (typeof raw.endTime !== "string" || !isHhMm(raw.endTime)) {
        throw new MapperError(`Invalid ${field}.endTime`, `${field}.endTime`);
      }
      interview.endTime = raw.endTime;
    }

    if (interview.startTime && interview.endTime) {
      const startMinutes = parseHHMMToMinutes(interview.startTime);
      const endMinutes = parseHHMMToMinutes(interview.endTime);
      if (endMinutes <= startMinutes) {
        throw new MapperError(
          `${field}.endTime must be after startTime`,
          `${field}.endTime`
        );
      }
    }
    if (interview.endTime && !interview.startTime) {
      throw new MapperError(`${field}.endTime requires startTime`, `${field}.endTime`);
    }

    const stageRaw = raw.stage;
    if (stageRaw !== undefined && stageRaw !== null) {
      if (typeof stageRaw !== "string" || !isInterviewStage(stageRaw)) {
        throw new MapperError(`Invalid ${field}.stage`, `${field}.stage`);
      }
      interview.stage = stageRaw;
    }

    const formatRaw = raw.format;
    if (formatRaw !== undefined && formatRaw !== null) {
      if (typeof formatRaw !== "string" || !isInterviewFormat(formatRaw)) {
        throw new MapperError(`Invalid ${field}.format`, `${field}.format`);
      }
      interview.format = formatRaw;
    }

    const outcomeRaw = raw.outcome;
    if (outcomeRaw !== undefined && outcomeRaw !== null) {
      if (typeof outcomeRaw !== "string" || !isInterviewOutcome(outcomeRaw)) {
        throw new MapperError(`Invalid ${field}.outcome`, `${field}.outcome`);
      }
      interview.outcome = outcomeRaw;
    }

    const notesRaw = raw.notes;
    if (notesRaw !== undefined && notesRaw !== null) {
      if (typeof notesRaw !== "string") {
        throw new MapperError(`Invalid ${field}.notes`, `${field}.notes`);
      }
      const trimmed = notesRaw.trim();
      if (trimmed.length > 0) interview.notes = trimmed;
    }

    interviews.push(interview);
  }

  return interviews;
}

export function assertValidApplicationInterview(
  interview: ApplicationInterview,
  fieldPrefix = "jobApplication.interviews"
): void {
  assertUuid(interview.id, `${fieldPrefix}.id`);
  assertIsoDate(interview.date, `${fieldPrefix}.date`);
  if (interview.startTime !== undefined && !isHhMm(interview.startTime)) {
    throw new MapperError(`Invalid ${fieldPrefix}.startTime`, `${fieldPrefix}.startTime`);
  }
  if (interview.endTime !== undefined && !isHhMm(interview.endTime)) {
    throw new MapperError(`Invalid ${fieldPrefix}.endTime`, `${fieldPrefix}.endTime`);
  }
  if (interview.endTime && !interview.startTime) {
    throw new MapperError(
      `${fieldPrefix}.endTime requires startTime`,
      `${fieldPrefix}.endTime`
    );
  }
  if (interview.startTime && interview.endTime) {
    const startMinutes = parseHHMMToMinutes(interview.startTime);
    const endMinutes = parseHHMMToMinutes(interview.endTime);
    if (endMinutes <= startMinutes) {
      throw new MapperError(
        `${fieldPrefix}.endTime must be after startTime`,
        `${fieldPrefix}.endTime`
      );
    }
  }
  if (interview.stage !== undefined && !isInterviewStage(interview.stage)) {
    throw new MapperError(`Invalid ${fieldPrefix}.stage`, `${fieldPrefix}.stage`);
  }
  if (interview.format !== undefined && !isInterviewFormat(interview.format)) {
    throw new MapperError(`Invalid ${fieldPrefix}.format`, `${fieldPrefix}.format`);
  }
  if (interview.outcome !== undefined && !isInterviewOutcome(interview.outcome)) {
    throw new MapperError(`Invalid ${fieldPrefix}.outcome`, `${fieldPrefix}.outcome`);
  }
  if (interview.notes !== undefined && typeof interview.notes !== "string") {
    throw new MapperError(`Invalid ${fieldPrefix}.notes`, `${fieldPrefix}.notes`);
  }
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
  if (!Array.isArray(app.interviews)) {
    throw new MapperError("Invalid jobApplication.interviews", "jobApplication.interviews");
  }
  const seenInterviewIds = new Set<string>();
  for (const interview of app.interviews) {
    assertValidApplicationInterview(interview);
    if (seenInterviewIds.has(interview.id)) {
      throw new MapperError(
        "Duplicate jobApplication.interviews id",
        "jobApplication.interviews.id"
      );
    }
    seenInterviewIds.add(interview.id);
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

    if (obj.completedAtIso !== undefined && obj.completedAtIso !== null) {
      if (typeof obj.completedAtIso !== "string" || !isIsoTimestamp(obj.completedAtIso)) {
        throw new MapperError(`Invalid ${field}: completedAtIso must be ISO timestamp`, field);
      }
      entry.completedAtIso = obj.completedAtIso;
    }

    if (obj.sourceExerciseId !== undefined && obj.sourceExerciseId !== null) {
      if (typeof obj.sourceExerciseId !== "string" || !isUuid(obj.sourceExerciseId)) {
        throw new MapperError(`Invalid ${field}: sourceExerciseId must be UUID`, field);
      }
      entry.sourceExerciseId = obj.sourceExerciseId;
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
  if (entry.completedAtIso !== undefined && !isIsoTimestamp(entry.completedAtIso)) {
    throw new MapperError(
      "Invalid exerciseEntry.completedAtIso",
      "exerciseEntry.completedAtIso"
    );
  }
  if (entry.sourceExerciseId !== undefined && !isUuid(entry.sourceExerciseId)) {
    throw new MapperError(
      "Invalid exerciseEntry.sourceExerciseId",
      "exerciseEntry.sourceExerciseId"
    );
  }
}

/**
 * Strips session-only fields (completion + source linkage) from exercises so
 * plan templates never persist live-logging state.
 */
export function stripExerciseSessionFields(entries: ExerciseEntry[]): ExerciseEntry[] {
  return entries.map((entry) => {
    const next = { ...entry };
    delete next.completedAtIso;
    delete next.sourceExerciseId;
    return next;
  });
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
  if (session.startedAtIso !== undefined) {
    assertIsoTimestamp(session.startedAtIso, "workoutSession.startedAtIso");
  }
  if (session.completedAtIso !== undefined) {
    assertIsoTimestamp(session.completedAtIso, "workoutSession.completedAtIso");
  }
}

export function isFitnessType(value: string): value is FitnessType {
  return FITNESS_TYPES.includes(value as FitnessType);
}

export function isSupplementForm(value: string): value is SupplementForm {
  return SUPPLEMENT_FORMS.includes(value as SupplementForm);
}

export function isSupplementUnit(value: string): value is SupplementUnit {
  return SUPPLEMENT_UNITS.includes(value as SupplementUnit);
}

export function isSupplementPhaseKind(value: string): value is SupplementPhaseKind {
  return SUPPLEMENT_PHASE_KINDS.includes(value as SupplementPhaseKind);
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.includes(value as Weekday);
}

function parseWeekdayList(value: unknown, field: string): Weekday[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  if (value.length === 0) {
    throw new MapperError(`Invalid ${field}: must not be empty`, field);
  }
  const seen = new Set<Weekday>();
  const weekdays: Weekday[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isWeekday(item)) {
      throw new MapperError(`Invalid ${field}: expected weekday`, field);
    }
    if (seen.has(item)) continue;
    seen.add(item);
    weekdays.push(item);
  }
  return weekdays;
}

function parseTimeList(value: unknown, expectedLength: number, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  if (value.length !== expectedLength) {
    throw new MapperError(
      `Invalid ${field}: length must equal dosesPerDay`,
      field
    );
  }
  const times: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isHhMm(item)) {
      throw new MapperError(`Invalid ${field}: expected HH:MM`, field);
    }
    times.push(item);
  }
  return times;
}

export function parseSupplementPhases(value: unknown, field: string): SupplementPhase[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  if (value.length === 0) {
    throw new MapperError(`${field} must not be empty`, field);
  }

  const phases: SupplementPhase[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (!isPlainObject(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const phaseId = item.id;
    if (typeof phaseId !== "string" || !isUuid(phaseId)) {
      throw new MapperError(`Invalid ${field}: expected UUID id`, field);
    }
    if (seenIds.has(phaseId)) {
      throw new MapperError(`Invalid ${field}: duplicate phase id`, field);
    }
    seenIds.add(phaseId);

    const kind = item.kind;
    if (typeof kind !== "string" || !isSupplementPhaseKind(kind)) {
      throw new MapperError(`Invalid ${field}: invalid kind`, field);
    }

    const startDate = item.startDate;
    if (typeof startDate !== "string" || !isIsoDate(startDate)) {
      throw new MapperError(`Invalid ${field}: invalid startDate`, field);
    }

    const dosesPerDay = item.dosesPerDay;
    if (
      typeof dosesPerDay !== "number" ||
      !Number.isInteger(dosesPerDay) ||
      dosesPerDay < 1 ||
      dosesPerDay > 6
    ) {
      throw new MapperError(`Invalid ${field}: dosesPerDay must be 1–6`, field);
    }

    const amountPerDose = item.amountPerDose;
    if (typeof amountPerDose !== "number" || !isPositiveFiniteNumber(amountPerDose)) {
      throw new MapperError(`Invalid ${field}: amountPerDose must be positive`, field);
    }

    const phase: SupplementPhase = {
      id: phaseId,
      kind,
      startDate,
      dosesPerDay,
      amountPerDose,
    };

    if (item.name !== undefined && item.name !== null) {
      if (typeof item.name !== "string") {
        throw new MapperError(`Invalid ${field}: name must be string`, field);
      }
      const trimmed = item.name.trim();
      if (trimmed.length > 0) phase.name = trimmed;
    }

    if (item.endDate !== undefined && item.endDate !== null) {
      if (typeof item.endDate !== "string" || !isIsoDate(item.endDate)) {
        throw new MapperError(`Invalid ${field}: invalid endDate`, field);
      }
      if (item.endDate < startDate) {
        throw new MapperError(`Invalid ${field}: endDate before startDate`, field);
      }
      phase.endDate = item.endDate;
    }

    if (item.times !== undefined && item.times !== null) {
      phase.times = parseTimeList(item.times, dosesPerDay, `${field}.times`);
    }

    if (item.weekdays !== undefined && item.weekdays !== null) {
      phase.weekdays = parseWeekdayList(item.weekdays, `${field}.weekdays`);
    }

    phases.push(phase);
  }

  return phases;
}

export function parseSupplementDoseSlots(value: unknown, field: string): SupplementDoseSlot[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  if (value.length === 0) {
    throw new MapperError(`${field} must not be empty`, field);
  }

  const slots: SupplementDoseSlot[] = [];
  const seenIds = new Set<string>();
  const seenIndexes = new Set<number>();

  for (const item of value) {
    if (!isPlainObject(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const slotId = item.id;
    if (typeof slotId !== "string" || !isUuid(slotId)) {
      throw new MapperError(`Invalid ${field}: expected UUID id`, field);
    }
    if (seenIds.has(slotId)) {
      throw new MapperError(`Invalid ${field}: duplicate dose id`, field);
    }
    seenIds.add(slotId);

    const slotIndex = item.slotIndex;
    if (typeof slotIndex !== "number" || !isNonNegativeInteger(slotIndex)) {
      throw new MapperError(`Invalid ${field}: slotIndex must be non-negative integer`, field);
    }
    if (seenIndexes.has(slotIndex)) {
      throw new MapperError(`Invalid ${field}: duplicate slotIndex`, field);
    }
    seenIndexes.add(slotIndex);

    const amount = item.amount;
    if (typeof amount !== "number" || !isPositiveFiniteNumber(amount)) {
      throw new MapperError(`Invalid ${field}: amount must be positive`, field);
    }

    const slot: SupplementDoseSlot = {
      id: slotId,
      slotIndex,
      amount,
    };

    if (item.plannedTime !== undefined && item.plannedTime !== null) {
      if (typeof item.plannedTime !== "string" || !isHhMm(item.plannedTime)) {
        throw new MapperError(`Invalid ${field}: plannedTime must be HH:MM`, field);
      }
      slot.plannedTime = item.plannedTime;
    }

    if (item.takenAtIso !== undefined && item.takenAtIso !== null) {
      if (typeof item.takenAtIso !== "string" || !isIsoTimestamp(item.takenAtIso)) {
        throw new MapperError(`Invalid ${field}: takenAtIso must be ISO timestamp`, field);
      }
      slot.takenAtIso = item.takenAtIso;
    }

    slots.push(slot);
  }

  return slots;
}

export function assertValidSupplementProtocol(protocol: SupplementProtocol): void {
  assertUuid(protocol.id, "supplementProtocol.id");
  assertNonEmptyName(protocol.name, "supplementProtocol.name");
  assertIsoTimestamp(protocol.createdAtIso, "supplementProtocol.createdAtIso");
  assertIsoTimestamp(protocol.updatedAtIso, "supplementProtocol.updatedAtIso");

  if (typeof protocol.active !== "boolean") {
    throw new MapperError("Invalid supplementProtocol.active", "supplementProtocol.active");
  }
  if (!isSupplementUnit(protocol.unit)) {
    throw new MapperError("Invalid supplementProtocol.unit", "supplementProtocol.unit");
  }
  if (protocol.form !== undefined && !isSupplementForm(protocol.form)) {
    throw new MapperError("Invalid supplementProtocol.form", "supplementProtocol.form");
  }
  if (protocol.notes !== undefined && typeof protocol.notes !== "string") {
    throw new MapperError("Invalid supplementProtocol.notes", "supplementProtocol.notes");
  }
  parseSupplementPhases(protocol.phases, "supplementProtocol.phases");
}

export function assertValidSupplementIntakeLog(log: SupplementIntakeLog): void {
  assertUuid(log.id, "supplementIntakeLog.id");
  assertUuid(log.protocolId, "supplementIntakeLog.protocolId");
  assertIsoDate(log.date, "supplementIntakeLog.date");
  assertIsoTimestamp(log.createdAtIso, "supplementIntakeLog.createdAtIso");
  assertIsoTimestamp(log.updatedAtIso, "supplementIntakeLog.updatedAtIso");
  if (log.notes !== undefined && typeof log.notes !== "string") {
    throw new MapperError("Invalid supplementIntakeLog.notes", "supplementIntakeLog.notes");
  }
  parseSupplementDoseSlots(log.doses, "supplementIntakeLog.doses");
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
    person_id: eventPersonIds(event)[0] ?? null,
    person_ids: eventPersonIds(event),
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

  const eventType = resolveEventType(row.type);
  if (eventType === undefined) {
    throw new MapperError("Invalid events.type", "events.type");
  }
  if (typeof row.reminder !== "boolean") {
    throw new MapperError("Invalid events.reminder", "events.reminder");
  }

  const event: LifeEvent = {
    id: row.id,
    title: row.title.trim(),
    date: row.date,
    type: eventType,
    reminder: row.reminder,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.person_name !== null && row.person_name.trim().length > 0) {
    event.personName = row.person_name.trim();
  }
  const linkedPeople = linkedPeopleFields(parseEventPersonIds(row));
  if (linkedPeople.personId) event.personId = linkedPeople.personId;
  if (linkedPeople.personIds) event.personIds = linkedPeople.personIds;
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

function parseEventPersonIds(row: EventRow): string[] {
  if (row.person_ids != null) {
    const ids = parseRequiredSkillIds(row.person_ids, "events.person_ids");
    if (ids.length > 0) return ids;
  }
  if (row.person_id !== null && row.person_id !== undefined) {
    assertUuid(row.person_id, "events.person_id");
    return [row.person_id];
  }
  return [];
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
    interviews: app.interviews.map((interview) => ({
      id: interview.id,
      date: interview.date,
      ...(interview.startTime ? { startTime: interview.startTime } : {}),
      ...(interview.endTime ? { endTime: interview.endTime } : {}),
      ...(interview.stage ? { stage: interview.stage } : {}),
      ...(interview.format ? { format: interview.format } : {}),
      ...(interview.outcome ? { outcome: interview.outcome } : {}),
      ...(interview.notes ? { notes: interview.notes } : {}),
    })),
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
  const interviews = parseApplicationInterviews(
    row.interviews,
    "job_applications.interviews"
  );

  const app: JobApplication = {
    id: row.id,
    company: row.company.trim(),
    roleTitle: row.role_title.trim(),
    status: row.status,
    requiredSkillIds,
    interviews,
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
    exercises: stripExerciseSessionFields(plan.exercises),
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
    started_at: session.startedAtIso ?? null,
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
  if (row.started_at !== null) {
    assertIsoTimestamp(row.started_at, "workout_sessions.started_at");
    session.startedAtIso = row.started_at;
  }
  if (row.completed_at !== null) {
    assertIsoTimestamp(row.completed_at, "workout_sessions.completed_at");
    session.completedAtIso = row.completed_at;
  }

  return session;
}

export function supplementProtocolToRow(
  protocol: SupplementProtocol,
  userId: string
): SupplementProtocolRow {
  assertUuid(userId, "userId");
  assertValidSupplementProtocol(protocol);

  return {
    id: protocol.id,
    user_id: userId,
    name: protocol.name.trim(),
    form: protocol.form ?? null,
    unit: protocol.unit,
    notes: protocol.notes?.trim() || null,
    active: protocol.active,
    phases: parseSupplementPhases(protocol.phases, "supplementProtocol.phases"),
    created_at: protocol.createdAtIso,
    updated_at: protocol.updatedAtIso,
  };
}

export function supplementProtocolFromRow(row: SupplementProtocolRow): SupplementProtocol {
  assertUuid(row.id, "supplement_protocols.id");
  assertUuid(row.user_id, "supplement_protocols.user_id");
  assertNonEmptyName(row.name, "supplement_protocols.name");
  assertIsoTimestamp(row.created_at, "supplement_protocols.created_at");
  assertIsoTimestamp(row.updated_at, "supplement_protocols.updated_at");

  if (typeof row.active !== "boolean") {
    throw new MapperError("Invalid supplement_protocols.active", "supplement_protocols.active");
  }
  if (!isSupplementUnit(row.unit)) {
    throw new MapperError("Invalid supplement_protocols.unit", "supplement_protocols.unit");
  }
  if (row.form !== null && !isSupplementForm(row.form)) {
    throw new MapperError("Invalid supplement_protocols.form", "supplement_protocols.form");
  }

  const phases = parseSupplementPhases(row.phases, "supplement_protocols.phases");

  const protocol: SupplementProtocol = {
    id: row.id,
    name: row.name.trim(),
    unit: row.unit,
    active: row.active,
    phases,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.form !== null) protocol.form = row.form;
  if (row.notes !== null && row.notes.trim().length > 0) {
    protocol.notes = row.notes.trim();
  }

  return protocol;
}

export function supplementIntakeLogToRow(
  log: SupplementIntakeLog,
  userId: string
): SupplementIntakeLogRow {
  assertUuid(userId, "userId");
  assertValidSupplementIntakeLog(log);

  return {
    id: log.id,
    user_id: userId,
    protocol_id: log.protocolId,
    intake_date: log.date,
    doses: parseSupplementDoseSlots(log.doses, "supplementIntakeLog.doses"),
    notes: log.notes?.trim() || null,
    created_at: log.createdAtIso,
    updated_at: log.updatedAtIso,
  };
}

export function supplementIntakeLogFromRow(row: SupplementIntakeLogRow): SupplementIntakeLog {
  assertUuid(row.id, "supplement_intake_logs.id");
  assertUuid(row.user_id, "supplement_intake_logs.user_id");
  assertUuid(row.protocol_id, "supplement_intake_logs.protocol_id");
  assertIsoDate(row.intake_date, "supplement_intake_logs.intake_date");
  assertIsoTimestamp(row.created_at, "supplement_intake_logs.created_at");
  assertIsoTimestamp(row.updated_at, "supplement_intake_logs.updated_at");

  const doses = parseSupplementDoseSlots(row.doses, "supplement_intake_logs.doses");

  const log: SupplementIntakeLog = {
    id: row.id,
    protocolId: row.protocol_id,
    date: row.intake_date,
    doses,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.notes !== null && row.notes.trim().length > 0) {
    log.notes = row.notes.trim();
  }

  return log;
}

const DEFAULT_RECIPE_STEP_KIND: RecipeStepKind = "blocking";

export function parseSanityImageRef(value: unknown, field: string): SanityImageRef {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.assetRef !== "string" || obj.assetRef.trim().length === 0) {
    throw new MapperError(`Invalid ${field}: assetRef required`, field);
  }
  if (typeof obj.url !== "string" || obj.url.trim().length === 0) {
    throw new MapperError(`Invalid ${field}: url required`, field);
  }

  const ref: SanityImageRef = {
    assetRef: obj.assetRef.trim(),
    url: obj.url.trim(),
  };

  if (obj.lqip !== undefined && obj.lqip !== null) {
    if (typeof obj.lqip !== "string") {
      throw new MapperError(`Invalid ${field}: lqip must be string`, field);
    }
    const lqip = obj.lqip.trim();
    if (lqip) ref.lqip = lqip;
  }
  if (obj.width !== undefined && obj.width !== null) {
    if (typeof obj.width !== "number" || !isPositiveInteger(obj.width)) {
      throw new MapperError(`Invalid ${field}: width must be positive integer`, field);
    }
    ref.width = obj.width;
  }
  if (obj.height !== undefined && obj.height !== null) {
    if (typeof obj.height !== "number" || !isPositiveInteger(obj.height)) {
      throw new MapperError(`Invalid ${field}: height must be positive integer`, field);
    }
    ref.height = obj.height;
  }
  if (obj.alt !== undefined && obj.alt !== null) {
    if (typeof obj.alt !== "string") {
      throw new MapperError(`Invalid ${field}: alt must be string`, field);
    }
    const alt = obj.alt.trim();
    if (alt) ref.alt = alt;
  }

  return ref;
}

export function parseSanityImageRefList(value: unknown, field: string): SanityImageRef[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  return value.map((item, index) => parseSanityImageRef(item, `${field}[${index}]`));
}

export function parseRecipeIngredients(value: unknown, field: string): RecipeIngredientLine[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const lines: RecipeIngredientLine[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const obj = item as Record<string, unknown>;
    const lineId = obj.id;
    if (typeof lineId !== "string" || !isUuid(lineId)) {
      throw new MapperError(`Invalid ${field}: expected UUID id`, field);
    }
    if (seenIds.has(lineId)) {
      throw new MapperError(`Invalid ${field}: duplicate ingredient id`, field);
    }
    seenIds.add(lineId);

    if (typeof obj.rawText !== "string" || obj.rawText.trim().length === 0) {
      throw new MapperError(`Invalid ${field}: rawText required`, field);
    }

    const line: RecipeIngredientLine = {
      id: lineId,
      rawText: obj.rawText.trim(),
    };

    if (obj.quantity !== undefined && obj.quantity !== null) {
      if (typeof obj.quantity !== "number" || !Number.isFinite(obj.quantity) || obj.quantity < 0) {
        throw new MapperError(`Invalid ${field}: quantity must be a non-negative number`, field);
      }
      line.quantity = obj.quantity;
    }
    if (obj.unit !== undefined && obj.unit !== null) {
      if (typeof obj.unit !== "string") {
        throw new MapperError(`Invalid ${field}: unit must be string`, field);
      }
      const unit = obj.unit.trim();
      if (unit) line.unit = unit;
    }
    if (obj.ingredientId !== undefined && obj.ingredientId !== null) {
      if (typeof obj.ingredientId !== "string" || !isUuid(obj.ingredientId)) {
        throw new MapperError(`Invalid ${field}: ingredientId must be UUID`, field);
      }
      line.ingredientId = obj.ingredientId;
    }
    if (obj.customIngredientId !== undefined && obj.customIngredientId !== null) {
      if (typeof obj.customIngredientId !== "string" || !isUuid(obj.customIngredientId)) {
        throw new MapperError(`Invalid ${field}: customIngredientId must be UUID`, field);
      }
      line.customIngredientId = obj.customIngredientId;
    }
    if (obj.matchConfidence !== undefined && obj.matchConfidence !== null) {
      if (
        typeof obj.matchConfidence !== "number" ||
        !Number.isFinite(obj.matchConfidence) ||
        obj.matchConfidence < 0 ||
        obj.matchConfidence > 1
      ) {
        throw new MapperError(`Invalid ${field}: matchConfidence must be 0..1`, field);
      }
      line.matchConfidence = obj.matchConfidence;
    }
    if (obj.optional !== undefined && obj.optional !== null) {
      if (typeof obj.optional !== "boolean") {
        throw new MapperError(`Invalid ${field}: optional must be boolean`, field);
      }
      if (obj.optional) line.optional = true;
    }

    lines.push(line);
  }

  return lines;
}

export function parseRecipeSteps(value: unknown, field: string): RecipeStep[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const steps: RecipeStep[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }

    const obj = item as Record<string, unknown>;
    const stepId = obj.id;
    if (typeof stepId !== "string" || !isUuid(stepId)) {
      throw new MapperError(`Invalid ${field}: expected UUID id`, field);
    }
    if (seenIds.has(stepId)) {
      throw new MapperError(`Invalid ${field}: duplicate step id`, field);
    }
    seenIds.add(stepId);

    if (typeof obj.order !== "number" || !Number.isInteger(obj.order) || obj.order < 0) {
      throw new MapperError(`Invalid ${field}: order must be a non-negative integer`, field);
    }
    if (typeof obj.text !== "string" || obj.text.trim().length === 0) {
      throw new MapperError(`Invalid ${field}: step text required`, field);
    }

    let kind: RecipeStepKind = DEFAULT_RECIPE_STEP_KIND;
    if (obj.kind !== undefined && obj.kind !== null) {
      if (typeof obj.kind !== "string" || !isRecipeStepKind(obj.kind)) {
        throw new MapperError(`Invalid ${field}: invalid step kind`, field);
      }
      kind = obj.kind;
    }

    let blocksProgress = true;
    if (obj.blocksProgress !== undefined && obj.blocksProgress !== null) {
      if (typeof obj.blocksProgress !== "boolean") {
        throw new MapperError(`Invalid ${field}: blocksProgress must be boolean`, field);
      }
      blocksProgress = obj.blocksProgress;
    }

    const step: RecipeStep = {
      id: stepId,
      order: obj.order,
      text: obj.text.trim(),
      kind,
      blocksProgress,
    };

    if (obj.timerSeconds !== undefined && obj.timerSeconds !== null) {
      if (typeof obj.timerSeconds !== "number" || !isPositiveInteger(obj.timerSeconds)) {
        throw new MapperError(`Invalid ${field}: timerSeconds must be positive integer`, field);
      }
      step.timerSeconds = obj.timerSeconds;
    }
    if (obj.timerLabel !== undefined && obj.timerLabel !== null) {
      if (typeof obj.timerLabel !== "string") {
        throw new MapperError(`Invalid ${field}: timerLabel must be string`, field);
      }
      const timerLabel = obj.timerLabel.trim();
      if (timerLabel) step.timerLabel = timerLabel;
    }
    if (obj.canRunInBackground !== undefined && obj.canRunInBackground !== null) {
      if (typeof obj.canRunInBackground !== "boolean") {
        throw new MapperError(`Invalid ${field}: canRunInBackground must be boolean`, field);
      }
      if (obj.canRunInBackground) step.canRunInBackground = true;
    }

    steps.push(step);
  }

  return steps;
}

export function parseEquipmentList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      throw new MapperError(`Invalid ${field}: expected strings`, field);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      throw new MapperError(`Invalid ${field}: equipment names must be non-empty`, field);
    }
    items.push(trimmed);
  }
  return items;
}

export function assertValidRecipe(recipe: Recipe): void {
  assertUuid(recipe.id, "recipe.id");
  assertNonEmptyName(recipe.title, "recipe.title");
  assertIsoTimestamp(recipe.createdAtIso, "recipe.createdAtIso");
  assertIsoTimestamp(recipe.updatedAtIso, "recipe.updatedAtIso");

  if (!isRecipeCategory(recipe.category)) {
    throw new MapperError("Invalid recipe.category", "recipe.category");
  }
  if (!isRecipeDifficulty(recipe.difficulty)) {
    throw new MapperError("Invalid recipe.difficulty", "recipe.difficulty");
  }
  if (!isRecipeExperienceLevel(recipe.experienceLevel)) {
    throw new MapperError("Invalid recipe.experienceLevel", "recipe.experienceLevel");
  }
  if (!isRecipeSource(recipe.source)) {
    throw new MapperError("Invalid recipe.source", "recipe.source");
  }
  if (
    recipe.estimatedMinutes !== undefined &&
    !isPositiveInteger(recipe.estimatedMinutes)
  ) {
    throw new MapperError("Invalid recipe.estimatedMinutes", "recipe.estimatedMinutes");
  }
  if (recipe.servings !== undefined && !isPositiveInteger(recipe.servings)) {
    throw new MapperError("Invalid recipe.servings", "recipe.servings");
  }
  if (recipe.notes !== undefined && typeof recipe.notes !== "string") {
    throw new MapperError("Invalid recipe.notes", "recipe.notes");
  }
  if (recipe.catalogRecipeId !== undefined) {
    assertUuid(recipe.catalogRecipeId, "recipe.catalogRecipeId");
  }
  if (recipe.cookingMethod !== undefined && !isCookingMethod(recipe.cookingMethod)) {
    throw new MapperError("Invalid recipe.cookingMethod", "recipe.cookingMethod");
  }
  if (recipe.heroImage !== undefined) {
    parseSanityImageRef(recipe.heroImage, "recipe.heroImage");
  }

  parseRecipeIngredients(recipe.ingredients, "recipe.ingredients");
  parseRecipeSteps(recipe.steps, "recipe.steps");
  parseEquipmentList(recipe.equipment, "recipe.equipment");
  parseSanityImageRefList(recipe.gallery, "recipe.gallery");

  if (recipe.ingredients.length === 0) {
    throw new MapperError("recipe.ingredients must not be empty", "recipe.ingredients");
  }
  if (recipe.steps.length === 0) {
    throw new MapperError("recipe.steps must not be empty", "recipe.steps");
  }
}

export function recipeToRow(recipe: Recipe, userId: string): RecipeRow {
  assertUuid(userId, "userId");
  assertValidRecipe(recipe);

  return {
    id: recipe.id,
    user_id: userId,
    title: recipe.title.trim(),
    category: recipe.category,
    difficulty: recipe.difficulty,
    experience_level: recipe.experienceLevel,
    estimated_minutes: recipe.estimatedMinutes ?? null,
    servings: recipe.servings ?? null,
    notes: recipe.notes?.trim() || null,
    ingredients: parseRecipeIngredients(recipe.ingredients, "recipe.ingredients"),
    steps: parseRecipeSteps(recipe.steps, "recipe.steps"),
    equipment: parseEquipmentList(recipe.equipment, "recipe.equipment"),
    hero_image: recipe.heroImage
      ? parseSanityImageRef(recipe.heroImage, "recipe.heroImage")
      : null,
    gallery: parseSanityImageRefList(recipe.gallery, "recipe.gallery"),
    source: recipe.source,
    catalog_recipe_id: recipe.catalogRecipeId ?? null,
    cooking_method: recipe.cookingMethod ?? null,
    created_at: recipe.createdAtIso,
    updated_at: recipe.updatedAtIso,
  };
}

export function recipeFromRow(row: RecipeRow): Recipe {
  assertUuid(row.id, "recipes.id");
  assertUuid(row.user_id, "recipes.user_id");
  assertNonEmptyName(row.title, "recipes.title");
  assertIsoTimestamp(row.created_at, "recipes.created_at");
  assertIsoTimestamp(row.updated_at, "recipes.updated_at");

  if (!isRecipeCategory(row.category)) {
    throw new MapperError("Invalid recipes.category", "recipes.category");
  }
  if (!isRecipeDifficulty(row.difficulty)) {
    throw new MapperError("Invalid recipes.difficulty", "recipes.difficulty");
  }
  if (!isRecipeExperienceLevel(row.experience_level)) {
    throw new MapperError("Invalid recipes.experience_level", "recipes.experience_level");
  }
  if (!isRecipeSource(row.source)) {
    throw new MapperError("Invalid recipes.source", "recipes.source");
  }
  if (row.estimated_minutes !== null && !isPositiveInteger(row.estimated_minutes)) {
    throw new MapperError("Invalid recipes.estimated_minutes", "recipes.estimated_minutes");
  }
  if (row.servings !== null && !isPositiveInteger(row.servings)) {
    throw new MapperError("Invalid recipes.servings", "recipes.servings");
  }
  if (row.catalog_recipe_id !== null) {
    assertUuid(row.catalog_recipe_id, "recipes.catalog_recipe_id");
  }
  if (row.cooking_method !== null && row.cooking_method !== undefined && !isCookingMethod(row.cooking_method)) {
    throw new MapperError("Invalid recipes.cooking_method", "recipes.cooking_method");
  }

  const ingredients = parseRecipeIngredients(row.ingredients, "recipes.ingredients");
  const steps = parseRecipeSteps(row.steps, "recipes.steps");
  const equipment = parseEquipmentList(row.equipment, "recipes.equipment");
  const gallery = parseSanityImageRefList(row.gallery ?? [], "recipes.gallery");

  if (ingredients.length === 0) {
    throw new MapperError("recipes.ingredients must not be empty", "recipes.ingredients");
  }
  if (steps.length === 0) {
    throw new MapperError("recipes.steps must not be empty", "recipes.steps");
  }

  const recipe: Recipe = {
    id: row.id,
    title: row.title.trim(),
    category: row.category,
    difficulty: row.difficulty,
    experienceLevel: row.experience_level,
    ingredients,
    steps,
    equipment,
    gallery,
    source: row.source,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.estimated_minutes !== null) recipe.estimatedMinutes = row.estimated_minutes;
  if (row.servings !== null) recipe.servings = row.servings;
  if (row.notes !== null && row.notes.trim().length > 0) {
    recipe.notes = row.notes.trim();
  }
  if (row.hero_image !== null && row.hero_image !== undefined) {
    recipe.heroImage = parseSanityImageRef(row.hero_image, "recipes.hero_image");
  }
  if (row.catalog_recipe_id !== null) {
    recipe.catalogRecipeId = row.catalog_recipe_id;
  }
  if (row.cooking_method !== null && row.cooking_method !== undefined && isCookingMethod(row.cooking_method)) {
    recipe.cookingMethod = row.cooking_method;
  }

  return recipe;
}

export function assertValidCatalogRecipe(recipe: CatalogRecipe): void {
  assertUuid(recipe.id, "catalogRecipe.id");
  assertNonEmptyName(recipe.title, "catalogRecipe.title");
  assertIsoTimestamp(recipe.createdAtIso, "catalogRecipe.createdAtIso");
  assertIsoTimestamp(recipe.updatedAtIso, "catalogRecipe.updatedAtIso");

  if (!isRecipeCategory(recipe.category)) {
    throw new MapperError("Invalid catalogRecipe.category", "catalogRecipe.category");
  }
  if (!isRecipeDifficulty(recipe.difficulty)) {
    throw new MapperError("Invalid catalogRecipe.difficulty", "catalogRecipe.difficulty");
  }
  if (!isRecipeExperienceLevel(recipe.experienceLevel)) {
    throw new MapperError("Invalid catalogRecipe.experienceLevel", "catalogRecipe.experienceLevel");
  }
  if (typeof recipe.isPublished !== "boolean") {
    throw new MapperError("Invalid catalogRecipe.isPublished", "catalogRecipe.isPublished");
  }
  if (
    recipe.estimatedMinutes !== undefined &&
    !isPositiveInteger(recipe.estimatedMinutes)
  ) {
    throw new MapperError("Invalid catalogRecipe.estimatedMinutes", "catalogRecipe.estimatedMinutes");
  }
  if (recipe.servings !== undefined && !isPositiveInteger(recipe.servings)) {
    throw new MapperError("Invalid catalogRecipe.servings", "catalogRecipe.servings");
  }
  if (recipe.notes !== undefined && typeof recipe.notes !== "string") {
    throw new MapperError("Invalid catalogRecipe.notes", "catalogRecipe.notes");
  }
  if (recipe.cookingMethod !== undefined && !isCookingMethod(recipe.cookingMethod)) {
    throw new MapperError("Invalid catalogRecipe.cookingMethod", "catalogRecipe.cookingMethod");
  }
  if (recipe.heroImage !== undefined) {
    parseSanityImageRef(recipe.heroImage, "catalogRecipe.heroImage");
  }

  parseRecipeIngredients(recipe.ingredients, "catalogRecipe.ingredients");
  parseRecipeSteps(recipe.steps, "catalogRecipe.steps");
  parseEquipmentList(recipe.equipment, "catalogRecipe.equipment");
  parseSanityImageRefList(recipe.gallery, "catalogRecipe.gallery");

  if (recipe.ingredients.length === 0) {
    throw new MapperError("catalogRecipe.ingredients must not be empty", "catalogRecipe.ingredients");
  }
  if (recipe.steps.length === 0) {
    throw new MapperError("catalogRecipe.steps must not be empty", "catalogRecipe.steps");
  }
}

export function catalogRecipeToRow(recipe: CatalogRecipe): CatalogRecipeRow {
  assertValidCatalogRecipe(recipe);

  return {
    id: recipe.id,
    title: recipe.title.trim(),
    category: recipe.category,
    difficulty: recipe.difficulty,
    experience_level: recipe.experienceLevel,
    estimated_minutes: recipe.estimatedMinutes ?? null,
    servings: recipe.servings ?? null,
    notes: recipe.notes?.trim() || null,
    ingredients: parseRecipeIngredients(recipe.ingredients, "catalogRecipe.ingredients"),
    steps: parseRecipeSteps(recipe.steps, "catalogRecipe.steps"),
    equipment: parseEquipmentList(recipe.equipment, "catalogRecipe.equipment"),
    hero_image: recipe.heroImage
      ? parseSanityImageRef(recipe.heroImage, "catalogRecipe.heroImage")
      : null,
    gallery: parseSanityImageRefList(recipe.gallery, "catalogRecipe.gallery"),
    cooking_method: recipe.cookingMethod ?? null,
    is_published: recipe.isPublished,
    created_at: recipe.createdAtIso,
    updated_at: recipe.updatedAtIso,
  };
}

export function catalogRecipeFromRow(row: CatalogRecipeRow): CatalogRecipe {
  assertUuid(row.id, "recipe_catalog.id");
  assertNonEmptyName(row.title, "recipe_catalog.title");
  assertIsoTimestamp(row.created_at, "recipe_catalog.created_at");
  assertIsoTimestamp(row.updated_at, "recipe_catalog.updated_at");

  if (!isRecipeCategory(row.category)) {
    throw new MapperError("Invalid recipe_catalog.category", "recipe_catalog.category");
  }
  if (!isRecipeDifficulty(row.difficulty)) {
    throw new MapperError("Invalid recipe_catalog.difficulty", "recipe_catalog.difficulty");
  }
  if (!isRecipeExperienceLevel(row.experience_level)) {
    throw new MapperError("Invalid recipe_catalog.experience_level", "recipe_catalog.experience_level");
  }
  if (typeof row.is_published !== "boolean") {
    throw new MapperError("Invalid recipe_catalog.is_published", "recipe_catalog.is_published");
  }
  if (row.estimated_minutes !== null && !isPositiveInteger(row.estimated_minutes)) {
    throw new MapperError("Invalid recipe_catalog.estimated_minutes", "recipe_catalog.estimated_minutes");
  }
  if (row.servings !== null && !isPositiveInteger(row.servings)) {
    throw new MapperError("Invalid recipe_catalog.servings", "recipe_catalog.servings");
  }
  if (row.cooking_method !== null && row.cooking_method !== undefined && !isCookingMethod(row.cooking_method)) {
    throw new MapperError("Invalid recipe_catalog.cooking_method", "recipe_catalog.cooking_method");
  }

  const ingredients = parseRecipeIngredients(row.ingredients, "recipe_catalog.ingredients");
  const steps = parseRecipeSteps(row.steps, "recipe_catalog.steps");
  const equipment = parseEquipmentList(row.equipment, "recipe_catalog.equipment");
  const gallery = parseSanityImageRefList(row.gallery ?? [], "recipe_catalog.gallery");

  if (ingredients.length === 0) {
    throw new MapperError("recipe_catalog.ingredients must not be empty", "recipe_catalog.ingredients");
  }
  if (steps.length === 0) {
    throw new MapperError("recipe_catalog.steps must not be empty", "recipe_catalog.steps");
  }

  const recipe: CatalogRecipe = {
    id: row.id,
    title: row.title.trim(),
    category: row.category,
    difficulty: row.difficulty,
    experienceLevel: row.experience_level,
    ingredients,
    steps,
    equipment,
    gallery,
    isPublished: row.is_published,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.estimated_minutes !== null) recipe.estimatedMinutes = row.estimated_minutes;
  if (row.servings !== null) recipe.servings = row.servings;
  if (row.notes !== null && row.notes.trim().length > 0) {
    recipe.notes = row.notes.trim();
  }
  if (row.hero_image !== null && row.hero_image !== undefined) {
    recipe.heroImage = parseSanityImageRef(row.hero_image, "recipe_catalog.hero_image");
  }
  if (row.cooking_method !== null && row.cooking_method !== undefined && isCookingMethod(row.cooking_method)) {
    recipe.cookingMethod = row.cooking_method;
  }

  return recipe;
}

export function parseCookingTimers(value: unknown, field: string): CookingTimer[] {
  if (!Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }

  const timers: CookingTimer[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new MapperError(`Invalid ${field}: expected objects`, field);
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || !isUuid(obj.id)) {
      throw new MapperError(`Invalid ${field}: id must be UUID`, field);
    }
    if (typeof obj.label !== "string" || obj.label.trim().length === 0) {
      throw new MapperError(`Invalid ${field}: label must be non-empty`, field);
    }
    if (typeof obj.durationSeconds !== "number" || !isPositiveInteger(obj.durationSeconds)) {
      throw new MapperError(`Invalid ${field}: durationSeconds must be a positive integer`, field);
    }
    if (typeof obj.status !== "string" || !isCookingTimerStatus(obj.status)) {
      throw new MapperError(`Invalid ${field}: invalid status`, field);
    }

    const timer: CookingTimer = {
      id: obj.id,
      label: obj.label.trim(),
      durationSeconds: obj.durationSeconds,
      status: obj.status,
    };

    if (obj.stepId !== undefined && obj.stepId !== null) {
      if (typeof obj.stepId !== "string" || !isUuid(obj.stepId)) {
        throw new MapperError(`Invalid ${field}: stepId must be UUID`, field);
      }
      timer.stepId = obj.stepId;
    }
    if (obj.endsAtIso !== undefined && obj.endsAtIso !== null) {
      if (typeof obj.endsAtIso !== "string") {
        throw new MapperError(`Invalid ${field}: endsAtIso must be string`, field);
      }
      assertIsoTimestamp(obj.endsAtIso, `${field}.endsAtIso`);
      timer.endsAtIso = obj.endsAtIso;
    }
    if (obj.remainingSecondsAtPause !== undefined && obj.remainingSecondsAtPause !== null) {
      if (
        typeof obj.remainingSecondsAtPause !== "number" ||
        !isNonNegativeInteger(obj.remainingSecondsAtPause)
      ) {
        throw new MapperError(
          `Invalid ${field}: remainingSecondsAtPause must be a non-negative integer`,
          field
        );
      }
      timer.remainingSecondsAtPause = obj.remainingSecondsAtPause;
    }
    if (obj.startedAtIso !== undefined && obj.startedAtIso !== null) {
      if (typeof obj.startedAtIso !== "string") {
        throw new MapperError(`Invalid ${field}: startedAtIso must be string`, field);
      }
      assertIsoTimestamp(obj.startedAtIso, `${field}.startedAtIso`);
      timer.startedAtIso = obj.startedAtIso;
    }

    timers.push(timer);
  }

  return timers;
}

export function assertValidCookingSession(session: CookingSession): void {
  assertUuid(session.id, "cookingSession.id");
  assertNonEmptyName(session.recipeTitle, "cookingSession.recipeTitle");
  assertIsoDate(session.cookDate, "cookingSession.cookDate");
  assertIsoTimestamp(session.createdAtIso, "cookingSession.createdAtIso");
  assertIsoTimestamp(session.updatedAtIso, "cookingSession.updatedAtIso");

  if (session.recipeId !== null) {
    assertUuid(session.recipeId, "cookingSession.recipeId");
  }
  if (!isPersistedCookingSessionStatus(session.status)) {
    throw new MapperError("Invalid cookingSession.status", "cookingSession.status");
  }
  if (session.startedAtIso !== undefined) {
    assertIsoTimestamp(session.startedAtIso, "cookingSession.startedAtIso");
  }
  if (session.finishedAtIso !== undefined) {
    assertIsoTimestamp(session.finishedAtIso, "cookingSession.finishedAtIso");
  }
  if (session.status === "completed") {
    if (session.startedAtIso === undefined || session.finishedAtIso === undefined) {
      throw new MapperError(
        "Completed cooking sessions require start and finish times",
        "cookingSession.status"
      );
    }
  }
  if (
    session.durationMinutes !== undefined &&
    !isPositiveInteger(session.durationMinutes)
  ) {
    throw new MapperError("Invalid cookingSession.durationMinutes", "cookingSession.durationMinutes");
  }
  if (session.servingsMade !== undefined && !isPositiveInteger(session.servingsMade)) {
    throw new MapperError("Invalid cookingSession.servingsMade", "cookingSession.servingsMade");
  }
  if (session.notes !== undefined && typeof session.notes !== "string") {
    throw new MapperError("Invalid cookingSession.notes", "cookingSession.notes");
  }
  if (
    session.currentStepIndex !== undefined &&
    !isNonNegativeInteger(session.currentStepIndex)
  ) {
    throw new MapperError(
      "Invalid cookingSession.currentStepIndex",
      "cookingSession.currentStepIndex"
    );
  }

  parseCookingTimers(session.timers, "cookingSession.timers");
}

export function cookingSessionToRow(
  session: CookingSession,
  userId: string
): CookingSessionRow {
  assertUuid(userId, "userId");
  assertValidCookingSession(session);

  return {
    id: session.id,
    user_id: userId,
    recipe_id: session.recipeId,
    recipe_title: session.recipeTitle.trim(),
    status: session.status,
    cook_date: session.cookDate,
    started_at: session.startedAtIso ?? null,
    finished_at: session.finishedAtIso ?? null,
    duration_minutes: session.durationMinutes ?? null,
    servings_made: session.servingsMade ?? null,
    notes: session.notes?.trim() || null,
    current_step_index: session.currentStepIndex ?? null,
    timers: parseCookingTimers(session.timers, "cookingSession.timers"),
    created_at: session.createdAtIso,
    updated_at: session.updatedAtIso,
  };
}

export function cookingSessionFromRow(row: CookingSessionRow): CookingSession {
  assertUuid(row.id, "cooking_sessions.id");
  assertUuid(row.user_id, "cooking_sessions.user_id");
  assertNonEmptyName(row.recipe_title, "cooking_sessions.recipe_title");
  assertIsoDate(row.cook_date, "cooking_sessions.cook_date");
  assertIsoTimestamp(row.created_at, "cooking_sessions.created_at");
  assertIsoTimestamp(row.updated_at, "cooking_sessions.updated_at");

  if (row.recipe_id !== null) {
    assertUuid(row.recipe_id, "cooking_sessions.recipe_id");
  }
  if (!isPersistedCookingSessionStatus(row.status)) {
    throw new MapperError("Invalid cooking_sessions.status", "cooking_sessions.status");
  }
  if (row.started_at !== null) {
    assertIsoTimestamp(row.started_at, "cooking_sessions.started_at");
  }
  if (row.finished_at !== null) {
    assertIsoTimestamp(row.finished_at, "cooking_sessions.finished_at");
  }
  if (row.status === "completed" && (row.started_at === null || row.finished_at === null)) {
    throw new MapperError(
      "Completed cooking sessions require start and finish times",
      "cooking_sessions.status"
    );
  }
  if (row.duration_minutes !== null && !isPositiveInteger(row.duration_minutes)) {
    throw new MapperError(
      "Invalid cooking_sessions.duration_minutes",
      "cooking_sessions.duration_minutes"
    );
  }
  if (row.servings_made !== null && !isPositiveInteger(row.servings_made)) {
    throw new MapperError(
      "Invalid cooking_sessions.servings_made",
      "cooking_sessions.servings_made"
    );
  }
  if (row.current_step_index !== null && !isNonNegativeInteger(row.current_step_index)) {
    throw new MapperError(
      "Invalid cooking_sessions.current_step_index",
      "cooking_sessions.current_step_index"
    );
  }

  const session: CookingSession = {
    id: row.id,
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title.trim(),
    status: row.status,
    cookDate: row.cook_date,
    timers: parseCookingTimers(row.timers ?? [], "cooking_sessions.timers"),
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };

  if (row.started_at !== null) session.startedAtIso = row.started_at;
  if (row.finished_at !== null) session.finishedAtIso = row.finished_at;
  if (row.duration_minutes !== null) session.durationMinutes = row.duration_minutes;
  if (row.servings_made !== null) session.servingsMade = row.servings_made;
  if (row.notes !== null && row.notes.trim().length > 0) session.notes = row.notes.trim();
  if (row.current_step_index !== null) session.currentStepIndex = row.current_step_index;

  return session;
}

function parseOptionalNumeric(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new MapperError(`Invalid ${field}`, field);
  }
  return parsed;
}

function isNutrientSource(value: string): value is NutrientSource {
  return value === "usda" || value === "off" || value === "custom";
}

export function parsePer100g(value: unknown, field: string): Per100g {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  const obj = value as Record<string, unknown>;
  const kcal = parseOptionalNumeric(obj.kcal, `${field}.kcal`);
  const proteinG = parseOptionalNumeric(
    obj.proteinG ?? obj.protein_g,
    `${field}.proteinG`
  );
  const fatG = parseOptionalNumeric(obj.fatG ?? obj.fat_g, `${field}.fatG`);
  const carbG = parseOptionalNumeric(obj.carbG ?? obj.carb_g, `${field}.carbG`);
  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbG === undefined) {
    throw new MapperError(`Invalid ${field}: kcal/protein/fat/carb required`, field);
  }
  const per100g: Per100g = { kcal, proteinG, fatG, carbG };
  const fiberG = parseOptionalNumeric(obj.fiberG ?? obj.fiber_g, `${field}.fiberG`);
  const sugarG = parseOptionalNumeric(obj.sugarG ?? obj.sugar_g, `${field}.sugarG`);
  const sodiumMg = parseOptionalNumeric(obj.sodiumMg ?? obj.sodium_mg, `${field}.sodiumMg`);
  if (fiberG !== undefined) per100g.fiberG = fiberG;
  if (sugarG !== undefined) per100g.sugarG = sugarG;
  if (sodiumMg !== undefined) per100g.sodiumMg = sodiumMg;
  return per100g;
}

function per100gToRow(value: Per100g): Record<string, number> {
  const row: Record<string, number> = {
    kcal: value.kcal,
    protein_g: value.proteinG,
    fat_g: value.fatG,
    carb_g: value.carbG,
  };
  if (value.fiberG !== undefined) row.fiber_g = value.fiberG;
  if (value.sugarG !== undefined) row.sugar_g = value.sugarG;
  if (value.sodiumMg !== undefined) row.sodium_mg = value.sodiumMg;
  return row;
}

export function ingredientFromRow(row: IngredientRow): Ingredient {
  assertUuid(row.id, "ingredients.id");
  assertNonEmptyName(row.canonical_name, "ingredients.canonical_name");

  const ingredient: Ingredient = {
    id: row.id,
    canonicalName: row.canonical_name.trim(),
  };
  if (row.category !== null && row.category.trim()) {
    ingredient.category = row.category.trim();
  }
  if (row.default_unit !== null && row.default_unit.trim()) {
    ingredient.defaultUnit = row.default_unit.trim();
  }
  const density = parseOptionalNumeric(row.density_g_per_ml, "ingredients.density_g_per_ml");
  if (density !== undefined) ingredient.densityGPerMl = density;
  const grams = parseOptionalNumeric(row.grams_per_piece, "ingredients.grams_per_piece");
  if (grams !== undefined) ingredient.gramsPerPiece = grams;
  if (row.fdc_id !== null) {
    if (!Number.isInteger(row.fdc_id) || row.fdc_id <= 0) {
      throw new MapperError("Invalid ingredients.fdc_id", "ingredients.fdc_id");
    }
    ingredient.fdcId = row.fdc_id;
  }
  return ingredient;
}

export function ingredientAliasFromRow(row: IngredientAliasRow): IngredientAlias {
  assertUuid(row.id, "ingredient_aliases.id");
  assertUuid(row.ingredient_id, "ingredient_aliases.ingredient_id");
  assertNonEmptyName(row.alias, "ingredient_aliases.alias");
  assertNonEmptyName(row.alias_normalized, "ingredient_aliases.alias_normalized");
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    alias: row.alias.trim(),
    aliasNormalized: row.alias_normalized.trim(),
  };
}

export function assertValidPantryItem(item: PantryItem): void {
  assertUuid(item.id, "pantryItem.id");
  assertNonEmptyName(item.label, "pantryItem.label");
  assertIsoTimestamp(item.createdAtIso, "pantryItem.createdAtIso");
  assertIsoTimestamp(item.updatedAtIso, "pantryItem.updatedAtIso");
  if (typeof item.available !== "boolean") {
    throw new MapperError("Invalid pantryItem.available", "pantryItem.available");
  }
  if (item.ingredientId !== undefined) {
    assertUuid(item.ingredientId, "pantryItem.ingredientId");
  }
  if (item.customIngredientId !== undefined) {
    assertUuid(item.customIngredientId, "pantryItem.customIngredientId");
  }
  if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity < 0)) {
    throw new MapperError("Invalid pantryItem.quantity", "pantryItem.quantity");
  }
  if (item.unit !== undefined && typeof item.unit !== "string") {
    throw new MapperError("Invalid pantryItem.unit", "pantryItem.unit");
  }
}

export function pantryItemToRow(item: PantryItem, userId: string): PantryItemRow {
  assertUuid(userId, "userId");
  assertValidPantryItem(item);
  return {
    id: item.id,
    user_id: userId,
    ingredient_id: item.ingredientId ?? null,
    custom_ingredient_id: item.customIngredientId ?? null,
    label: item.label.trim(),
    available: item.available,
    quantity: item.quantity ?? null,
    unit: item.unit?.trim() || null,
    created_at: item.createdAtIso,
    updated_at: item.updatedAtIso,
  };
}

export function pantryItemFromRow(row: PantryItemRow): PantryItem {
  assertUuid(row.id, "user_pantry.id");
  assertUuid(row.user_id, "user_pantry.user_id");
  assertNonEmptyName(row.label, "user_pantry.label");
  assertIsoTimestamp(row.created_at, "user_pantry.created_at");
  assertIsoTimestamp(row.updated_at, "user_pantry.updated_at");
  if (typeof row.available !== "boolean") {
    throw new MapperError("Invalid user_pantry.available", "user_pantry.available");
  }
  if (row.ingredient_id !== null) {
    assertUuid(row.ingredient_id, "user_pantry.ingredient_id");
  }
  if (row.custom_ingredient_id !== null) {
    assertUuid(row.custom_ingredient_id, "user_pantry.custom_ingredient_id");
  }

  const item: PantryItem = {
    id: row.id,
    label: row.label.trim(),
    available: row.available,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };
  if (row.ingredient_id !== null) item.ingredientId = row.ingredient_id;
  if (row.custom_ingredient_id !== null) item.customIngredientId = row.custom_ingredient_id;
  const quantity = parseOptionalNumeric(row.quantity, "user_pantry.quantity");
  if (quantity !== undefined) {
    if (quantity < 0) {
      throw new MapperError("Invalid user_pantry.quantity", "user_pantry.quantity");
    }
    item.quantity = quantity;
  }
  if (row.unit !== null && row.unit.trim()) item.unit = row.unit.trim();
  return item;
}

export function assertValidCustomIngredient(item: CustomIngredient): void {
  assertUuid(item.id, "customIngredient.id");
  assertNonEmptyName(item.name, "customIngredient.name");
  assertIsoTimestamp(item.createdAtIso, "customIngredient.createdAtIso");
  assertIsoTimestamp(item.updatedAtIso, "customIngredient.updatedAtIso");
  if (item.category !== undefined && typeof item.category !== "string") {
    throw new MapperError("Invalid customIngredient.category", "customIngredient.category");
  }
  if (item.defaultUnit !== undefined && typeof item.defaultUnit !== "string") {
    throw new MapperError("Invalid customIngredient.defaultUnit", "customIngredient.defaultUnit");
  }
  if (item.densityGPerMl !== undefined && !Number.isFinite(item.densityGPerMl)) {
    throw new MapperError("Invalid customIngredient.densityGPerMl", "customIngredient.densityGPerMl");
  }
  if (item.gramsPerPiece !== undefined && !Number.isFinite(item.gramsPerPiece)) {
    throw new MapperError("Invalid customIngredient.gramsPerPiece", "customIngredient.gramsPerPiece");
  }
  if (item.per100g !== undefined) {
    parsePer100g(item.per100g, "customIngredient.per100g");
  }
}

export function customIngredientToRow(item: CustomIngredient, userId: string): CustomIngredientRow {
  assertUuid(userId, "userId");
  assertValidCustomIngredient(item);
  return {
    id: item.id,
    user_id: userId,
    name: item.name.trim(),
    category: item.category?.trim() || null,
    default_unit: item.defaultUnit?.trim() || null,
    density_g_per_ml: item.densityGPerMl ?? null,
    grams_per_piece: item.gramsPerPiece ?? null,
    per_100g: item.per100g ? per100gToRow(item.per100g) : null,
    created_at: item.createdAtIso,
    updated_at: item.updatedAtIso,
  };
}

export function customIngredientFromRow(row: CustomIngredientRow): CustomIngredient {
  assertUuid(row.id, "custom_ingredients.id");
  assertUuid(row.user_id, "custom_ingredients.user_id");
  assertNonEmptyName(row.name, "custom_ingredients.name");
  assertIsoTimestamp(row.created_at, "custom_ingredients.created_at");
  assertIsoTimestamp(row.updated_at, "custom_ingredients.updated_at");

  const item: CustomIngredient = {
    id: row.id,
    name: row.name.trim(),
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at,
  };
  if (row.category !== null && row.category.trim()) item.category = row.category.trim();
  if (row.default_unit !== null && row.default_unit.trim()) item.defaultUnit = row.default_unit.trim();
  const density = parseOptionalNumeric(row.density_g_per_ml, "custom_ingredients.density_g_per_ml");
  if (density !== undefined) item.densityGPerMl = density;
  const grams = parseOptionalNumeric(row.grams_per_piece, "custom_ingredients.grams_per_piece");
  if (grams !== undefined) item.gramsPerPiece = grams;
  if (row.per_100g !== null && row.per_100g !== undefined) {
    item.per100g = parsePer100g(row.per_100g, "custom_ingredients.per_100g");
  }
  return item;
}

export function ingredientNutrientsFromRow(row: IngredientNutrientsRow): IngredientNutrients {
  assertUuid(row.id, "ingredient_nutrients.id");
  assertUuid(row.ingredient_id, "ingredient_nutrients.ingredient_id");
  if (!isNutrientSource(row.source)) {
    throw new MapperError("Invalid ingredient_nutrients.source", "ingredient_nutrients.source");
  }
  assertIsoTimestamp(row.fetched_at, "ingredient_nutrients.fetched_at");
  const nutrients: IngredientNutrients = {
    id: row.id,
    ingredientId: row.ingredient_id,
    source: row.source,
    per100g: parsePer100g(row.per_100g, "ingredient_nutrients.per_100g"),
    fetchedAtIso: row.fetched_at,
  };
  if (row.fdc_id !== null) {
    if (!Number.isInteger(row.fdc_id) || row.fdc_id <= 0) {
      throw new MapperError("Invalid ingredient_nutrients.fdc_id", "ingredient_nutrients.fdc_id");
    }
    nutrients.fdcId = row.fdc_id;
  }
  return nutrients;
}

export function retentionFactorFromRow(row: RetentionFactorRow): RetentionFactor {
  assertUuid(row.id, "retention_factors.id");
  if (!isCookingMethod(row.cooking_method)) {
    throw new MapperError("Invalid retention_factors.cooking_method", "retention_factors.cooking_method");
  }
  if (typeof row.nutrient_key !== "string" || !row.nutrient_key.trim()) {
    throw new MapperError("Invalid retention_factors.nutrient_key", "retention_factors.nutrient_key");
  }
  const factor = parseOptionalNumeric(row.factor, "retention_factors.factor");
  if (factor === undefined || factor < 0 || factor > 1) {
    throw new MapperError("Invalid retention_factors.factor", "retention_factors.factor");
  }
  return {
    id: row.id,
    cookingMethod: row.cooking_method,
    nutrientKey: row.nutrient_key.trim(),
    factor,
  };
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
  gamificationStateRows: GamificationStateRow[] = [],
  supplementProtocolRows: SupplementProtocolRow[] = [],
  supplementIntakeLogRows: SupplementIntakeLogRow[] = [],
  recipeRows: RecipeRow[] = [],
  cookingSessionRows: CookingSessionRow[] = [],
  pantryRows: PantryItemRow[] = [],
  customIngredientRows: CustomIngredientRow[] = []
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
  const supplementProtocols = supplementProtocolRows.map((row) =>
    supplementProtocolFromRow(row)
  );
  const supplementIntakeLogs = supplementIntakeLogRows.map((row) =>
    supplementIntakeLogFromRow(row)
  );
  const recipes = recipeRows.map((row) => recipeFromRow(row));
  const cookingSessions = cookingSessionRows.map((row) => cookingSessionFromRow(row));
  const pantry = pantryRows.map((row) => pantryItemFromRow(row));
  const customIngredients = customIngredientRows.map((row) => customIngredientFromRow(row));

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
    supplementProtocols,
    supplementIntakeLogs,
    recipes,
    cookingSessions,
    pantry,
    customIngredients,
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
    for (const personId of eventPersonIds(event)) {
      if (!personIds.has(personId)) {
        throw new MapperError(`Event references unknown person: ${personId}`, "events.personId");
      }
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

  const protocolIds = new Set<string>();
  for (const protocol of payload.supplementProtocols) {
    assertValidSupplementProtocol(protocol);
    if (protocolIds.has(protocol.id)) {
      throw new MapperError(
        `Duplicate supplement protocol id: ${protocol.id}`,
        "supplementProtocols.id"
      );
    }
    protocolIds.add(protocol.id);
  }

  const intakeLogIds = new Set<string>();
  const intakeDayKeys = new Set<string>();
  for (const log of payload.supplementIntakeLogs) {
    assertValidSupplementIntakeLog(log);
    if (intakeLogIds.has(log.id)) {
      throw new MapperError(
        `Duplicate supplement intake log id: ${log.id}`,
        "supplementIntakeLogs.id"
      );
    }
    intakeLogIds.add(log.id);
    if (!protocolIds.has(log.protocolId)) {
      throw new MapperError(
        `Supplement intake log references unknown protocol: ${log.protocolId}`,
        "supplementIntakeLogs.protocolId"
      );
    }
    const dayKey = `${log.protocolId}:${log.date}`;
    if (intakeDayKeys.has(dayKey)) {
      throw new MapperError(
        `Duplicate supplement intake for protocol and date: ${dayKey}`,
        "supplementIntakeLogs.date"
      );
    }
    intakeDayKeys.add(dayKey);
  }

  const recipeIds = new Set<string>();
  for (const recipe of payload.recipes) {
    assertValidRecipe(recipe);
    if (recipeIds.has(recipe.id)) {
      throw new MapperError(`Duplicate recipe id: ${recipe.id}`, "recipes.id");
    }
    recipeIds.add(recipe.id);
  }

  const cookingSessionIds = new Set<string>();
  for (const session of payload.cookingSessions) {
    assertValidCookingSession(session);
    if (cookingSessionIds.has(session.id)) {
      throw new MapperError(
        `Duplicate cooking session id: ${session.id}`,
        "cookingSessions.id"
      );
    }
    cookingSessionIds.add(session.id);
    if (session.recipeId !== null && !recipeIds.has(session.recipeId)) {
      throw new MapperError(
        `Cooking session references unknown recipe: ${session.recipeId}`,
        "cookingSessions.recipeId"
      );
    }
  }

  const pantryIds = new Set<string>();
  const pantryIngredientIds = new Set<string>();
  for (const item of payload.pantry ?? []) {
    assertValidPantryItem(item);
    if (pantryIds.has(item.id)) {
      throw new MapperError(`Duplicate pantry item id: ${item.id}`, "pantry.id");
    }
    pantryIds.add(item.id);
    if (item.ingredientId) {
      if (pantryIngredientIds.has(item.ingredientId)) {
        throw new MapperError(
          `Duplicate pantry ingredient: ${item.ingredientId}`,
          "pantry.ingredientId"
        );
      }
      pantryIngredientIds.add(item.ingredientId);
    }
  }

  const customIngredientIds = new Set<string>();
  for (const item of payload.customIngredients ?? []) {
    assertValidCustomIngredient(item);
    if (customIngredientIds.has(item.id)) {
      throw new MapperError(
        `Duplicate custom ingredient id: ${item.id}`,
        "customIngredients.id"
      );
    }
    customIngredientIds.add(item.id);
  }

  for (const recipe of payload.recipes) {
    for (const line of recipe.ingredients) {
      if (line.customIngredientId && !customIngredientIds.has(line.customIngredientId)) {
        throw new MapperError(
          `Recipe ingredient references unknown custom ingredient: ${line.customIngredientId}`,
          "recipes.ingredients"
        );
      }
    }
  }

  for (const item of payload.pantry ?? []) {
    if (item.customIngredientId && !customIngredientIds.has(item.customIngredientId)) {
      throw new MapperError(
        `Pantry item references unknown custom ingredient: ${item.customIngredientId}`,
        "pantry.customIngredientId"
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
