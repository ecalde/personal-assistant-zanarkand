import type { WorkoutScheduleSeries } from "../../core/model";
import { normalizeWorkoutScheduleSeries } from "../../core/workoutSeries";

export type WorkoutScheduleUiMode = "indefinite" | "date_range" | "single_day";

export type WorkoutScheduleFormState = {
  mode: WorkoutScheduleUiMode;
  startDate: string;
  endDate: string;
  singleDate: string;
};

export function emptyWorkoutScheduleFormState(): WorkoutScheduleFormState {
  return { mode: "indefinite", startDate: "", endDate: "", singleDate: "" };
}

export function workoutScheduleFormFromSeries(
  series?: WorkoutScheduleSeries
): WorkoutScheduleFormState {
  const normalized =
    series === undefined ? undefined : normalizeWorkoutScheduleSeries(series);
  if (normalized === undefined) {
    return emptyWorkoutScheduleFormState();
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
      return emptyWorkoutScheduleFormState();
  }
}

export function validateWorkoutScheduleForm(form: WorkoutScheduleFormState): string | null {
  if (form.mode === "indefinite") {
    return null;
  }

  if (form.mode === "date_range") {
    const startDate = form.startDate.trim();
    const endDate = form.endDate.trim();
    if (!startDate) return "Start date is required.";
    if (!endDate) return "End date is required.";

    const normalized = normalizeWorkoutScheduleSeries({
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
  if (normalizeWorkoutScheduleSeries({ mode: "single_day", singleDate }) === undefined) {
    return "Enter a valid date (YYYY-MM-DD).";
  }
  return null;
}

export function workoutScheduleSeriesFromForm(
  form: WorkoutScheduleFormState
): WorkoutScheduleSeries | undefined {
  if (form.mode === "indefinite") {
    return undefined;
  }

  if (form.mode === "date_range") {
    return normalizeWorkoutScheduleSeries({
      mode: "date_range",
      startDate: form.startDate.trim(),
      endDate: form.endDate.trim(),
    });
  }

  return normalizeWorkoutScheduleSeries({
    mode: "single_day",
    singleDate: form.singleDate.trim(),
  });
}

export function workoutScheduleSeriesEqual(
  a: WorkoutScheduleSeries | undefined,
  b: WorkoutScheduleSeries | undefined
): boolean {
  const normalizedA = a === undefined ? undefined : normalizeWorkoutScheduleSeries(a);
  const normalizedB = b === undefined ? undefined : normalizeWorkoutScheduleSeries(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}
