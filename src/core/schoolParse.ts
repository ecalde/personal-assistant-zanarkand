/**
 * Deterministic school paste ingest (Phase 57).
 *
 * Auto-detects Canvas weight tables, Canvas assignment lists, or messy
 * syllabus/announcement prose. Returns suggestions only — never writes
 * course/reminder/grade rows until the caller applies approved items.
 */

import type {
  SchoolCourse,
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
import {
  createSchoolGradedItem,
  createSchoolLink,
  createSchoolReminder,
  isSchoolDateKey,
  isSchoolReminderKind,
  isSchoolStaffRole,
  normalizeSchoolTimeInput,
  normalizeSchoolTitle,
  reminderFingerprint,
} from "./school";

export const SCHOOL_INGEST_MAX_CHARS = 100_000;

export const DUPLICATE_INGEST_WARNING = "This may already exist — create anyway?";

export const SCHOOL_PASTE_KIND_LABELS: Record<SchoolPasteKind, string> = {
  weightTable: "Grade weights",
  assignmentTable: "Assignment list",
  prose: "Syllabus / announcement",
};

export type SchoolPasteKind = "weightTable" | "assignmentTable" | "prose";

export type SchoolIngestLinkDraft = {
  url: string;
  label: string;
};

type SuggestionBase = {
  id: string;
  selected: boolean;
  warning?: string;
};

export type SchoolGradeCategorySuggestion = SuggestionBase & {
  type: "gradeCategory";
  name: string;
  weightPercent: number;
  extraCredit?: boolean;
  existingCategoryId?: string;
};

export type SchoolWorkItemSuggestion = SuggestionBase & {
  type: "workItem";
  title: string;
  kind: SchoolReminderKind;
  date?: string;
  startTime?: string;
  categoryName?: string;
  maxScore?: number;
  extraCredit?: boolean;
  notes?: string;
  links: SchoolIngestLinkDraft[];
  includeGradedItem: boolean;
  existingReminderId?: string;
  existingGradedItemId?: string;
};

export type SchoolStaffSuggestion = SuggestionBase & {
  type: "staff";
  role: SchoolStaffRole;
  name: string;
  email?: string;
  notes?: string;
  existingStaffId?: string;
};

export type SchoolOfficeHoursSuggestion = SuggestionBase & {
  type: "officeHours";
  who?: string;
  whenText: string;
  locationOrLink?: string;
};

export type SchoolLatePolicySuggestion = SuggestionBase & {
  type: "latePolicy";
  summary: string;
  lateDaysAllowed?: number;
  deductionPercentPerDay?: number;
  notes?: string;
};

export type SchoolNotesSuggestion = SuggestionBase & {
  type: "extraCreditNotes" | "scoringNotes";
  notes: string;
};

export type SchoolIngestSuggestion =
  | SchoolGradeCategorySuggestion
  | SchoolWorkItemSuggestion
  | SchoolStaffSuggestion
  | SchoolOfficeHoursSuggestion
  | SchoolLatePolicySuggestion
  | SchoolNotesSuggestion;

export type SchoolParseContext = {
  course: SchoolCourse;
  reminders?: readonly SchoolReminder[];
  gradedItems?: readonly SchoolGradedItem[];
  referenceYear: number;
  suggestionId?: () => string;
};

export type SchoolParseResult = {
  kind: SchoolPasteKind;
  suggestions: SchoolIngestSuggestion[];
};

export type ApplySchoolIngestInput = {
  course: SchoolCourse;
  reminders: readonly SchoolReminder[];
  gradedItems: readonly SchoolGradedItem[];
  suggestions: readonly SchoolIngestSuggestion[];
};

export type ApplySchoolIngestResult = {
  course: SchoolCourse;
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SKIP_CATEGORY_NAMES = /^(total|letter\s*grade|overall)$/i;

const TITLE_STOP_WORDS = new Set(["the", "a", "an", "of", "for", "and", "to", "in", "on", "at"]);

const WEIGHT_ROW_RE = /^(.+?)\s+(\d+(?:\.\d+)?)\s*%\s*$/;

const DUE_LINE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?(?:\s+(?:by|at)\s+(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)))?/i;

const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

const TIME_RE = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/i;

const SCORE_LINE_RE = /^\/\s*(\d+(?:\.\d+)?)\s*$/;

const PTS_SCORE_RE = /^[-–—]\/\s*(\d+(?:\.\d+)?)\s*pts\b/i;

const AVAILABILITY_LINE_RE = /\b(?:not\s+)?available\s+until\b/i;

const DUE_PREFIX_RE = /^due\b/i;

const CANVAS_KIND_LABEL_RE =
  /^(quiz(?:zes)?|assignments?|discussions?|exams?|projects?|surveys?|homework|exercises?|readings?|ungraded)$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

const WORK_ITEM_RE =
  /\b(?:assignment\s+\d+|homework\s+\d+|hw\s*\d+|exercise\s+\d+|quiz\s+\d+|unit\s+quiz(?:zes)?|project\s+\d+|project\s+(?:pitch|report|presentation)|report\s+\d+|exam\s+\d+|(?:midterm|final)(?:\s+exam)?|readings?)\b/gi;

const SHARED_DUE_RE =
  /\b(?:all(?:\s+of)?\s+(?:these|the\s+)?(?:assignments|items|readings|work)?|everything(?:\s+here)?)\b[\s\S]{0,48}\bdue\b/i;

export function yearFromCourseTerm(term: string | undefined, fallbackYear: number): number {
  const match = term?.match(/\b(20\d{2})\b/);
  if (!match) return fallbackYear;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : fallbackYear;
}

export function detectSchoolPasteKind(text: string): SchoolPasteKind {
  const normalized = normalizePaste(text);
  const lines = toLines(normalized);
  const dueCount = lines.filter((line) => Boolean(parseDueFromText(line, 2026))).length;
  const scoreCount = lines.filter((line) => isScoreLine(line)).length;
  const header = lines.slice(0, 8).join(" ").toLowerCase();
  const hasAssignmentHeader = /\bname\b/.test(header) && /\bdue\b/.test(header);
  const looksLikeProse = pasteLooksLikeProse(normalized);
  const looksLikeWeights = looksLikeWeightTable(lines, normalized);
  const looksLikeAssignments =
    hasAssignmentHeader ||
    (dueCount >= 3 && scoreCount >= 2) ||
    looksLikeCanvasAssignmentsIndex(lines);

  if (looksLikeWeights && !looksLikeAssignments && !looksLikeProse) return "weightTable";
  if (looksLikeAssignments) return "assignmentTable";
  if (looksLikeWeights && !looksLikeProse) return "weightTable";
  return "prose";
}

export function parseSchoolPaste(text: string, context: SchoolParseContext): SchoolParseResult {
  const normalized = normalizePaste(text).trim();
  const kind = detectSchoolPasteKind(normalized);
  const ids = createSuggestionIds(context.suggestionId);
  let suggestions: SchoolIngestSuggestion[] = [];

  if (!normalized) {
    return { kind: "prose", suggestions: [] };
  }

  if (kind === "weightTable") {
    suggestions = parseWeightTable(normalized, ids);
  } else if (kind === "assignmentTable") {
    suggestions = [
      ...parseWeightTable(normalized, ids),
      ...parseAssignmentTable(normalized, context.referenceYear, ids),
    ];
  } else {
    suggestions = parseProse(normalized, context.referenceYear, ids);
  }

  return {
    kind,
    suggestions: annotateSchoolIngestDuplicates(suggestions, {
      course: context.course,
      reminders: context.reminders ?? [],
      gradedItems: context.gradedItems ?? [],
    }),
  };
}

export function annotateSchoolIngestDuplicates(
  suggestions: readonly SchoolIngestSuggestion[],
  existing: {
    course: SchoolCourse;
    reminders: readonly SchoolReminder[];
    gradedItems: readonly SchoolGradedItem[];
  }
): SchoolIngestSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.type === "gradeCategory") {
      const match = existing.course.gradeCategories.find(
        (category) => normalizeSchoolTitle(category.name) === normalizeSchoolTitle(suggestion.name)
      );
      if (!match) return suggestion;
      return withDuplicate(suggestion, { existingCategoryId: match.id });
    }
    if (suggestion.type === "staff") {
      const match = existing.course.staff.find(
        (member) => normalizeSchoolTitle(member.name) === normalizeSchoolTitle(suggestion.name)
      );
      if (!match) return suggestion;
      return withDuplicate(suggestion, { existingStaffId: match.id });
    }
    if (suggestion.type !== "workItem") return suggestion;

    const reminderMatch = findDuplicateReminder(suggestion, existing.reminders);
    const gradedMatch = existing.gradedItems.find(
      (item) =>
        normalizeSchoolTitle(item.name) === normalizeSchoolTitle(suggestion.title) &&
        (!suggestion.date || !item.dueDate || item.dueDate === suggestion.date)
    );
    if (!reminderMatch && !gradedMatch) return suggestion;
    return withDuplicate(suggestion, {
      existingReminderId: reminderMatch?.id,
      existingGradedItemId: gradedMatch?.id,
    });
  });
}

