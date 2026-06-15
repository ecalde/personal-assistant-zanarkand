import {
  formatInterviewStageLabel,
  getInterviewStageStatuses,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
} from "../../core/career";
import type {
  ApplicationInterview,
  ApplicationStatus,
  InterviewFormat,
  InterviewOutcome,
  JobApplication,
} from "../../core/model";
import { parseHHMMToMinutes } from "../../core/schedule";

export type ApplicationInterviewFormState = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  stage: ApplicationInterview["stage"] | "";
  format: InterviewFormat | "";
  outcome: InterviewOutcome | "";
  notes: string;
};

export function emptyInterviewFormState(date = ""): ApplicationInterviewFormState {
  return {
    id: crypto.randomUUID(),
    date,
    startTime: "",
    endTime: "",
    stage: "",
    format: "",
    outcome: "scheduled",
    notes: "",
  };
}

export function interviewFormFromInterview(
  interview: ApplicationInterview
): ApplicationInterviewFormState {
  return {
    id: interview.id,
    date: interview.date,
    startTime: interview.startTime ?? "",
    endTime: interview.endTime ?? "",
    stage: interview.stage ?? "",
    format: interview.format ?? "",
    outcome: interview.outcome ?? "scheduled",
    notes: interview.notes ?? "",
  };
}

export function interviewsFormFromApplication(
  application: JobApplication
): ApplicationInterviewFormState[] {
  return (application.interviews ?? []).map(interviewFormFromInterview);
}

function validateInterviewForm(
  form: ApplicationInterviewFormState,
  index: number
): string | null {
  const label = `Interview ${index + 1}`;
  if (!form.date.trim()) return `${label}: date is required.`;
  const start = form.startTime.trim();
  const end = form.endTime.trim();
  if (end && !start) return `${label}: start time is required when end time is set.`;
  if (start) {
    const startMinutes = parseHHMMToMinutes(start);
    if (startMinutes === null) return `${label}: start time must be HH:MM.`;
    if (end) {
      const endMinutes = parseHHMMToMinutes(end);
      if (endMinutes === null) return `${label}: end time must be HH:MM.`;
      if (endMinutes <= startMinutes) {
        return `${label}: end time must be after start time.`;
      }
    }
  }
  if (form.stage && !getInterviewStageStatuses().includes(form.stage)) {
    return `${label}: invalid stage.`;
  }
  if (form.format && !(form.format in INTERVIEW_FORMAT_LABELS)) {
    return `${label}: invalid format.`;
  }
  if (form.outcome && !(form.outcome in INTERVIEW_OUTCOME_LABELS)) {
    return `${label}: invalid outcome.`;
  }
  return null;
}

export function validateInterviewForms(forms: ApplicationInterviewFormState[]): string | null {
  for (let index = 0; index < forms.length; index += 1) {
    if (!forms[index].date.trim()) continue;
    const error = validateInterviewForm(forms[index], index);
    if (error) return error;
  }
  return null;
}

export function interviewsFromForms(
  forms: ApplicationInterviewFormState[]
): ApplicationInterview[] {
  return forms
    .filter((form) => form.date.trim().length > 0)
    .map((form) => {
      const interview: ApplicationInterview = {
        id: form.id,
        date: form.date.trim(),
      };
      const startTime = form.startTime.trim();
      const endTime = form.endTime.trim();
      if (startTime) interview.startTime = startTime;
      if (endTime) interview.endTime = endTime;
      if (form.stage) interview.stage = form.stage;
      if (form.format) interview.format = form.format;
      if (form.outcome) interview.outcome = form.outcome;
      const notes = form.notes.trim();
      if (notes) interview.notes = notes;
      return interview;
    });
}

export function formatInterviewSummary(
  interview: ApplicationInterview,
  application: JobApplication
): string {
  const parts = [formatInterviewStageLabel(interview, application)];
  if (interview.format) parts.push(INTERVIEW_FORMAT_LABELS[interview.format]);
  if (interview.outcome && interview.outcome !== "scheduled") {
    parts.push(INTERVIEW_OUTCOME_LABELS[interview.outcome]);
  }
  return parts.join(" · ");
}

export function defaultInterviewStageForStatus(
  status: ApplicationStatus
): ApplicationInterview["stage"] | "" {
  if (status === "screening" || status === "technical" || status === "onsite") {
    return status;
  }
  return "";
}
