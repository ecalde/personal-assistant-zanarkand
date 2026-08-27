/**
 * Term Timeline: Sunday-due week grid for enrolled school courses.
 *
 * Fall/Spring are 16 instructional weeks plus one grades week. Summer is 12 + 1.
 * Week rows are Sunday dates (midnight deadlines). Dated reminders and graded
 * items land on the Sunday on or before the due date (Sun–Sat week), so a
 * Sunday-midnight deadline stored as Monday 00:00 still sits on that Sunday.
 */

import type {
  CalendarColorToken,
  SchoolCourse,
  SchoolGradedItem,
  SchoolGradeCategory,
  SchoolReminder,
  SchoolReminderKind,
  SchoolTimelineColumnGroup,
  SchoolTimelineLayout,
} from "./model";
import {
  enrolledSchoolCourses,
  isSchoolCourseEnrolled,
  isSchoolWorkCompleted,
  SCHOOL_REMINDER_KIND_LABELS,
  SCHOOL_REMINDER_KINDS,
} from "./school";

export type SchoolAcademicSeason = "spring" | "summer" | "fall";

export type SchoolAcademicTerm = {
  season: SchoolAcademicSeason;
  year: number;
  label: string;
  instructionalWeeks: number;
  sundays: string[];
  gradesSunday: string;
};

export type SchoolScheduleColumn = {
  key: string;
  label: string;
};

export type SchoolScheduleEntry = {
  id: string;
  courseId: string;
  courseLabel: string;
  title: string;
  columnKey: string;
  dueDate: string;
  weekSunday: string;
  colorToken?: CalendarColorToken;
  source: "gradedItem" | "reminder";
  reminderId?: string;
  gradedItemId?: string;
  completed: boolean;
};

export type SchoolScheduleWeek = {
  weekNumber: number;
  sundayDate: string;
  isGradesWeek: boolean;
  isCurrent: boolean;
  entriesByColumn: Record<string, SchoolScheduleEntry[]>;
};

export type { SchoolTimelineColumnGroup, SchoolTimelineLayout };

export const EMPTY_SCHOOL_TIMELINE_LAYOUT: SchoolTimelineLayout = {
  columnGroups: [],
  columnLabels: {},
  rowLabels: {},
};

export type SchoolTimelineDisplayColumn = {
  key: string;
  label: string;
  originalLabel: string;
  memberKeys: string[];
  isMerged: boolean;
  isRenamed: boolean;
  groupId?: string;
};

export type SchoolTimelineDisplayWeek = SchoolScheduleWeek & {
  dueLabel: string;
  originalDueLabel: string;
  isDueRenamed: boolean;
};

export type SchoolTimelineView = {
  columns: SchoolTimelineDisplayColumn[];
  weeks: SchoolTimelineDisplayWeek[];
};

export type SchoolSemesterSchedule = {
  term: SchoolAcademicTerm;
  columns: SchoolScheduleColumn[];
  weeks: SchoolScheduleWeek[];
  enrolledCourses: SchoolCourse[];
};

const TIMELINE_LABEL_MAX = 80;
const TIMELINE_KEY_MAX = 80;
const TIMELINE_GROUP_MAX = 40;

const FALL_SPRING_INSTRUCTIONAL_WEEKS = 16;
const SUMMER_INSTRUCTIONAL_WEEKS = 12;

const COLUMN_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["quiz", "quizzes"],
  ["exam", "exams", "test", "tests", "midterm", "midterms", "final", "finals"],
  ["project", "projects", "termproject"],
  ["assignment", "assignments", "homework", "homeworks", "hw"],
  ["exercise", "exercises"],
  ["other", "survey", "surveys", "surveysother", "surveysandother"],
  ["study", "studies"],
  ["reading", "readings"],
];

