import type {
  SchoolCourse,
  SchoolGradeCategory,
  SchoolLatePolicy,
  SchoolOfficeHours,
  SchoolStaffMember,
  SchoolStaffRole,
} from "../../core/model";
import {
  DEFAULT_SCHOOL_TIMEZONE,
  isSchoolStaffRole,
  isValidIanaTimeZone,
  type CreateSchoolCourseInput,
} from "../../core/school";
import {
  parseOptionalNonNegativeInteger,
  parseOptionalNonNegativeNumber,
} from "./schoolFormShared";

export type SchoolStaffFormRow = {
  id: string;
  role: SchoolStaffRole;
  name: string;
  email: string;
  notes: string;
};

export type SchoolOfficeHoursFormRow = {
  id: string;
  who: string;
  whenText: string;
  locationOrLink: string;
};

export type SchoolGradeCategoryFormRow = {
  id: string;
  name: string;
  weightPercent: string;
  extraCredit: boolean;
};

export type SchoolCourseFormState = {
  name: string;
  code: string;
  term: string;
  timezone: string;
  notes: string;
  extraCreditNotes: string;
  scoringNotes: string;
  lateSummary: string;
  lateDaysAllowed: string;
  deductionPercentPerDay: string;
  lateNotes: string;
  staff: SchoolStaffFormRow[];
  officeHours: SchoolOfficeHoursFormRow[];
  gradeCategories: SchoolGradeCategoryFormRow[];
};

export function emptyStaffFormRow(): SchoolStaffFormRow {
  return { id: crypto.randomUUID(), role: "professor", name: "", email: "", notes: "" };
}

export function emptyOfficeHoursFormRow(): SchoolOfficeHoursFormRow {
  return { id: crypto.randomUUID(), who: "", whenText: "", locationOrLink: "" };
}

export function emptyGradeCategoryFormRow(): SchoolGradeCategoryFormRow {
  return { id: crypto.randomUUID(), name: "", weightPercent: "", extraCredit: false };
}

export function emptySchoolCourseFormState(): SchoolCourseFormState {
  return {
    name: "",
    code: "",
    term: "",
    timezone: DEFAULT_SCHOOL_TIMEZONE,
    notes: "",
    extraCreditNotes: "",
    scoringNotes: "",
    lateSummary: "",
    lateDaysAllowed: "",
    deductionPercentPerDay: "",
    lateNotes: "",
    staff: [],
    officeHours: [],
    gradeCategories: [],
  };
}

export function schoolCourseFormFromCourse(course: SchoolCourse): SchoolCourseFormState {
  return {
    name: course.name,
    code: course.code ?? "",
    term: course.term ?? "",
    timezone: course.timezone,
    notes: course.notes ?? "",
    extraCreditNotes: course.extraCreditNotes ?? "",
    scoringNotes: course.scoringNotes ?? "",
    lateSummary: course.latePolicy?.summary ?? "",
    lateDaysAllowed:
      course.latePolicy?.lateDaysAllowed !== undefined
        ? String(course.latePolicy.lateDaysAllowed)
        : "",
    deductionPercentPerDay:
      course.latePolicy?.deductionPercentPerDay !== undefined
        ? String(course.latePolicy.deductionPercentPerDay)
        : "",
    lateNotes: course.latePolicy?.notes ?? "",
    staff: course.staff.map((member) => ({
      id: member.id,
      role: member.role,
      name: member.name,
      email: member.email ?? "",
      notes: member.notes ?? "",
    })),
    officeHours: course.officeHours.map((entry) => ({
      id: entry.id,
      who: entry.who ?? "",
      whenText: entry.whenText,
      locationOrLink: entry.locationOrLink ?? "",
    })),
    gradeCategories: course.gradeCategories.map((category) => ({
      id: category.id,
      name: category.name,
      weightPercent: String(category.weightPercent),
      extraCredit: Boolean(category.extraCredit),
    })),
  };
}

