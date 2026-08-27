/**
 * Pure helpers for the School domain (courses, reminders, graded items).
 *
 * Timezone conversion uses Intl only — no date libraries. Reminders store wall
 * clock values in the course IANA zone; collectors convert timed values to a
 * local zone. All-day (no time) dates are not shifted.
 */

import { isCalendarColorToken, type CalendarColorToken } from "./calendarColors";
import type {
  AppPayload,
  SchoolCourse,
  SchoolEnrollmentStatus,
  SchoolGradeCategory,
  SchoolGradedItem,
  SchoolLatePolicy,
  SchoolLink,
  SchoolOfficeHours,
  SchoolReminder,
  SchoolReminderKind,
  SchoolStaffMember,
  SchoolStaffRole,
} from "./model";

export type SchoolLetterGrade = "A" | "B" | "C" | "D" | "F";

export const DEFAULT_SCHOOL_TIMEZONE = "America/New_York";

export const SCHOOL_REMINDER_KINDS: readonly SchoolReminderKind[] = [
  "assignment",
  "quiz",
  "exam",
  "project",
  "study",
  "reading",
  "other",
];

export const SCHOOL_STAFF_ROLES: readonly SchoolStaffRole[] = ["professor", "ta", "other"];

export const SCHOOL_ENROLLMENT_STATUSES: readonly SchoolEnrollmentStatus[] = [
  "enrolled",
  "completed",
  "dropped",
];

export const SCHOOL_REMINDER_KIND_LABELS: Record<SchoolReminderKind, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
  project: "Project",
  study: "Study",
  reading: "Reading",
  other: "Other",
};

export const SCHOOL_STAFF_ROLE_LABELS: Record<SchoolStaffRole, string> = {
  professor: "Professor",
  ta: "TA",
  other: "Staff",
};

export const SCHOOL_ENROLLMENT_STATUS_LABELS: Record<SchoolEnrollmentStatus, string> = {
  enrolled: "Enrolled",
  completed: "Done",
  dropped: "Dropped",
};

/** Mode-aware text colors so staff roles stay distinct on glance and edit views. */
export const SCHOOL_STAFF_ROLE_COLORS: Record<SchoolStaffRole, string> = {
  professor: "var(--aether-chip-info-text, #0d47a1)",
  ta: "var(--aether-chip-warning-text, #7a5b12)",
  other: "var(--aether-chip-marker-text, #6a1b9a)",
};

/** Georgia Tech default letter scale (helpers only; not stored per course). */
export const GT_LETTER_SCALE: ReadonlyArray<{ letter: SchoolLetterGrade; minPercent: number }> = [
  { letter: "A", minPercent: 90 },
  { letter: "B", minPercent: 80 },
  { letter: "C", minPercent: 70 },
  { letter: "D", minPercent: 60 },
  { letter: "F", minPercent: 0 },
];

export type SchoolWallTime = {
  date: string;
  time?: string;
};

export type CreateSchoolCourseInput = {
  name: string;
  code?: string;
  term?: string;
  timezone?: string;
  notes?: string;
  colorToken?: CalendarColorToken;
  staff?: SchoolStaffMember[];
  officeHours?: SchoolOfficeHours[];
  latePolicy?: SchoolLatePolicy;
  extraCreditNotes?: string;
  scoringNotes?: string;
  gradeCategories?: SchoolGradeCategory[];
  enrollmentStatus?: SchoolEnrollmentStatus;
};

export type CreateSchoolReminderInput = {
  courseId: string;
  kind: SchoolReminderKind;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  openDate?: string;
  openTime?: string;
  closeDate?: string;
  closeTime?: string;
  notes?: string;
  links?: SchoolLink[];
  fingerprint?: string;
};

export type CreateSchoolGradedItemInput = {
  courseId: string;
  categoryId?: string;
  reminderId?: string;
  name: string;
  dueDate?: string;
  dueTime?: string;
  maxScore?: number;
  score?: number;
  extraCredit?: boolean;
};

/** Deep-link into the Career tab, mirroring FitnessFocus. */
export type CareerFocus =
  | { kind: "career" }
  | { kind: "school"; courseId?: string };

export function normalizeCareerFocus(focus?: CareerFocus): CareerFocus | undefined {
  if (!focus || typeof focus !== "object") return undefined;
  if (focus.kind === "career") return { kind: "career" };
  if (focus.kind === "school") {
    const courseId = focus.courseId?.trim();
    return courseId ? { kind: "school", courseId } : { kind: "school" };
  }
  return undefined;
}