export function schoolAcademicSeasonFromDate(now: Date): SchoolAcademicSeason {
  const month = now.getMonth() + 1;
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

export function resolveSchoolAcademicTerm(now: Date = new Date()): SchoolAcademicTerm {
  const season = schoolAcademicSeasonFromDate(now);
  const year = now.getFullYear();
  const instructionalWeeks =
    season === "summer" ? SUMMER_INSTRUCTIONAL_WEEKS : FALL_SPRING_INSTRUCTIONAL_WEEKS;
  const gradesSunday = gradesSundayForSeason(season, year);
  const sundays: string[] = [];
  for (let weeksBeforeGrades = instructionalWeeks; weeksBeforeGrades >= 0; weeksBeforeGrades -= 1) {
    sundays.push(addDays(gradesSunday, -weeksBeforeGrades * 7));
  }
  return {
    season,
    year,
    label: `${capitalize(season)} ${year}`,
    instructionalWeeks,
    sundays,
    gradesSunday,
  };
}

export function formatSchoolSundayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return `${month}/${day}/${String(year).slice(2)}`;
}

/** Sunday that starts the US week containing `dateKey` (Sun–Sat). */
export function sundayOnOrBefore(dateKey: string): string | null {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() - date.getDay());
  return formatDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** @deprecated Use sundayOnOrBefore — kept so older tests/callers keep compiling. */
export function sundayEndingWeekOf(dateKey: string): string | null {
  return sundayOnOrBefore(dateKey);
}

export function buildSchoolSemesterSchedule(input: {
  courses: readonly SchoolCourse[];
  reminders: readonly SchoolReminder[];
  gradedItems: readonly SchoolGradedItem[];
  now?: Date;
  courseIdFilter?: string;
}): SchoolSemesterSchedule {
  const now = input.now ?? new Date();
  const term = resolveSchoolAcademicTerm(now);
  const todayKey = formatDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const currentSunday = sundayOnOrBefore(todayKey) ?? term.sundays[0]!;

  const enrolled = enrolledSchoolCourses(input.courses).sort((left, right) =>
    (left.code ?? left.name).localeCompare(right.code ?? right.name)
  );
  const visibleCourses = input.courseIdFilter
    ? enrolled.filter((course) => course.id === input.courseIdFilter)
    : enrolled;
  const visibleIds = new Set(visibleCourses.map((course) => course.id));

  const entries = collectScheduleEntries({
    courses: visibleCourses,
    reminders: input.reminders.filter((reminder) => visibleIds.has(reminder.courseId)),
    gradedItems: input.gradedItems.filter((item) => visibleIds.has(item.courseId)),
  });

  const columns = resolveScheduleColumns(visibleCourses, entries);
  const sundaySet = new Set(term.sundays);
  const lastInstructionSunday = term.sundays[term.instructionalWeeks - 1] ?? term.gradesSunday;

  const weeks: SchoolScheduleWeek[] = term.sundays.map((sundayDate, index) => {
    const isGradesWeek = sundayDate === term.gradesSunday;
    const entriesByColumn: Record<string, SchoolScheduleEntry[]> = {};
    for (const column of columns) entriesByColumn[column.key] = [];
    return {
      weekNumber: index + 1,
      sundayDate,
      isGradesWeek,
      isCurrent: !isGradesWeek && sundayDate === currentSunday,
      entriesByColumn,
    };
  });

  const weekBySunday = new Map(weeks.map((week) => [week.sundayDate, week]));
  for (const entry of entries) {
    if (!sundaySet.has(entry.weekSunday)) continue;
    const week = weekBySunday.get(entry.weekSunday);
    if (!week) continue;
    const targetWeek =
      week.isGradesWeek ? weekBySunday.get(lastInstructionSunday) ?? week : week;
    if (targetWeek.isGradesWeek) continue;
    const bucket = targetWeek.entriesByColumn[entry.columnKey];
    if (!bucket) continue;
    bucket.push(entry);
  }

  for (const week of weeks) {
    for (const column of columns) {
      week.entriesByColumn[column.key]?.sort((left, right) => {
        const byCourse = left.courseLabel.localeCompare(right.courseLabel);
        if (byCourse !== 0) return byCourse;
        return left.title.localeCompare(right.title);
      });
    }
  }

  return {
    term,
    columns,
    weeks,
    enrolledCourses: enrolled,
  };
}