export function validateSchoolCourseForm(form: SchoolCourseFormState): string | null {
  if (!form.name.trim()) return "Course name is required.";
  if (!isValidIanaTimeZone(form.timezone)) {
    return "Timezone must be a valid IANA zone such as America/New_York.";
  }

  for (let i = 0; i < form.staff.length; i += 1) {
    const row = form.staff[i]!;
    const filled = row.name.trim() || row.email.trim() || row.notes.trim();
    if (!filled) continue;
    if (!row.name.trim()) return `Staff ${i + 1}: name is required.`;
    if (!isSchoolStaffRole(row.role)) return `Staff ${i + 1}: role is invalid.`;
  }

  for (let i = 0; i < form.officeHours.length; i += 1) {
    const row = form.officeHours[i]!;
    const filled = row.who.trim() || row.whenText.trim() || row.locationOrLink.trim();
    if (!filled) continue;
    if (!row.whenText.trim()) return `Office hours ${i + 1}: when is required.`;
  }

  const lateTouched =
    form.lateSummary.trim() ||
    form.lateDaysAllowed.trim() ||
    form.deductionPercentPerDay.trim() ||
    form.lateNotes.trim();
  if (lateTouched && !form.lateSummary.trim()) {
    return "Late policy needs a short summary.";
  }
  const lateDays = parseOptionalNonNegativeInteger(form.lateDaysAllowed, "Late days allowed");
  if (!lateDays.ok) return lateDays.error;
  const deduction = parseOptionalNonNegativeNumber(
    form.deductionPercentPerDay,
    "Deduction percent per day"
  );
  if (!deduction.ok) return deduction.error;

  for (let i = 0; i < form.gradeCategories.length; i += 1) {
    const row = form.gradeCategories[i]!;
    const filled = row.name.trim() || row.weightPercent.trim() || row.extraCredit;
    if (!filled) continue;
    if (!row.name.trim()) return `Grade category ${i + 1}: name is required.`;
    const weight = parseOptionalNonNegativeNumber(row.weightPercent, `Category ${i + 1} weight`);
    if (!weight.ok) return weight.error;
    if (weight.value === undefined) return `Grade category ${i + 1}: weight is required.`;
  }

  return null;
}

export function schoolCoursePayloadFromForm(form: SchoolCourseFormState): CreateSchoolCourseInput {
  const staff: SchoolStaffMember[] = [];
  for (const row of form.staff) {
    if (!row.name.trim()) continue;
    const member: SchoolStaffMember = { id: row.id, role: row.role, name: row.name.trim() };
    if (row.email.trim()) member.email = row.email.trim();
    if (row.notes.trim()) member.notes = row.notes.trim();
    staff.push(member);
  }

  const officeHours: SchoolOfficeHours[] = [];
  for (const row of form.officeHours) {
    if (!row.whenText.trim()) continue;
    const entry: SchoolOfficeHours = { id: row.id, whenText: row.whenText.trim() };
    if (row.who.trim()) entry.who = row.who.trim();
    if (row.locationOrLink.trim()) entry.locationOrLink = row.locationOrLink.trim();
    officeHours.push(entry);
  }

  const gradeCategories: SchoolGradeCategory[] = [];
  for (const row of form.gradeCategories) {
    if (!row.name.trim()) continue;
    const category: SchoolGradeCategory = {
      id: row.id,
      name: row.name.trim(),
      weightPercent: Number(row.weightPercent.trim()),
    };
    if (row.extraCredit) category.extraCredit = true;
    gradeCategories.push(category);
  }

  const input: CreateSchoolCourseInput = {
    name: form.name.trim(),
    timezone: form.timezone.trim(),
    staff,
    officeHours,
    gradeCategories,
  };
  if (form.code.trim()) input.code = form.code.trim();
  if (form.term.trim()) input.term = form.term.trim();
  if (form.notes.trim()) input.notes = form.notes.trim();
  if (form.extraCreditNotes.trim()) input.extraCreditNotes = form.extraCreditNotes.trim();
  if (form.scoringNotes.trim()) input.scoringNotes = form.scoringNotes.trim();

  if (form.lateSummary.trim()) {
    const latePolicy: SchoolLatePolicy = { summary: form.lateSummary.trim() };
    const lateDays = parseOptionalNonNegativeInteger(form.lateDaysAllowed, "Late days");
    const deduction = parseOptionalNonNegativeNumber(
      form.deductionPercentPerDay,
      "Deduction"
    );
    if (lateDays.ok && lateDays.value !== undefined) latePolicy.lateDaysAllowed = lateDays.value;
    if (deduction.ok && deduction.value !== undefined) {
      latePolicy.deductionPercentPerDay = deduction.value;
    }
    if (form.lateNotes.trim()) latePolicy.notes = form.lateNotes.trim();
    input.latePolicy = latePolicy;
  }

  return input;
}