export function applySchoolIngestSuggestions(
  input: ApplySchoolIngestInput,
  options: { id: () => string; nowIso: string }
): ApplySchoolIngestResult {
  let course: SchoolCourse = {
    ...input.course,
    staff: [...input.course.staff],
    officeHours: [...input.course.officeHours],
    gradeCategories: [...input.course.gradeCategories],
    updatedAtIso: options.nowIso,
  };
  const reminders = [...input.reminders];
  const gradedItems = [...input.gradedItems];

  const approved = input.suggestions.filter((suggestion) => suggestion.selected);

  for (const suggestion of approved) {
    if (suggestion.type !== "gradeCategory") continue;
    const name = suggestion.name.trim();
    if (!name || !Number.isFinite(suggestion.weightPercent)) continue;
    const category: SchoolGradeCategory = {
      id: options.id(),
      name,
      weightPercent: suggestion.weightPercent,
    };
    if (suggestion.extraCredit) category.extraCredit = true;
    course.gradeCategories = [...course.gradeCategories, category];
  }

  for (const suggestion of approved) {
    if (suggestion.type === "staff") {
      const name = suggestion.name.trim();
      if (!name || !isSchoolStaffRole(suggestion.role)) continue;
      const member: SchoolStaffMember = {
        id: options.id(),
        role: suggestion.role,
        name,
      };
      if (suggestion.email?.trim()) member.email = suggestion.email.trim();
      if (suggestion.notes?.trim()) member.notes = suggestion.notes.trim();
      course.staff = [...course.staff, member];
      continue;
    }
    if (suggestion.type === "officeHours") {
      const whenText = suggestion.whenText.trim();
      if (!whenText) continue;
      const entry: SchoolOfficeHours = { id: options.id(), whenText };
      if (suggestion.who?.trim()) entry.who = suggestion.who.trim();
      if (suggestion.locationOrLink?.trim()) {
        entry.locationOrLink = suggestion.locationOrLink.trim();
      }
      course.officeHours = [...course.officeHours, entry];
      continue;
    }
    if (suggestion.type === "latePolicy") {
      const summary = suggestion.summary.trim();
      if (!summary) continue;
      const latePolicy: SchoolLatePolicy = {
        ...(course.latePolicy ?? {}),
        summary,
      };
      if (suggestion.lateDaysAllowed !== undefined) {
        latePolicy.lateDaysAllowed = suggestion.lateDaysAllowed;
      }
      if (suggestion.deductionPercentPerDay !== undefined) {
        latePolicy.deductionPercentPerDay = suggestion.deductionPercentPerDay;
      }
      if (suggestion.notes?.trim()) latePolicy.notes = suggestion.notes.trim();
      course.latePolicy = latePolicy;
      continue;
    }
    if (suggestion.type === "extraCreditNotes" || suggestion.type === "scoringNotes") {
      const notes = suggestion.notes.trim();
      if (!notes) continue;
      const key = suggestion.type;
      const previous = course[key]?.trim();
      course = {
        ...course,
        [key]: previous && previous !== notes ? `${previous}\n${notes}` : notes,
      };
    }
  }

  for (const suggestion of approved) {
    if (suggestion.type !== "workItem") continue;
    const title = suggestion.title.trim();
    if (!title || !isSchoolReminderKind(suggestion.kind)) continue;

    let reminderId: string | undefined;
    const date = suggestion.date?.trim();
    if (date && isSchoolDateKey(date)) {
      const reminderInput = {
        courseId: course.id,
        kind: suggestion.kind,
        title,
        date,
        links: toSchoolLinks(suggestion.links),
      };
      const reminder = createSchoolReminder(
        {
          ...reminderInput,
          ...(suggestion.startTime ? { startTime: suggestion.startTime } : {}),
          ...(suggestion.notes?.trim() ? { notes: suggestion.notes.trim() } : {}),
        },
        { id: options.id(), nowIso: options.nowIso }
      );
      reminders.push(reminder);
      reminderId = reminder.id;
    }

    if (!suggestion.includeGradedItem) continue;
    const categoryId = matchCategoryId(course.gradeCategories, suggestion.categoryName);
    const item = createSchoolGradedItem(
      {
        courseId: course.id,
        name: title,
        ...(categoryId ? { categoryId } : {}),
        ...(reminderId ? { reminderId } : {}),
        ...(date && isSchoolDateKey(date) ? { dueDate: date } : {}),
        ...(suggestion.startTime ? { dueTime: suggestion.startTime } : {}),
        ...(suggestion.maxScore !== undefined ? { maxScore: suggestion.maxScore } : {}),
        ...(suggestion.extraCredit ? { extraCredit: true } : {}),
      },
      { id: options.id(), nowIso: options.nowIso }
    );
    gradedItems.push(item);
  }

  return { course, reminders, gradedItems };
}