export function isSchoolReminderKind(value: string): value is SchoolReminderKind {
  return (SCHOOL_REMINDER_KINDS as readonly string[]).includes(value);
}

export function isSchoolStaffRole(value: string): value is SchoolStaffRole {
  return (SCHOOL_STAFF_ROLES as readonly string[]).includes(value);
}

export function isSchoolEnrollmentStatus(value: string): value is SchoolEnrollmentStatus {
  return (SCHOOL_ENROLLMENT_STATUSES as readonly string[]).includes(value);
}

/** Missing or unknown values resolve to enrolled so legacy courses stay active. */
export function resolveSchoolEnrollmentStatus(value: unknown): SchoolEnrollmentStatus {
  return typeof value === "string" && isSchoolEnrollmentStatus(value) ? value : "enrolled";
}

export function isSchoolCourseEnrolled(course: SchoolCourse): boolean {
  return resolveSchoolEnrollmentStatus(course.enrollmentStatus) === "enrolled";
}

export function enrolledSchoolCourses(courses: readonly SchoolCourse[]): SchoolCourse[] {
  return courses.filter(isSchoolCourseEnrolled);
}

export function setSchoolCourseEnrollmentStatus(
  course: SchoolCourse,
  status: SchoolEnrollmentStatus,
  nowIso: string
): SchoolCourse {
  const next: SchoolCourse = { ...course, updatedAtIso: nowIso };
  if (status === "enrolled") {
    delete next.enrollmentStatus;
  } else {
    next.enrollmentStatus = status;
  }
  return next;
}

export function isValidIanaTimeZone(value: string): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

export function resolveSchoolTimeZone(value: string | undefined): string {
  if (value && isValidIanaTimeZone(value)) return value.trim();
  return DEFAULT_SCHOOL_TIMEZONE;
}

/** Allowlisted calendar palette token, or undefined when unset/invalid. */
export function resolveSchoolCourseColorToken(value: unknown): CalendarColorToken | undefined {
  return isCalendarColorToken(value) ? value : undefined;
}

export function resolveLocalTimeZone(): string {
  try {
    return resolveSchoolTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_SCHOOL_TIMEZONE;
  }
}

export function isSchoolDateKey(value: string): boolean {
  return isIsoDateKey(value);
}

/** Accepts `HH:MM` or HTML time values with seconds; empty → undefined. */
export function normalizeSchoolTimeInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return undefined;
  const normalized = `${match[1]!.padStart(2, "0")}:${match[2]}`;
  return isHhMm(normalized) ? normalized : undefined;
}

export function letterGradeFromPercent(percent: number): SchoolLetterGrade {
  if (!Number.isFinite(percent)) return "F";
  for (const band of GT_LETTER_SCALE) {
    if (percent >= band.minPercent) return band.letter;
  }
  return "F";
}

export function normalizeSchoolTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function reminderFingerprint(
  kind: SchoolReminderKind,
  title: string,
  date: string
): string {
  return `${kind}|${normalizeSchoolTitle(title)}|${date}`;
}

export function withReminderFingerprint(reminder: SchoolReminder): SchoolReminder {
  return {
    ...reminder,
    fingerprint: reminderFingerprint(reminder.kind, reminder.title, reminder.date),
  };
}

export function isSchoolWorkCompleted(value: { completedAtIso?: string } | undefined): boolean {
  return typeof value?.completedAtIso === "string" && value.completedAtIso.length > 0;
}

function setCompletedAtIso<T extends { completedAtIso?: string; updatedAtIso: string }>(
  item: T,
  completed: boolean,
  nowIso: string
): T {
  const next = { ...item, updatedAtIso: nowIso };
  if (completed) {
    next.completedAtIso = item.completedAtIso ?? nowIso;
  } else {
    delete next.completedAtIso;
  }
  return next;
}

export function setSchoolReminderCompleted(
  reminder: SchoolReminder,
  completed: boolean,
  nowIso: string
): SchoolReminder {
  return setCompletedAtIso(reminder, completed, nowIso);
}

export function setSchoolGradedItemCompleted(
  item: SchoolGradedItem,
  completed: boolean,
  nowIso: string
): SchoolGradedItem {
  return setCompletedAtIso(item, completed, nowIso);
}

/**
 * Auto-label from hostname + last path segment. The reminder title stays the
 * assignment name; this label is for tappable short links only.
 */
export function autoLabelFromUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, "");
    const segments = parsed.pathname.split("/").filter((part) => part.length > 0);
    if (segments.length === 0) return host || trimmed;
    const last = decodeURIComponent(segments[segments.length - 1]!);
    if (!host) return last;
    return `${host} / ${last}`;
  } catch {
    return trimmed;
  }
}