function collectScheduleEntries(input: {
  courses: readonly SchoolCourse[];
  reminders: readonly SchoolReminder[];
  gradedItems: readonly SchoolGradedItem[];
}): SchoolScheduleEntry[] {
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const reminderById = new Map(input.reminders.map((reminder) => [reminder.id, reminder]));
  const linkedReminderIds = new Set<string>();
  const entries: SchoolScheduleEntry[] = [];

  for (const item of input.gradedItems) {
    const course = courseById.get(item.courseId);
    if (!course || !isSchoolCourseEnrolled(course)) continue;
    const linked = item.reminderId ? reminderById.get(item.reminderId) : undefined;
    // Linked reminders are the schedule source of truth (same as the calendar).
    const dueDate = linked?.date ?? item.dueDate;
    if (!dueDate) continue;
    if (item.reminderId) linkedReminderIds.add(item.reminderId);
    const columnKey = columnKeyForGradedItem(course, item, linked);
    const weekSunday = sundayOnOrBefore(dueDate);
    if (!weekSunday) continue;
    entries.push({
      id: `graded:${item.id}`,
      courseId: course.id,
      courseLabel: course.code?.trim() || course.name,
      title: item.name,
      columnKey,
      dueDate,
      weekSunday,
      ...(course.colorToken ? { colorToken: course.colorToken } : {}),
      source: "gradedItem",
      gradedItemId: item.id,
      ...(linked ? { reminderId: linked.id } : {}),
      completed: isSchoolWorkCompleted(linked) || (!linked && isSchoolWorkCompleted(item)),
    });
  }

  for (const reminder of input.reminders) {
    if (linkedReminderIds.has(reminder.id)) continue;
    const course = courseById.get(reminder.courseId);
    if (!course || !isSchoolCourseEnrolled(course)) continue;
    const weekSunday = sundayOnOrBefore(reminder.date);
    if (!weekSunday) continue;
    entries.push({
      id: `reminder:${reminder.id}`,
      courseId: course.id,
      courseLabel: course.code?.trim() || course.name,
      title: reminder.title,
      columnKey: columnKeyForReminder(course, reminder),
      dueDate: reminder.date,
      weekSunday,
      ...(course.colorToken ? { colorToken: course.colorToken } : {}),
      source: "reminder",
      reminderId: reminder.id,
      completed: isSchoolWorkCompleted(reminder),
    });
  }

  return entries;
}

function resolveScheduleColumns(
  courses: readonly SchoolCourse[],
  entries: readonly SchoolScheduleEntry[]
): SchoolScheduleColumn[] {
  const columns: SchoolScheduleColumn[] = [];
  const seen = new Set<string>();

  function addColumn(key: string, label: string) {
    if (seen.has(key)) return;
    seen.add(key);
    columns.push({ key, label });
  }

  for (const course of courses) {
    for (const category of course.gradeCategories) {
      addColumn(categoryColumnKey(category.name), category.name.trim());
    }
  }

  for (const entry of entries) {
    if (seen.has(entry.columnKey)) continue;
    const fromKind = SCHOOL_REMINDER_KINDS.find((kind) => kindColumnKey(kind) === entry.columnKey);
    if (fromKind) {
      addColumn(entry.columnKey, SCHOOL_REMINDER_KIND_LABELS[fromKind]);
      continue;
    }
    addColumn(entry.columnKey, prettifyColumnKey(entry.columnKey));
  }

  if (columns.length === 0) {
    addColumn("work", "Work");
  }

  return columns;
}

function columnKeyForGradedItem(
  course: SchoolCourse,
  item: SchoolGradedItem,
  reminder: SchoolReminder | undefined
): string {
  const category = item.categoryId
    ? course.gradeCategories.find((entry) => entry.id === item.categoryId)
    : undefined;
  if (category) return categoryColumnKey(category.name);
  if (reminder) return columnKeyForReminder(course, reminder);
  return "other";
}

function columnKeyForReminder(course: SchoolCourse, reminder: SchoolReminder): string {
  const matched = matchKindToCategory(course.gradeCategories, reminder.kind);
  if (matched) return categoryColumnKey(matched.name);
  return kindColumnKey(reminder.kind);
}

function matchKindToCategory(
  categories: readonly SchoolGradeCategory[],
  kind: SchoolReminderKind
): SchoolGradeCategory | undefined {
  const aliases = COLUMN_SYNONYM_GROUPS.find((group) => group.includes(kind)) ?? [kind];
  return categories.find((category) => {
    const compact = compactName(category.name);
    const canonical = canonicalColumnKey(compact);
    return aliases.includes(compact) || aliases.includes(canonical);
  });
}

