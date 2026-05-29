import type { ExerciseEntry, WeeklySchedule, WorkoutFocus, WorkoutPlan } from "../../core/model";
import { getWorkoutFocusValues } from "../../core/fitness";
import { defaultWeeklySchedule } from "../../core/state";
import {
  emptyWorkoutScheduleFormState,
  validateWorkoutScheduleForm,
  workoutScheduleFormFromSeries,
  workoutScheduleSeriesFromForm,
  type WorkoutScheduleFormState,
} from "./workoutScheduleFormState";

export type ExerciseEntryFormRow = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  notes: string;
};

export type WorkoutPlanFormState = {
  name: string;
  focus: WorkoutFocus | "";
  notes: string;
  exercises: ExerciseEntryFormRow[];
  schedule: WeeklySchedule;
  scheduleAvailability: WorkoutScheduleFormState;
};

export function emptyExerciseEntryFormRow(): ExerciseEntryFormRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    sets: "",
    reps: "",
    weight: "",
    notes: "",
  };
}

export function emptyWorkoutPlanFormState(): WorkoutPlanFormState {
  return {
    name: "",
    focus: "",
    notes: "",
    exercises: [emptyExerciseEntryFormRow()],
    schedule: defaultWeeklySchedule(),
    scheduleAvailability: emptyWorkoutScheduleFormState(),
  };
}

function exerciseFormFromEntry(entry: ExerciseEntry): ExerciseEntryFormRow {
  return {
    id: entry.id,
    name: entry.name,
    sets: entry.sets !== undefined ? String(entry.sets) : "",
    reps: entry.reps !== undefined ? String(entry.reps) : "",
    weight: entry.weight !== undefined ? String(entry.weight) : "",
    notes: entry.notes ?? "",
  };
}

export function workoutPlanFormFromPlan(plan: WorkoutPlan): WorkoutPlanFormState {
  return {
    name: plan.name,
    focus: plan.focus ?? "",
    notes: plan.notes ?? "",
    exercises: plan.exercises.map(exerciseFormFromEntry),
    schedule: plan.schedule ?? defaultWeeklySchedule(),
    scheduleAvailability: workoutScheduleFormFromSeries(plan.scheduleSeries),
  };
}

function parsePositiveIntField(raw: string, label: string): number | undefined | string {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${label} must be a positive whole number.`;
  }
  return parsed;
}

function parseWeightField(raw: string): number | undefined | string {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "Weight must be zero or greater.";
  }
  return parsed;
}

function buildExerciseEntry(row: ExerciseEntryFormRow): ExerciseEntry | string {
  const name = row.name.trim();
  if (!name) return "Each exercise needs a name.";

  const sets = parsePositiveIntField(row.sets, "Sets");
  if (typeof sets === "string") return sets;
  const reps = parsePositiveIntField(row.reps, "Reps");
  if (typeof reps === "string") return reps;
  const weight = parseWeightField(row.weight);
  if (typeof weight === "string") return weight;

  const entry: ExerciseEntry = {
    id: row.id,
    name,
  };
  if (sets !== undefined) entry.sets = sets;
  if (reps !== undefined) entry.reps = reps;
  if (weight !== undefined) entry.weight = weight;
  if (row.notes.trim()) entry.notes = row.notes.trim();
  return entry;
}

export function validateWorkoutPlanForm(form: WorkoutPlanFormState): string | null {
  if (!form.name.trim()) return "Plan name is required.";

  if (form.focus && !getWorkoutFocusValues().includes(form.focus)) {
    return "Invalid workout focus.";
  }

  const scheduleError = validateWorkoutScheduleForm(form.scheduleAvailability);
  if (scheduleError) return scheduleError;

  const validRows = form.exercises.filter((row) => row.name.trim());
  if (validRows.length === 0) {
    return "Add at least one exercise with a name.";
  }

  for (const row of validRows) {
    const result = buildExerciseEntry(row);
    if (typeof result === "string") return result;
  }

  return null;
}

export function workoutPlanPayloadFromForm(
  form: WorkoutPlanFormState
): Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso"> {
  const exercises = form.exercises
    .filter((row) => row.name.trim())
    .map((row) => buildExerciseEntry(row))
    .filter((entry): entry is ExerciseEntry => typeof entry !== "string");

  const payload: Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso"> = {
    name: form.name.trim(),
    exercises,
    schedule: form.schedule,
  };

  if (form.focus) payload.focus = form.focus;
  if (form.notes.trim()) payload.notes = form.notes.trim();

  const scheduleSeries = workoutScheduleSeriesFromForm(form.scheduleAvailability);
  if (scheduleSeries !== undefined) {
    payload.scheduleSeries = scheduleSeries;
  }

  return payload;
}
