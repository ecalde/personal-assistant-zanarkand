import type { SchoolGradedItem } from "../../core/model";
import type { CreateSchoolGradedItemInput } from "../../core/school";
import {
  parseOptionalDate,
  parseOptionalNonNegativeNumber,
  parseOptionalTime,
} from "./schoolFormShared";

export type SchoolGradedItemFormState = {
  name: string;
  categoryId: string;
  reminderId: string;
  dueDate: string;
  dueTime: string;
  maxScore: string;
  score: string;
  extraCredit: boolean;
};

export function emptySchoolGradedItemFormState(): SchoolGradedItemFormState {
  return {
    name: "",
    categoryId: "",
    reminderId: "",
    dueDate: "",
    dueTime: "",
    maxScore: "",
    score: "",
    extraCredit: false,
  };
}

export function schoolGradedItemFormFromItem(item: SchoolGradedItem): SchoolGradedItemFormState {
  return {
    name: item.name,
    categoryId: item.categoryId ?? "",
    reminderId: item.reminderId ?? "",
    dueDate: item.dueDate ?? "",
    dueTime: item.dueTime ?? "",
    maxScore: item.maxScore !== undefined ? String(item.maxScore) : "",
    score: item.score !== undefined ? String(item.score) : "",
    extraCredit: Boolean(item.extraCredit),
  };
}

export function validateSchoolGradedItemForm(form: SchoolGradedItemFormState): string | null {
  if (!form.name.trim()) return "Graded item name is required.";
  const dueDate = parseOptionalDate(form.dueDate, "Due date");
  if (!dueDate.ok) return dueDate.error;
  const dueTime = parseOptionalTime(form.dueTime, "Due time");
  if (!dueTime.ok) return dueTime.error;
  if (dueTime.value && !dueDate.value) return "Due date is required when due time is set.";
  const maxScore = parseOptionalNonNegativeNumber(form.maxScore, "Max score");
  if (!maxScore.ok) return maxScore.error;
  const score = parseOptionalNonNegativeNumber(form.score, "Score");
  if (!score.ok) return score.error;
  if (score.value !== undefined && maxScore.value !== undefined && score.value > maxScore.value) {
    return "Score cannot be greater than max score.";
  }
  return null;
}

export function schoolGradedItemPayloadFromForm(
  form: SchoolGradedItemFormState,
  courseId: string
): CreateSchoolGradedItemInput {
  const dueDate = parseOptionalDate(form.dueDate, "Due date");
  const dueTime = parseOptionalTime(form.dueTime, "Due time");
  const maxScore = parseOptionalNonNegativeNumber(form.maxScore, "Max score");
  const score = parseOptionalNonNegativeNumber(form.score, "Score");

  const input: CreateSchoolGradedItemInput = {
    courseId,
    name: form.name.trim(),
  };
  if (form.categoryId.trim()) input.categoryId = form.categoryId.trim();
  if (form.reminderId.trim()) input.reminderId = form.reminderId.trim();
  if (dueDate.ok && dueDate.value) input.dueDate = dueDate.value;
  if (dueTime.ok && dueTime.value) input.dueTime = dueTime.value;
  if (maxScore.ok && maxScore.value !== undefined) input.maxScore = maxScore.value;
  if (score.ok && score.value !== undefined) input.score = score.value;
  if (form.extraCredit) input.extraCredit = true;
  return input;
}