function categoryColumnKey(name: string): string {
  return compactName(name) || "other";
}

function canonicalColumnKey(compact: string): string {
  if (!compact) return "other";
  for (const group of COLUMN_SYNONYM_GROUPS) {
    if (group.includes(compact)) return group[0]!;
  }
  return compact;
}

function kindColumnKey(kind: SchoolReminderKind): string {
  return kind;
}

function compactName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function prettifyColumnKey(key: string): string {
  if (!key) return "Other";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function gradesSundayForSeason(season: SchoolAcademicSeason, year: number): string {
  if (season === "fall") return nthWeekdayOfMonth(year, 12, 0, 3);
  if (season === "spring") return nthWeekdayOfMonth(year, 5, 0, 2);
  return lastWeekdayOfMonth(year, 7, 0);
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): string {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return formatDateKey(year, month, day);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const last = new Date(year, month, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  last.setDate(last.getDate() - offset);
  return formatDateKey(last.getFullYear(), last.getMonth() + 1, last.getDate());
}

function addDays(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + days);
  return formatDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const LAYOUT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function timelineGroupColumnKey(groupId: string): string {
  return `group:${groupId}`;
}

export function isSchoolTimelineLayoutEmpty(layout: SchoolTimelineLayout | undefined): boolean {
  if (!layout) return true;
  return (
    layout.columnGroups.length === 0 &&
    Object.keys(layout.columnLabels).length === 0 &&
    Object.keys(layout.rowLabels).length === 0
  );
}

export function cloneSchoolTimelineLayout(
  layout?: SchoolTimelineLayout
): SchoolTimelineLayout {
  const source = layout ?? EMPTY_SCHOOL_TIMELINE_LAYOUT;
  return {
    columnGroups: source.columnGroups.map((group) => ({
      id: group.id,
      memberKeys: [...group.memberKeys],
      ...(group.label ? { label: group.label } : {}),
    })),
    columnLabels: { ...source.columnLabels },
    rowLabels: { ...source.rowLabels },
  };
}

/** Lenient parse for localStorage; drops invalid fields instead of throwing. */
export function normalizeSchoolTimelineLayout(raw: unknown): SchoolTimelineLayout | undefined {
  try {
    const parsed = parseSchoolTimelineLayout(raw);
    return isSchoolTimelineLayoutEmpty(parsed) ? undefined : parsed;
  } catch {
    return undefined;
  }
}

export function parseSchoolTimelineLayout(raw: unknown): SchoolTimelineLayout {
  if (raw === undefined || raw === null) return cloneSchoolTimelineLayout();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("schoolTimelineLayout must be an object");
  }
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== "columnGroups" && key !== "columnLabels" && key !== "rowLabels") {
      throw new Error(`Unknown schoolTimelineLayout field "${key}"`);
    }
  }

  const columnGroups: SchoolTimelineColumnGroup[] = [];
  if (input.columnGroups !== undefined) {
    if (!Array.isArray(input.columnGroups)) {
      throw new Error("schoolTimelineLayout.columnGroups must be an array");
    }
    if (input.columnGroups.length > TIMELINE_GROUP_MAX) {
      throw new Error("schoolTimelineLayout.columnGroups is too long");
    }
    const seenIds = new Set<string>();
    for (const item of input.columnGroups) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("schoolTimelineLayout.columnGroups must contain objects");
      }
      const group = item as Record<string, unknown>;
      if (typeof group.id !== "string" || !LAYOUT_UUID_RE.test(group.id)) {
        throw new Error("schoolTimelineLayout.columnGroups.id is invalid");
      }
      if (seenIds.has(group.id)) throw new Error("Duplicate timeline column group id");
      seenIds.add(group.id);
      if (!Array.isArray(group.memberKeys) || group.memberKeys.length < 2) {
        throw new Error("schoolTimelineLayout.columnGroups.memberKeys needs at least two keys");
      }
      const memberKeys: string[] = [];
      for (const member of group.memberKeys) {
        if (typeof member !== "string" || !isTimelineColumnKey(member)) {
          throw new Error("schoolTimelineLayout.columnGroups.memberKeys is invalid");
        }
        if (!memberKeys.includes(member)) memberKeys.push(member);
      }
      if (memberKeys.length < 2) {
        throw new Error("schoolTimelineLayout.columnGroups.memberKeys needs at least two keys");
      }
      const next: SchoolTimelineColumnGroup = { id: group.id, memberKeys };
      if (group.label !== undefined) {
        if (typeof group.label !== "string") {
          throw new Error("schoolTimelineLayout.columnGroups.label is invalid");
        }
        const label = sanitizeTimelineLabel(group.label);
        if (label) next.label = label;
      }
      columnGroups.push(next);
    }
  }

  const columnLabels = parseLabelMap(input.columnLabels, "columnLabels", isTimelineColumnKey);
  const rowLabels = parseLabelMap(input.rowLabels, "rowLabels", (key) => Boolean(parseDateKey(key)));
  return { columnGroups, columnLabels, rowLabels };
}