export function resolveSchoolLinkLabel(url: string, label?: string): string {
  const trimmed = label?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return autoLabelFromUrl(url);
}

export function createSchoolLink(url: string, label?: string): SchoolLink {
  return { url: url.trim(), label: resolveSchoolLinkLabel(url, label) };
}

export function createSchoolCourse(
  input: CreateSchoolCourseInput,
  options: { id: string; nowIso: string }
): SchoolCourse {
  const course: SchoolCourse = {
    id: options.id,
    name: input.name.trim(),
    timezone: resolveSchoolTimeZone(input.timezone),
    staff: input.staff ? [...input.staff] : [],
    officeHours: input.officeHours ? [...input.officeHours] : [],
    gradeCategories: input.gradeCategories ? [...input.gradeCategories] : [],
    createdAtIso: options.nowIso,
    updatedAtIso: options.nowIso,
  };
  const code = input.code?.trim();
  if (code) course.code = code;
  const term = input.term?.trim();
  if (term) course.term = term;
  const notes = input.notes?.trim();
  if (notes) course.notes = notes;
  const colorToken = resolveSchoolCourseColorToken(input.colorToken);
  if (colorToken) course.colorToken = colorToken;
  if (input.latePolicy) course.latePolicy = { ...input.latePolicy };
  const extraCreditNotes = input.extraCreditNotes?.trim();
  if (extraCreditNotes) course.extraCreditNotes = extraCreditNotes;
  const scoringNotes = input.scoringNotes?.trim();
  if (scoringNotes) course.scoringNotes = scoringNotes;
  const enrollmentStatus = resolveSchoolEnrollmentStatus(input.enrollmentStatus);
  if (enrollmentStatus !== "enrolled") course.enrollmentStatus = enrollmentStatus;
  return course;
}

export function createSchoolReminder(
  input: CreateSchoolReminderInput,
  options: { id: string; nowIso: string }
): SchoolReminder {
  const reminder: SchoolReminder = {
    id: options.id,
    courseId: input.courseId,
    kind: input.kind,
    title: input.title.trim(),
    date: input.date,
    links: (input.links ?? []).map((link) => ({
      url: link.url.trim(),
      label: resolveSchoolLinkLabel(link.url, link.label),
    })),
    createdAtIso: options.nowIso,
    updatedAtIso: options.nowIso,
  };
  if (input.startTime) reminder.startTime = input.startTime;
  if (input.endTime) reminder.endTime = input.endTime;
  if (input.openDate) reminder.openDate = input.openDate;
  if (input.openTime) reminder.openTime = input.openTime;
  if (input.closeDate) reminder.closeDate = input.closeDate;
  if (input.closeTime) reminder.closeTime = input.closeTime;
  const notes = input.notes?.trim();
  if (notes) reminder.notes = notes;
  reminder.fingerprint =
    input.fingerprint?.trim() ||
    reminderFingerprint(reminder.kind, reminder.title, reminder.date);
  return reminder;
}

export function createSchoolGradedItem(
  input: CreateSchoolGradedItemInput,
  options: { id: string; nowIso: string }
): SchoolGradedItem {
  const item: SchoolGradedItem = {
    id: options.id,
    courseId: input.courseId,
    name: input.name.trim(),
    createdAtIso: options.nowIso,
    updatedAtIso: options.nowIso,
  };
  if (input.categoryId) item.categoryId = input.categoryId;
  if (input.reminderId) item.reminderId = input.reminderId;
  if (input.dueDate) item.dueDate = input.dueDate;
  if (input.dueTime) item.dueTime = input.dueTime;
  if (input.maxScore !== undefined) item.maxScore = input.maxScore;
  if (input.score !== undefined) item.score = input.score;
  if (input.extraCredit) item.extraCredit = true;
  return item;
}

export function upsertSchoolCourse(
  courses: readonly SchoolCourse[],
  course: SchoolCourse
): SchoolCourse[] {
  return upsertById(courses, course);
}

export function upsertSchoolReminder(
  reminders: readonly SchoolReminder[],
  reminder: SchoolReminder
): SchoolReminder[] {
  return upsertById(reminders, withReminderFingerprint(reminder));
}

export function upsertSchoolGradedItem(
  items: readonly SchoolGradedItem[],
  item: SchoolGradedItem
): SchoolGradedItem[] {
  return upsertById(items, item);
}