export function validateSchoolIngestApprovals(
  suggestions: readonly SchoolIngestSuggestion[]
): string | null {
  const approved = suggestions.filter((suggestion) => suggestion.selected);
  if (approved.length === 0) return "Select at least one suggestion to approve.";

  for (const suggestion of approved) {
    if (suggestion.type === "gradeCategory") {
      if (!suggestion.name.trim()) return "Each approved grade category needs a name.";
      if (!Number.isFinite(suggestion.weightPercent) || suggestion.weightPercent < 0) {
        return `Grade category "${suggestion.name.trim()}" needs a weight of 0 or greater.`;
      }
      continue;
    }
    if (suggestion.type === "workItem") {
      if (!suggestion.title.trim()) return "Each approved reminder needs a title.";
      if (!isSchoolReminderKind(suggestion.kind)) return "Reminder kind is invalid.";
      if (suggestion.date && !isSchoolDateKey(suggestion.date)) {
        return `"${suggestion.title.trim()}" needs a valid due date.`;
      }
      for (const link of suggestion.links) {
        if (!link.url.trim()) continue;
        if (!isHttpUrl(link.url)) {
          return `Link on "${suggestion.title.trim()}" must be an http or https URL.`;
        }
      }
      continue;
    }
    if (suggestion.type === "staff" && !suggestion.name.trim()) {
      return "Each approved staff member needs a name.";
    }
    if (suggestion.type === "officeHours" && !suggestion.whenText.trim()) {
      return "Each approved office-hours row needs a time.";
    }
    if (suggestion.type === "latePolicy" && !suggestion.summary.trim()) {
      return "Late policy needs a short summary.";
    }
    if (
      (suggestion.type === "extraCreditNotes" || suggestion.type === "scoringNotes") &&
      !suggestion.notes.trim()
    ) {
      return "Notes suggestions cannot be empty.";
    }
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeWeightTable(lines: string[], text: string): boolean {
  const weightCount = lines.filter((line) => Boolean(parseWeightRow(line))).length;
  const header = lines.slice(0, 8).join(" ").toLowerCase();
  const hasWeightHeader =
    (/\bgroup\b/.test(header) && /\bweight\b/.test(header)) ||
    /weighted by group/i.test(text);
  return hasWeightHeader || (weightCount >= 3 && /\btotal\b/i.test(text)) || weightCount >= 4;
}

function parseWeightTable(text: string, ids: () => string): SchoolIngestSuggestion[] {
  const suggestions: SchoolGradeCategorySuggestion[] = [];
  const seen = new Set<string>();
  for (const row of collectWeightRows(text)) {
    const key = normalizeSchoolTitle(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: ids(),
      type: "gradeCategory",
      selected: true,
      name: row.name,
      weightPercent: row.weightPercent,
      ...(row.extraCredit ? { extraCredit: true } : {}),
    });
  }
  return suggestions;
}

function collectWeightRows(text: string): Array<{
  name: string;
  weightPercent: number;
  extraCredit?: boolean;
}> {
  const lines = toLines(text);
  const rows: Array<{ name: string; weightPercent: number; extraCredit?: boolean }> = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseWeightRow(lines[i]!);
    if (!parsed) continue;
    rows.push(parsed);
    consumed.add(i);
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (consumed.has(i) || consumed.has(i + 1)) continue;
    const weightPercent = parseStandalonePercent(lines[i + 1]!);
    if (weightPercent === undefined) continue;
    const name = collapseSpaces(lines[i]!);
    if (!isPlausibleWeightName(name)) continue;
    rows.push({
      name,
      weightPercent,
      ...(/extra\s*credit/i.test(name) ? { extraCredit: true } : {}),
    });
    consumed.add(i);
    consumed.add(i + 1);
  }

  return rows;
}

