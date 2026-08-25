import type { SchoolLink, SchoolReminder, SchoolReminderKind } from "../../core/model";
import {
  createSchoolLink,
  isSchoolReminderKind,
  type CreateSchoolReminderInput,
} from "../../core/school";
import { isHttpUrl, parseOptionalDate, parseOptionalTime } from "./schoolFormShared";

export type SchoolLinkFormRow = {
  id: string;
  url: string;
  label: string;
};

export type SchoolReminderFormState = {
  kind: SchoolReminderKind;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  openDate: string;
  openTime: string;
  closeDate: string;
  closeTime: string;
  notes: string;
  links: SchoolLinkFormRow[];
};

export function emptyLinkFormRow(): SchoolLinkFormRow {
  return { id: crypto.randomUUID(), url: "", label: "" };
}

export function emptySchoolReminderFormState(date = ""): SchoolReminderFormState {
  return {
    kind: "assignment",
    title: "",
    date,
    startTime: "",
    endTime: "",
    openDate: "",
    openTime: "",
    closeDate: "",
    closeTime: "",
    notes: "",
    links: [],
  };
}

export function schoolReminderFormFromReminder(reminder: SchoolReminder): SchoolReminderFormState {
  return {
    kind: reminder.kind,
    title: reminder.title,
    date: reminder.date,
    startTime: reminder.startTime ?? "",
    endTime: reminder.endTime ?? "",
    openDate: reminder.openDate ?? "",
    openTime: reminder.openTime ?? "",
    closeDate: reminder.closeDate ?? "",
    closeTime: reminder.closeTime ?? "",
    notes: reminder.notes ?? "",
    links: reminder.links.map((link) => ({
      id: crypto.randomUUID(),
      url: link.url,
      label: link.label,
    })),
  };
}

export function validateSchoolReminderForm(form: SchoolReminderFormState): string | null {
  if (!form.title.trim()) return "Reminder title is required.";
  if (!isSchoolReminderKind(form.kind)) return "Reminder kind is invalid.";

  const date = parseOptionalDate(form.date, "Due date");
  if (!date.ok) return date.error;
  if (!date.value) return "Due date is required.";

  const startTime = parseOptionalTime(form.startTime, "Start time");
  if (!startTime.ok) return startTime.error;
  const endTime = parseOptionalTime(form.endTime, "End time");
  if (!endTime.ok) return endTime.error;
  if (endTime.value && !startTime.value) return "Start time is required when end time is set.";
  if (startTime.value && endTime.value && endTime.value <= startTime.value) {
    return "End time must be after start time.";
  }

  const openDate = parseOptionalDate(form.openDate, "Opens date");
  if (!openDate.ok) return openDate.error;
  const openTime = parseOptionalTime(form.openTime, "Opens time");
  if (!openTime.ok) return openTime.error;
  if (openTime.value && !openDate.value) return "Opens date is required when opens time is set.";

  const closeDate = parseOptionalDate(form.closeDate, "Closes date");
  if (!closeDate.ok) return closeDate.error;
  const closeTime = parseOptionalTime(form.closeTime, "Closes time");
  if (!closeTime.ok) return closeTime.error;
  if (closeTime.value && !closeDate.value) return "Closes date is required when closes time is set.";

  for (let i = 0; i < form.links.length; i += 1) {
    const url = form.links[i]!.url.trim();
    if (!url) continue;
    if (!isHttpUrl(url)) return `Link ${i + 1} must be an http or https URL.`;
  }

  return null;
}

export function schoolReminderPayloadFromForm(
  form: SchoolReminderFormState,
  courseId: string
): CreateSchoolReminderInput {
  const links: SchoolLink[] = [];
  for (const row of form.links) {
    const url = row.url.trim();
    if (!url) continue;
    links.push(createSchoolLink(url, row.label));
  }

  const startTime = parseOptionalTime(form.startTime, "Start time");
  const endTime = parseOptionalTime(form.endTime, "End time");
  const openDate = parseOptionalDate(form.openDate, "Opens date");
  const openTime = parseOptionalTime(form.openTime, "Opens time");
  const closeDate = parseOptionalDate(form.closeDate, "Closes date");
  const closeTime = parseOptionalTime(form.closeTime, "Closes time");

  const input: CreateSchoolReminderInput = {
    courseId,
    kind: form.kind,
    title: form.title.trim(),
    date: form.date.trim(),
    links,
  };
  if (startTime.ok && startTime.value) input.startTime = startTime.value;
  if (endTime.ok && endTime.value) input.endTime = endTime.value;
  if (openDate.ok && openDate.value) input.openDate = openDate.value;
  if (openTime.ok && openTime.value) input.openTime = openTime.value;
  if (closeDate.ok && closeDate.value) input.closeDate = closeDate.value;
  if (closeTime.ok && closeTime.value) input.closeTime = closeTime.value;
  if (form.notes.trim()) input.notes = form.notes.trim();
  return input;
}
