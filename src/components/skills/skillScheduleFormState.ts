import type { SkillScheduleSeries } from "../../core/model";
import { normalizeSkillScheduleSeries } from "../../core/skillSeries";

export type SkillScheduleUiMode = "indefinite" | "date_range" | "single_day";

export type SkillScheduleFormState = {
  mode: SkillScheduleUiMode;
  startDate: string;
  endDate: string;
  singleDate: string;
};

export function emptySkillScheduleFormState(): SkillScheduleFormState {
  return { mode: "indefinite", startDate: "", endDate: "", singleDate: "" };
}

export function skillScheduleFormFromSeries(
  series?: SkillScheduleSeries
): SkillScheduleFormState {
  const normalized =
    series === undefined ? undefined : normalizeSkillScheduleSeries(series);
  if (normalized === undefined) {
    return emptySkillScheduleFormState();
  }

  switch (normalized.mode) {
    case "date_range":
      return {
        mode: "date_range",
        startDate: normalized.startDate!,
        endDate: normalized.endDate!,
        singleDate: "",
      };
    case "single_day":
      return {
        mode: "single_day",
        startDate: "",
        endDate: "",
        singleDate: normalized.singleDate!,
      };
    case "indefinite":
    default:
      return emptySkillScheduleFormState();
  }
}

export function validateSkillScheduleForm(form: SkillScheduleFormState): string | null {
  if (form.mode === "indefinite") {
    return null;
  }

  if (form.mode === "date_range") {
    const startDate = form.startDate.trim();
    const endDate = form.endDate.trim();
    if (!startDate) return "Start date is required.";
    if (!endDate) return "End date is required.";

    const normalized = normalizeSkillScheduleSeries({
      mode: "date_range",
      startDate,
      endDate,
    });
    if (normalized === undefined) {
      if (endDate < startDate) return "End date must be on or after start date.";
      return "Enter valid start and end dates (YYYY-MM-DD).";
    }
    return null;
  }

  const singleDate = form.singleDate.trim();
  if (!singleDate) return "Date is required.";
  if (normalizeSkillScheduleSeries({ mode: "single_day", singleDate }) === undefined) {
    return "Enter a valid date (YYYY-MM-DD).";
  }
  return null;
}

export function skillScheduleSeriesFromForm(
  form: SkillScheduleFormState
): SkillScheduleSeries | undefined {
  if (form.mode === "indefinite") {
    return undefined;
  }

  if (form.mode === "date_range") {
    return normalizeSkillScheduleSeries({
      mode: "date_range",
      startDate: form.startDate.trim(),
      endDate: form.endDate.trim(),
    });
  }

  return normalizeSkillScheduleSeries({
    mode: "single_day",
    singleDate: form.singleDate.trim(),
  });
}

export function skillScheduleSeriesEqual(
  a: SkillScheduleSeries | undefined,
  b: SkillScheduleSeries | undefined
): boolean {
  const normalizedA = a === undefined ? undefined : normalizeSkillScheduleSeries(a);
  const normalizedB = b === undefined ? undefined : normalizeSkillScheduleSeries(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}