function parseAssignmentTable(
  text: string,
  referenceYear: number,
  ids: () => string
): SchoolWorkItemSuggestion[] {
  const lines = toLines(text);
  const start = lines.findIndex((line) => /\bname\b/i.test(line) && /\bdue\b/i.test(line));
  const body = start >= 0 ? lines.slice(start + 1) : lines;
  const records = looksLikeCanvasAssignmentsIndex(body)
    ? parseCanvasIndexRecords(body, referenceYear)
    : parseAssignmentRecords(body, referenceYear);
  return mergeWorkItems(
    records.map((record) => workItemFromAssignment(record, ids()))
  );
}

function parseProse(
  text: string,
  referenceYear: number,
  ids: () => string
): SchoolIngestSuggestion[] {
  const suggestions: SchoolIngestSuggestion[] = [];
  suggestions.push(...parseWeightTable(text, ids));
  suggestions.push(...parseStaffFromProse(text, ids));
  suggestions.push(...parseOfficeHoursFromProse(text, ids));
  const late = parseLatePolicyFromProse(text, ids);
  if (late) suggestions.push(late);
  const extra = parseNoteSentences(
    text,
    /extra\s*credit/i,
    "extraCreditNotes",
    ids
  );
  if (extra) suggestions.push(extra);
  const scoring = parseNoteSentences(
    text,
    /\battempts?\b|\bdiscussion grades?\b|\bscoring\b/i,
    "scoringNotes",
    ids
  );
  if (scoring) suggestions.push(scoring);
  suggestions.push(...parseWorkItemsFromProse(text, referenceYear, ids));
  return suggestions;
}

function looksLikeCanvasAssignmentsIndex(lines: string[]): boolean {
  let duePrefixed = 0;
  let ptsScores = 0;
  let availability = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (DUE_PREFIX_RE.test(trimmed)) duePrefixed += 1;
    if (PTS_SCORE_RE.test(trimmed)) ptsScores += 1;
    if (AVAILABILITY_LINE_RE.test(trimmed)) availability += 1;
  }
  return duePrefixed >= 2 && (ptsScores >= 2 || availability >= 2);
}

function parseCanvasIndexRecords(lines: string[], referenceYear: number): AssignmentRecord[] {
  const records: AssignmentRecord[] = [];
  let pendingGroup: string | undefined;
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
    if (i >= lines.length) break;
    const line = lines[i]!.trim();
    if (isCanvasIndexMetadataLine(line)) {
      i += 1;
      continue;
    }
    if (CANVAS_KIND_LABEL_RE.test(line)) {
      pendingGroup = line;
      i += 1;
      continue;
    }

    const name = collapseSpaces(line);
    const group = collapseSpaces(pendingGroup ?? name);
    pendingGroup = undefined;
    i += 1;

    let due: ParsedDue | undefined;
    let maxScore: number | undefined;
    while (i < lines.length) {
      while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
      if (i >= lines.length) break;
      const next = lines[i]!.trim();
      if (isAvailabilityLine(next)) {
        i += 1;
        continue;
      }
      if (DUE_PREFIX_RE.test(next)) {
        due = parseDueFromText(next, referenceYear) ?? due;
        i += 1;
        continue;
      }
      if (isScoreLine(next)) {
        maxScore = parseScoreLine(next) ?? maxScore;
        i += 1;
        continue;
      }
      if (isCanvasIndexNoiseLine(next)) {
        i += 1;
        continue;
      }
      break;
    }

    if (!name) continue;
    records.push({
      name,
      group,
      date: due?.date,
      startTime: due?.time,
      maxScore,
    });
  }
  return records;
}