/** Copies a reminder's due date/time onto linked graded items so the school table stays in sync. */
export function syncGradedItemScheduleFromReminder(
  items: readonly SchoolGradedItem[],
  reminder: SchoolReminder
): SchoolGradedItem[] {
  return items.map((item) => {
    if (item.reminderId !== reminder.id) return item;
    const nextDueTime = reminder.startTime;
    if (item.dueDate === reminder.date && (item.dueTime ?? undefined) === nextDueTime) {
      return item;
    }
    const next: SchoolGradedItem = {
      ...item,
      dueDate: reminder.date,
      updatedAtIso: reminder.updatedAtIso,
    };
    if (nextDueTime) next.dueTime = nextDueTime;
    else delete next.dueTime;
    return next;
  });
}

export function removeSchoolCourse(
  courses: readonly SchoolCourse[],
  reminders: readonly SchoolReminder[],
  gradedItems: readonly SchoolGradedItem[],
  courseId: string
): {
  schoolCourses: SchoolCourse[];
  schoolReminders: SchoolReminder[];
  schoolGradedItems: SchoolGradedItem[];
} {
  return {
    schoolCourses: courses.filter((course) => course.id !== courseId),
    schoolReminders: reminders.filter((reminder) => reminder.courseId !== courseId),
    schoolGradedItems: gradedItems.filter((item) => item.courseId !== courseId),
  };
}

export function removeSchoolReminder(
  reminders: readonly SchoolReminder[],
  gradedItems: readonly SchoolGradedItem[],
  reminderId: string
): {
  schoolReminders: SchoolReminder[];
  schoolGradedItems: SchoolGradedItem[];
} {
  return {
    schoolReminders: reminders.filter((reminder) => reminder.id !== reminderId),
    schoolGradedItems: gradedItems.map((item) => {
      if (item.reminderId !== reminderId) return item;
      const next = { ...item };
      delete next.reminderId;
      return next;
    }),
  };
}

export function removeSchoolGradedItem(
  items: readonly SchoolGradedItem[],
  itemId: string
): SchoolGradedItem[] {
  return items.filter((item) => item.id !== itemId);
}

export function findSchoolCourse(
  courses: readonly SchoolCourse[],
  courseId: string
): SchoolCourse | undefined {
  return courses.find((course) => course.id === courseId);
}

export function remindersForCourse(
  reminders: readonly SchoolReminder[],
  courseId: string
): SchoolReminder[] {
  return reminders.filter((reminder) => reminder.courseId === courseId);
}

export function gradedItemsForCourse(
  items: readonly SchoolGradedItem[],
  courseId: string
): SchoolGradedItem[] {
  return items.filter((item) => item.courseId === courseId);
}

/** Drops orphan course/reminder/category refs so payload validation can succeed. */
export function sanitizeSchoolReferences(payload: AppPayload): AppPayload {
  const courses = payload.schoolCourses ?? [];
  const courseIds = new Set(courses.map((course) => course.id));
  const categoryIdsByCourse = new Map<string, Set<string>>();
  for (const course of courses) {
    categoryIdsByCourse.set(
      course.id,
      new Set(course.gradeCategories.map((category) => category.id))
    );
  }

  let changed = false;

  const schoolReminders = (payload.schoolReminders ?? []).filter((reminder) => {
    if (courseIds.has(reminder.courseId)) return true;
    changed = true;
    return false;
  });
  const reminderIds = new Set(schoolReminders.map((reminder) => reminder.id));

  const schoolGradedItems = (payload.schoolGradedItems ?? []).map((item) => {
    if (!courseIds.has(item.courseId)) {
      changed = true;
      return null;
    }
    let next = item;
    if (item.reminderId !== undefined && !reminderIds.has(item.reminderId)) {
      changed = true;
      next = { ...next };
      delete next.reminderId;
    }
    const categoryIds = categoryIdsByCourse.get(item.courseId);
    if (item.categoryId !== undefined && categoryIds && !categoryIds.has(item.categoryId)) {
      changed = true;
      if (next === item) next = { ...next };
      delete next.categoryId;
    }
    return next;
  });

  const keptGradedItems: SchoolGradedItem[] = [];
  for (const item of schoolGradedItems) {
    if (item) keptGradedItems.push(item);
    else changed = true;
  }

  if (!changed) return payload;
  return {
    ...payload,
    schoolCourses: courses,
    schoolReminders,
    schoolGradedItems: keptGradedItems,
  };
}

/**
 * Converts a source-zone wall clock to another IANA zone. All-day values (no
 * time) keep the source date. Invalid input returns null.
 */