export function applySchoolTimelineLayout(
  schedule: SchoolSemesterSchedule,
  layout?: SchoolTimelineLayout
): SchoolTimelineView {
  const originalByKey = new Map(schedule.columns.map((column) => [column.key, column]));
  const consumed = new Set<string>();
  const columns: SchoolTimelineDisplayColumn[] = [];

  for (const column of schedule.columns) {
    if (consumed.has(column.key)) continue;
    const group = (layout?.columnGroups ?? []).find((entry) =>
      entry.memberKeys.includes(column.key)
    );
    if (group) {
      const memberKeys = group.memberKeys.filter((key) => originalByKey.has(key));
      if (memberKeys.length === 0) continue;
      const originalLabel = memberKeys
        .map((key) => originalByKey.get(key)?.label ?? key)
        .join(" / ");
      const custom = group.label?.trim();
      columns.push({
        key: timelineGroupColumnKey(group.id),
        label: custom || originalLabel,
        originalLabel,
        memberKeys,
        isMerged: memberKeys.length > 1,
        isRenamed: Boolean(custom) && custom !== originalLabel,
        groupId: group.id,
      });
      for (const key of memberKeys) consumed.add(key);
      continue;
    }
    const custom = layout?.columnLabels[column.key]?.trim();
    columns.push({
      key: column.key,
      label: custom || column.label,
      originalLabel: column.label,
      memberKeys: [column.key],
      isMerged: false,
      isRenamed: Boolean(custom) && custom !== column.label,
    });
  }

  const weeks: SchoolTimelineDisplayWeek[] = schedule.weeks.map((week) => {
    const originalDueLabel = formatSchoolSundayDate(week.sundayDate);
    const custom = layout?.rowLabels[week.sundayDate]?.trim();
    const entriesByColumn: Record<string, SchoolScheduleEntry[]> = {};
    for (const column of columns) {
      entriesByColumn[column.key] = column.memberKeys.flatMap(
        (key) => week.entriesByColumn[key] ?? []
      );
    }
    return {
      ...week,
      entriesByColumn,
      dueLabel: custom || originalDueLabel,
      originalDueLabel,
      isDueRenamed: Boolean(custom) && custom !== originalDueLabel,
    };
  });

  return { columns, weeks };
}

export function resolveTimelineMemberKeys(
  selectedKeys: readonly string[],
  displayColumns: readonly SchoolTimelineDisplayColumn[]
): string[] {
  const members: string[] = [];
  for (const key of selectedKeys) {
    const column = displayColumns.find((entry) => entry.key === key);
    const source = column?.memberKeys ?? [key];
    for (const member of source) {
      if (!members.includes(member) && isTimelineColumnKey(member)) members.push(member);
    }
  }
  return members;
}