function parseAssignmentRecords(lines: string[], referenceYear: number): AssignmentRecord[] {
  const records: AssignmentRecord[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
    if (i >= lines.length) break;
    const nameLine = lines[i]!.trim();
    if (!nameLine || isDueLine(nameLine) || isScoreLine(nameLine)) {
      i += 1;
      continue;
    }
    i += 1;

    let group = nameLine;
    while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
    const peeked = i < lines.length ? lines[i]!.trim() : "";
    if (peeked && !isDueLine(peeked) && !isScoreLine(peeked)) {
      const afterGroup = nextNonBlank(lines, i + 1);
      if (
        afterGroup !== undefined &&
        (isDueLine(afterGroup) || isScoreLine(afterGroup) || looksLikeCategoryName(peeked, nameLine))
      ) {
        group = peeked;
        i += 1;
      }
    }

    while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
    let due: ParsedDue | undefined;
    if (i < lines.length && isDueLine(lines[i]!)) {
      due = parseDueFromText(lines[i]!, referenceYear);
      i += 1;
    }

    while (i < lines.length && isBlankLine(lines[i]!)) i += 1;
    let maxScore: number | undefined;
    if (i < lines.length && isScoreLine(lines[i]!)) {
      maxScore = parseScoreLine(lines[i]!);
      i += 1;
    }

    records.push({
      name: collapseSpaces(nameLine),
      group: collapseSpaces(group),
      date: due?.date,
      startTime: due?.time,
      maxScore,
    });
  }
  return records;
}

function workItemFromAssignment(record: AssignmentRecord, id: string): SchoolWorkItemSuggestion {
  const mapped = kindFromGroupOrTitle(record.group, record.name);
  return {
    id,
    type: "workItem",
    selected: true,
    title: record.name,
    kind: mapped.kind,
    links: [],
    includeGradedItem: true,
    ...(record.date ? { date: record.date } : {}),
    ...(record.startTime ? { startTime: record.startTime } : {}),
    ...(record.group ? { categoryName: record.group } : {}),
    ...(record.maxScore !== undefined ? { maxScore: record.maxScore } : {}),
    ...(mapped.extraCredit ? { extraCredit: true } : {}),
  };
}

function parseWorkItemsFromProse(
  text: string,
  referenceYear: number,
  ids: () => string
): SchoolWorkItemSuggestion[] {
  const chunks = splitProseChunks(text);
  const items: SchoolWorkItemSuggestion[] = [];
  for (const chunk of chunks) {
    items.push(...workItemsFromChunk(chunk, referenceYear, ids));
  }
  return mergeWorkItems(items);
}

function workItemsFromChunk(
  chunk: string,
  referenceYear: number,
  ids: () => string
): SchoolWorkItemSuggestion[] {
  const named = collectNamedWorkItems(chunk);
  const urls = collectUrls(chunk);
  if (named.length === 0) return [];

  const dateHits = collectDateHits(chunk, referenceYear);
  const sharedDue = SHARED_DUE_RE.test(chunk)
    ? parseDueFromText(chunk.match(SHARED_DUE_RE)?.[0] ?? chunk, referenceYear) ??
      dateHits[dateHits.length - 1]
    : undefined;

  return named.map((namedItem) => {
    const nearby = nearestDateAfter(namedItem.index, dateHits) ?? nearestDateAround(namedItem.index, dateHits);
    const due = nearby ?? sharedDue ?? (dateHits.length === 1 ? dateHits[0] : undefined);
    const itemUrls = urls.filter((url) => url.index >= namedItem.index);
    const nextNamed = named.find((other) => other.index > namedItem.index);
    const scopedUrls = nextNamed
      ? itemUrls.filter((url) => url.index < nextNamed.index)
      : itemUrls;
    const fallbackUrls =
      scopedUrls.length > 0
        ? scopedUrls
        : urls.filter((url) => {
            const owner = lastNamedBefore(url.index, named);
            return owner?.title === namedItem.title && owner.index === namedItem.index;
          });
    const mapped = kindFromGroupOrTitle(namedItem.title, namedItem.title);
    const includeGradedItem =
      mapped.kind === "assignment" ||
      mapped.kind === "quiz" ||
      mapped.kind === "exam" ||
      mapped.kind === "project";
    return {
      id: ids(),
      type: "workItem",
      selected: true,
      title: titleCaseWords(namedItem.title),
      kind: mapped.kind,
      includeGradedItem,
      links: fallbackUrls.map((url) => {
        const link = createSchoolLink(url.url);
        return { url: link.url, label: link.label };
      }),
      ...(due?.date ? { date: due.date } : {}),
      ...(due?.time ? { startTime: due.time } : {}),
      ...(mapped.extraCredit ? { extraCredit: true } : {}),
    };
  });
}

function parseStaffFromProse(text: string, ids: () => string): SchoolStaffSuggestion[] {
  const suggestions: SchoolStaffSuggestion[] = [];
  const seen = new Set<string>();
  const labeled =
    /(?:^|\n)\s*((?:professor|instructor|teacher|teaching assistants?|\btas?\b))(?:s)?\s*[:\-–]\s*([^\n]+)/gi;
  for (const match of text.matchAll(labeled)) {
    const role = staffRoleFromLabel(match[1] ?? "");
    const people = splitPeopleList(match[2] ?? "");
    for (const person of people) {
      const key = `${role}|${normalizeSchoolTitle(person.name)}`;
      if (!person.name || seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        id: ids(),
        type: "staff",
        selected: true,
        role,
        name: person.name,
        ...(person.email ? { email: person.email } : {}),
      });
    }
  }
  return suggestions;
}