export function convertSchoolWallTime(
  source: SchoolWallTime,
  sourceTimeZone: string,
  targetTimeZone: string
): SchoolWallTime | null {
  if (!isIsoDateKey(source.date)) return null;
  const fromZone = resolveSchoolTimeZone(sourceTimeZone);
  const toZone = resolveSchoolTimeZone(targetTimeZone);
  if (!source.time) {
    return { date: source.date };
  }
  if (!isHhMm(source.time)) return null;

  const instantMs = zonedWallTimeToUtcMs(source.date, source.time, fromZone);
  if (instantMs === null) return null;
  const parts = wallPartsInTimeZone(instantMs, toZone);
  if (!parts) return null;
  return {
    date: formatDateKey(parts.year, parts.month, parts.day),
    time: formatHhMm(parts.hour, parts.minute),
  };
}

export type LocalizedSchoolDue = {
  reminder: SchoolReminder;
  course: SchoolCourse;
  localDate: string;
  localTime?: string;
};

/**
 * Converts each reminder due (source course zone) to local wall time. All-day
 * dates are not shifted. Orphan reminders and invalid dates are omitted.
 */
export function listLocalizedSchoolDues(
  courses: readonly SchoolCourse[],
  reminders: readonly SchoolReminder[],
  localTimeZone: string
): LocalizedSchoolDue[] {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const dues: LocalizedSchoolDue[] = [];
  for (const reminder of reminders) {
    const course = courseById.get(reminder.courseId);
    if (!course || !isSchoolCourseEnrolled(course)) continue;
    const local = convertSchoolWallTime(
      { date: reminder.date, time: reminder.startTime },
      course.timezone,
      localTimeZone
    );
    if (!local) continue;
    const due: LocalizedSchoolDue = {
      reminder,
      course,
      localDate: local.date,
    };
    if (local.time) due.localTime = local.time;
    dues.push(due);
  }
  return dues;
}

export function formatSchoolDueCaption(input: {
  date: string;
  time?: string;
  sourceTimeZone: string;
  localTimeZone: string;
  prefix?: string;
}): string {
  const prefix = input.prefix?.trim() || "Due";
  const sourceZone = resolveSchoolTimeZone(input.sourceTimeZone);
  const localZone = resolveSchoolTimeZone(input.localTimeZone);
  if (!input.time) {
    return `${prefix} ${formatShortDate(input.date)} (all day)`;
  }

  const sourceAbbrev = timeZoneShortName(
    sourceZone,
    zonedWallTimeToUtcMs(input.date, input.time, sourceZone) ?? Date.now()
  );
  const sourceClock = formatClock(input.time);
  const local = convertSchoolWallTime(
    { date: input.date, time: input.time },
    sourceZone,
    localZone
  );
  if (!local?.time || (local.date === input.date && local.time === input.time && sourceZone === localZone)) {
    return `${prefix} ${sourceClock} ${sourceAbbrev}`;
  }
  const localClock = formatClock(local.time);
  const dateNote = local.date !== input.date ? ` ${formatShortDate(local.date)}` : "";
  return `${prefix} ${sourceClock} ${sourceAbbrev} · ${localClock} local${dateNote}`;
}

function upsertById<T extends { id: string }>(items: readonly T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

function isIsoDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isHhMm(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallPartsInTimeZone(instantMs: number, timeZone: string): WallParts | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const map: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(instantMs))) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour,
      minute: Number(map.minute),
      second: Number(map.second),
    };
  } catch {
    return null;
  }
}

function timeZoneOffsetMs(instantMs: number, timeZone: string): number | null {
  const parts = wallPartsInTimeZone(instantMs, timeZone);
  if (!parts) return null;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - instantMs;
}

function zonedWallTimeToUtcMs(date: string, time: string, timeZone: string): number | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = timeZoneOffsetMs(utcGuess, timeZone);
  if (offset1 === null) return null;
  const instant = utcGuess - offset1;
  const offset2 = timeZoneOffsetMs(instant, timeZone);
  if (offset2 === null) return null;
  if (offset1 !== offset2) return utcGuess - offset2;
  return instant;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatHhMm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatClock(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad2(minute)} ${period}`;
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function timeZoneShortName(timeZone: string, instantMs: number): string {
  try {
    const generic = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortGeneric",
    }).formatToParts(new Date(instantMs));
    const genericName = generic.find((part) => part.type === "timeZoneName")?.value;
    if (genericName && genericName !== timeZone) return genericName;
  } catch {
    // shortGeneric is not available in every runtime.
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date(instantMs));
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