export function mergeTimelineColumns(
  layout: SchoolTimelineLayout | undefined,
  memberKeys: string[],
  label: string,
  id: string
): SchoolTimelineLayout {
  const unique = uniqueKeys(memberKeys).filter(isTimelineColumnKey);
  if (unique.length < 2) return cloneSchoolTimelineLayout(layout);
  const next = cloneSchoolTimelineLayout(layout);
  const remaining: SchoolTimelineColumnGroup[] = [];
  const mergedMembers: string[] = [];
  for (const group of next.columnGroups) {
    if (group.memberKeys.some((key) => unique.includes(key))) {
      for (const key of group.memberKeys) {
        if (!mergedMembers.includes(key)) mergedMembers.push(key);
      }
      continue;
    }
    remaining.push(group);
  }
  for (const key of unique) {
    if (!mergedMembers.includes(key)) mergedMembers.push(key);
  }
  if (mergedMembers.length < 2 || remaining.length >= TIMELINE_GROUP_MAX) {
    return next;
  }
  const group: SchoolTimelineColumnGroup = { id, memberKeys: mergedMembers };
  const trimmed = sanitizeTimelineLabel(label);
  if (trimmed) group.label = trimmed;
  remaining.push(group);
  next.columnGroups = remaining;
  for (const key of mergedMembers) delete next.columnLabels[key];
  return next;
}

export function revertTimelineColumnMerge(
  layout: SchoolTimelineLayout | undefined,
  groupId: string
): SchoolTimelineLayout {
  const next = cloneSchoolTimelineLayout(layout);
  next.columnGroups = next.columnGroups.filter((group) => group.id !== groupId);
  return next;
}

export function renameTimelineColumn(
  layout: SchoolTimelineLayout | undefined,
  columnKey: string,
  label: string,
  displayColumns: readonly SchoolTimelineDisplayColumn[]
): SchoolTimelineLayout {
  const next = cloneSchoolTimelineLayout(layout);
  const trimmed = sanitizeTimelineLabel(label);
  const column = displayColumns.find((entry) => entry.key === columnKey);
  if (!column) return next;
  if (column.groupId) {
    next.columnGroups = next.columnGroups.map((group) => {
      if (group.id !== column.groupId) return group;
      if (!trimmed || trimmed === column.originalLabel) {
        const copy = { ...group };
        delete copy.label;
        return copy;
      }
      return { ...group, label: trimmed };
    });
    return next;
  }
  if (!trimmed || trimmed === column.originalLabel) {
    delete next.columnLabels[columnKey];
  } else {
    next.columnLabels[columnKey] = trimmed;
  }
  return next;
}

export function revertTimelineColumnName(
  layout: SchoolTimelineLayout | undefined,
  columnKey: string,
  displayColumns: readonly SchoolTimelineDisplayColumn[]
): SchoolTimelineLayout {
  return renameTimelineColumn(layout, columnKey, "", displayColumns);
}

export function renameTimelineRow(
  layout: SchoolTimelineLayout | undefined,
  sundayDate: string,
  label: string,
  originalDueLabel: string
): SchoolTimelineLayout {
  const next = cloneSchoolTimelineLayout(layout);
  const trimmed = sanitizeTimelineLabel(label);
  if (!parseDateKey(sundayDate)) return next;
  if (!trimmed || trimmed === originalDueLabel) {
    delete next.rowLabels[sundayDate];
  } else {
    next.rowLabels[sundayDate] = trimmed;
  }
  return next;
}

export function revertTimelineRowName(
  layout: SchoolTimelineLayout | undefined,
  sundayDate: string
): SchoolTimelineLayout {
  const next = cloneSchoolTimelineLayout(layout);
  delete next.rowLabels[sundayDate];
  return next;
}

function parseLabelMap(
  raw: unknown,
  field: string,
  keyOk: (key: string) => boolean
): Record<string, string> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`schoolTimelineLayout.${field} must be an object`);
  }
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!keyOk(key) || key.length > TIMELINE_KEY_MAX) {
      throw new Error(`schoolTimelineLayout.${field} has an invalid key`);
    }
    if (typeof value !== "string") {
      throw new Error(`schoolTimelineLayout.${field} values must be strings`);
    }
    const label = sanitizeTimelineLabel(value);
    if (label) labels[key] = label;
  }
  return labels;
}

function isTimelineColumnKey(value: string): boolean {
  if (value.length === 0 || value.length > TIMELINE_KEY_MAX) return false;
  return /^[a-z0-9_-]+$/i.test(value);
}

function sanitizeTimelineLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, TIMELINE_LABEL_MAX);
}

function uniqueKeys(keys: readonly string[]): string[] {
  const result: string[] = [];
  for (const key of keys) {
    if (!result.includes(key)) result.push(key);
  }
  return result;
}