function parseOfficeHoursFromProse(text: string, ids: () => string): SchoolOfficeHoursSuggestion[] {
  const suggestions: SchoolOfficeHoursSuggestion[] = [];
  const pattern =
    /(?:^|\n)\s*(?:((?:professor|instructor|ta|teaching assistant)s?)\s+)?(?:office\s*hours|\boh)\s*[:\-–]\s*([^\n]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const label = (match[1] ?? "").trim();
    const whenText = collapseSpaces(match[2] ?? "");
    if (!whenText) continue;
    const who = /professor|instructor/i.test(label)
      ? "Professor"
      : /\bta\b|teaching assistant/i.test(label)
        ? "TA"
        : undefined;
    suggestions.push({
      id: ids(),
      type: "officeHours",
      selected: true,
      whenText,
      ...(who ? { who } : {}),
    });
  }
  return suggestions;
}

function parseLatePolicyFromProse(
  text: string,
  ids: () => string
): SchoolLatePolicySuggestion | undefined {
  const sentences = splitSentences(text);
  const lateSentence = sentences.find((sentence) =>
    /\blate\b/i.test(sentence) &&
    (/\bday/i.test(sentence) || /\bpercent\b|\d+\s*%/i.test(sentence) || /\bdeduct/i.test(sentence))
  );
  if (!lateSentence) return undefined;
  const days =
    lateSentence.match(/\b(\d+)\s*days?\b/i) ??
    lateSentence.match(/\bup to\s+(\d+)\b/i);
  const percent = lateSentence.match(/(\d+(?:\.\d+)?)\s*%/);
  return {
    id: ids(),
    type: "latePolicy",
    selected: true,
    summary: collapseSpaces(lateSentence),
    ...(days ? { lateDaysAllowed: Number(days[1]) } : {}),
    ...(percent ? { deductionPercentPerDay: Number(percent[1]) } : {}),
  };
}

function parseNoteSentences(
  text: string,
  matcher: RegExp,
  type: SchoolNotesSuggestion["type"],
  ids: () => string
): SchoolNotesSuggestion | undefined {
  const notes = splitSentences(text)
    .filter((sentence) => matcher.test(sentence))
    .map((sentence) => collapseSpaces(sentence));
  if (notes.length === 0) return undefined;
  return {
    id: ids(),
    type,
    selected: true,
    notes: notes.join(" "),
  };
}

function kindFromGroupOrTitle(
  group: string,
  title: string
): { kind: SchoolReminderKind; extraCredit: boolean } {
  const blob = `${group} ${title}`.toLowerCase();
  const extraCredit = /extra\s*credit/.test(blob);
  if (/\b(ungraded|not for grade)\b/.test(blob)) return { kind: "other", extraCredit };
  if (/\b(final|midterm|exam)\b/.test(blob) && !/\bsetup\b/.test(blob)) return { kind: "exam", extraCredit };
  if (/\bquiz/.test(blob)) return { kind: "quiz", extraCredit };
  if (/\b(project|milestone)\b/.test(blob)) return { kind: "project", extraCredit };
  if (/\bread/.test(blob) && !/\breport\b/.test(blob)) return { kind: "reading", extraCredit };
  if (/\bstudy\b/.test(blob)) return { kind: "study", extraCredit };
  if (/\b(ungraded|not for grade)\b/.test(blob)) return { kind: "other", extraCredit };
  return { kind: "assignment", extraCredit };
}

function parseWeightRow(line: string): { name: string; weightPercent: number; extraCredit?: boolean } | null {
  const match = WEIGHT_ROW_RE.exec(line.replace(/\t/g, " ").trim());
  if (!match) return null;
  const name = collapseSpaces(match[1] ?? "");
  if (!isPlausibleWeightName(name)) return null;
  const weightPercent = Number(match[2]);
  if (!Number.isFinite(weightPercent)) return null;
  return {
    name,
    weightPercent,
    ...(/extra\s*credit/i.test(name) ? { extraCredit: true } : {}),
  };
}

function parseStandalonePercent(line: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*%\s*$/.exec(line.replace(/\t/g, " ").trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function isPlausibleWeightName(name: string): boolean {
  const trimmed = collapseSpaces(name);
  if (!trimmed) return false;
  if (SKIP_CATEGORY_NAMES.test(trimmed) || /^group$/i.test(trimmed) || /^weight$/i.test(trimmed)) {
    return false;
  }
  if (trimmed.length > 80) return false;
  if (isDueLine(trimmed) || isScoreLine(trimmed) || DUE_PREFIX_RE.test(trimmed)) return false;
  if (AVAILABILITY_LINE_RE.test(trimmed)) return false;
  return true;
}

function parseDueFromText(text: string, referenceYear: number): ParsedDue | undefined {
  const monthMatch = DUE_LINE_RE.exec(text);
  if (monthMatch) {
    const month = MONTHS[monthMatch[1]!.toLowerCase()];
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? Number(monthMatch[3]) : referenceYear;
    const date = toDateKey(year, month, day);
    if (!date) return undefined;
    const time = monthMatch[4] ? normalizeClock(monthMatch[4]) : undefined;
    return time ? { date, time } : { date };
  }
  const numeric = NUMERIC_DATE_RE.exec(text);
  if (!numeric) return undefined;
  const month = Number(numeric[1]);
  const day = Number(numeric[2]);
  const rawYear = numeric[3] ? Number(numeric[3]) : referenceYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = toDateKey(year, month, day);
  if (!date) return undefined;
  const timeMatch = TIME_RE.exec(text);
  const time = timeMatch ? normalizeClock(timeMatch[0]) : undefined;
  return time ? { date, time } : { date };
}

function normalizeClock(raw: string): string | undefined {
  const match = TIME_RE.exec(raw.trim());
  if (!match) return normalizeSchoolTimeInput(raw);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]!.replace(/\./g, "").toLowerCase();
  if (period.startsWith("p") && hour < 12) hour += 12;
  if (period.startsWith("a") && hour === 12) hour = 0;
  return normalizeSchoolTimeInput(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
}

function toDateKey(year: number, month: number | undefined, day: number): string | undefined {
  if (!month || !Number.isInteger(day) || day < 1 || day > 31) return undefined;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isSchoolDateKey(value) ? value : undefined;
}

function isDueLine(line: string): boolean {
  return Boolean(parseDueFromText(line, 2026));
}

function isScoreLine(line: string): boolean {
  return parseScoreLine(line) !== undefined;
}

function parseScoreLine(line: string): number | undefined {
  const trimmed = line.trim();
  const slash = SCORE_LINE_RE.exec(trimmed);
  const pts = PTS_SCORE_RE.exec(trimmed);
  const match = slash ?? pts;
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function isAvailabilityLine(line: string): boolean {
  return AVAILABILITY_LINE_RE.test(line);
}

function isCanvasIndexNoiseLine(line: string): boolean {
  return (
    /no submission/i.test(line) ||
    /points possible/i.test(line) ||
    /submission progress/i.test(line)
  );
}

function isCanvasIndexMetadataLine(line: string): boolean {
  return (
    isAvailabilityLine(line) ||
    DUE_PREFIX_RE.test(line) ||
    isScoreLine(line) ||
    isCanvasIndexNoiseLine(line)
  );
}

function looksLikeCategoryName(line: string, assignmentName: string): boolean {
  if (normalizeSchoolTitle(line) === normalizeSchoolTitle(assignmentName)) return true;
  if (line.length > 48) return false;
  return /\b(quiz|exam|report|discussion|exercise|project|milestone|credit|ungraded|survey|reading|setup)\b/i.test(
    line
  );
}

function findDuplicateReminder(
  suggestion: SchoolWorkItemSuggestion,
  reminders: readonly SchoolReminder[]
): SchoolReminder | undefined {
  if (suggestion.date && isSchoolDateKey(suggestion.date)) {
    const fingerprint = reminderFingerprint(suggestion.kind, suggestion.title, suggestion.date);
    const exact = reminders.find(
      (reminder) =>
        reminder.fingerprint === fingerprint ||
        reminderFingerprint(reminder.kind, reminder.title, reminder.date) === fingerprint
    );
    if (exact) return exact;
  }
  return reminders.find((reminder) => {
    if (suggestion.date && reminder.date !== suggestion.date) return false;
    return titleTokenJaccard(reminder.title, suggestion.title) >= 0.75;
  });
}

function titleTokenJaccard(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function titleTokens(title: string): Set<string> {
  const tokens = normalizeSchoolTitle(title)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token));
  return new Set(tokens);
}

function mergeWorkItems(items: SchoolWorkItemSuggestion[]): SchoolWorkItemSuggestion[] {
  const merged: SchoolWorkItemSuggestion[] = [];
  for (const item of items) {
    const key = `${item.kind}|${normalizeSchoolTitle(item.title)}|${item.date ?? ""}`;
    const existing = merged.find(
      (row) => `${row.kind}|${normalizeSchoolTitle(row.title)}|${row.date ?? ""}` === key
    );
    if (!existing) {
      merged.push(item);
      continue;
    }
    existing.links = mergeLinks(existing.links, item.links);
    if (existing.maxScore === undefined && item.maxScore !== undefined) {
      existing.maxScore = item.maxScore;
    }
    if (!existing.startTime && item.startTime) existing.startTime = item.startTime;
    if (!existing.categoryName && item.categoryName) existing.categoryName = item.categoryName;
    if (item.includeGradedItem) existing.includeGradedItem = true;
  }
  return merged;
}

function mergeLinks(
  left: SchoolIngestLinkDraft[],
  right: SchoolIngestLinkDraft[]
): SchoolIngestLinkDraft[] {
  const seen = new Set(left.map((link) => link.url));
  const next = [...left];
  for (const link of right) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    next.push(link);
  }
  return next;
}

function matchCategoryId(
  categories: readonly SchoolGradeCategory[],
  categoryName: string | undefined
): string | undefined {
  if (!categoryName?.trim()) return undefined;
  const needle = normalizeSchoolTitle(categoryName);
  const exact = categories.find((category) => normalizeSchoolTitle(category.name) === needle);
  if (exact) return exact.id;
  const overlap = categories.find((category) => titleTokenJaccard(category.name, categoryName) >= 0.75);
  return overlap?.id;
}

function toSchoolLinks(links: readonly SchoolIngestLinkDraft[] | undefined): SchoolLink[] {
  const result: SchoolLink[] = [];
  for (const link of links ?? []) {
    const url = link.url.trim();
    if (!url || !isHttpUrl(url)) continue;
    result.push(createSchoolLink(url, link.label));
  }
  return result;
}

function withDuplicate<T extends SchoolIngestSuggestion>(
  suggestion: T,
  ids: Partial<T>
): T {
  return {
    ...suggestion,
    ...ids,
    selected: false,
    warning: DUPLICATE_INGEST_WARNING,
  };
}

function pasteLooksLikeProse(text: string): boolean {
  const longSentences = splitSentences(text).filter((sentence) => sentence.length >= 60).length;
  return (
    /office\s*hours/i.test(text) ||
    /professor|instructor|teaching assistant/i.test(text) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    longSentences >= 3
  );
}

function collectNamedWorkItems(chunk: string): Array<{ title: string; index: number }> {
  const found: Array<{ title: string; index: number }> = [];
  for (const match of chunk.matchAll(WORK_ITEM_RE)) {
    const title = collapseSpaces(match[0] ?? "");
    if (!title) continue;
    const index = match.index ?? 0;
    const window = chunk.slice(Math.max(0, index - 40), Math.min(chunk.length, index + 80));
    if (/\battempts?\b/i.test(window) && !/https?:\/\//i.test(window) && !DUE_LINE_RE.test(window)) {
      continue;
    }
    if (/\breadings?\b/i.test(title) && !/https?:\/\//i.test(chunk) && !DUE_LINE_RE.test(chunk)) {
      continue;
    }
    found.push({ title, index: match.index ?? 0 });
  }
  const unique: Array<{ title: string; index: number }> = [];
  for (const item of found) {
    const duplicate = unique.find(
      (row) =>
        normalizeSchoolTitle(row.title) === normalizeSchoolTitle(item.title) &&
        Math.abs(row.index - item.index) < 24
    );
    if (!duplicate) unique.push(item);
  }
  return unique;
}

function collectUrls(chunk: string): Array<{ url: string; index: number }> {
  const urls: Array<{ url: string; index: number }> = [];
  for (const match of chunk.matchAll(URL_RE)) {
    const url = (match[0] ?? "").replace(/[),.;]+$/g, "");
    if (!url) continue;
    urls.push({ url, index: match.index ?? 0 });
  }
  return urls;
}

function collectDateHits(
  chunk: string,
  referenceYear: number
): Array<ParsedDue & { index: number; source: DateHitSource }> {
  const hits: Array<ParsedDue & { index: number; source: DateHitSource }> = [];
  for (const match of chunk.matchAll(new RegExp(DUE_LINE_RE, "gi"))) {
    const parsed = parseDueFromText(match[0], referenceYear);
    if (!parsed) continue;
    const index = match.index ?? 0;
    hits.push({
      ...parsed,
      index,
      source: dateHitSource(chunk, index, match[0] ?? ""),
    });
  }
  return hits;
}

function dateHitSource(chunk: string, index: number, matchText: string): DateHitSource {
  const windowStart = Math.max(0, index - 48);
  const before = chunk.slice(windowStart, index + matchText.length);
  if (AVAILABILITY_LINE_RE.test(before)) return "availability";
  if (/\bdue\b/i.test(before)) return "due";
  return "other";
}

function pickPreferredDateHit(
  hits: Array<ParsedDue & { index: number; source: DateHitSource }>
): (ParsedDue & { index: number; source: DateHitSource }) | undefined {
  return hits.find((hit) => hit.source === "due") ?? hits.find((hit) => hit.source === "other") ?? hits[0];
}

function nearestDateAfter(
  index: number,
  hits: Array<ParsedDue & { index: number; source: DateHitSource }>
): (ParsedDue & { index: number; source: DateHitSource }) | undefined {
  return pickPreferredDateHit(
    hits.filter((hit) => hit.index >= index && hit.index - index < 240)
  );
}

function nearestDateAround(
  index: number,
  hits: Array<ParsedDue & { index: number; source: DateHitSource }>
): (ParsedDue & { index: number; source: DateHitSource }) | undefined {
  const nearby = hits
    .map((hit) => ({ hit, distance: Math.abs(hit.index - index) }))
    .filter((row) => row.distance < 120)
    .sort((left, right) => left.distance - right.distance);
  return pickPreferredDateHit(nearby.map((row) => row.hit));
}

function lastNamedBefore(
  index: number,
  named: Array<{ title: string; index: number }>
): { title: string; index: number } | undefined {
  return [...named].reverse().find((item) => item.index <= index);
}

function splitProseChunks(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function splitPeopleList(raw: string): Array<{ name: string; email?: string }> {
  return raw
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((part) => parsePerson(part))
    .filter((person): person is { name: string; email?: string } => Boolean(person?.name));
}

function parsePerson(raw: string): { name: string; email?: string } | undefined {
  const email = raw.match(EMAIL_RE)?.[0];
  const name = collapseSpaces(raw.replace(EMAIL_RE, "").replace(/[()<>]/g, ""));
  if (!name && !email) return undefined;
  if (!name && email) return { name: email.split("@")[0] ?? email, email };
  return email ? { name, email } : { name };
}

function staffRoleFromLabel(label: string): SchoolStaffRole {
  if (/ta|teaching assistant/i.test(label)) return "ta";
  if (/professor|instructor|teacher/i.test(label)) return "professor";
  return "other";
}

function titleCaseWords(value: string): string {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function nextNonBlank(lines: string[], start: number): string | undefined {
  for (let i = start; i < lines.length; i += 1) {
    if (!isBlankLine(lines[i]!)) return lines[i]!.trim();
  }
  return undefined;
}

function isBlankLine(line: string): boolean {
  return line.replace(/[\t ]/g, "").length === 0;
}

function toLines(text: string): string[] {
  return text.split("\n");
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePaste(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createSuggestionIds(factory?: () => string): () => string {
  if (factory) return factory;
  let index = 0;
  return () => `sug-${++index}`;
}

type ParsedDue = {
  date: string;
  time?: string;
};

type DateHitSource = "due" | "availability" | "other";

type AssignmentRecord = {
  name: string;
  group: string;
  date?: string;
  startTime?: string;
  maxScore?: number;
};
