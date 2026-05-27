import type { ExerciseEntry, WorkoutFocus, WorkoutSession } from "../../core/model";
import { getWorkoutFocusValues } from "../../core/fitness";
import {
  emptyExerciseEntryFormRow,
  type ExerciseEntryFormRow,
} from "./workoutPlanFormState";

export type WorkoutSessionFormState = {
  date: string;
  focus: WorkoutFocus | "";
  planId: string;
  durationMinutes: string;
  notes: string;
  exercises: ExerciseEntryFormRow[];
};

export function emptyWorkoutSessionFormState(dateKey: string): WorkoutSessionFormState {
  return {
    date: dateKey,
    focus: "",
    planId: "",
    durationMinutes: "",
    notes: "",
    exercises: [emptyExerciseEntryFormRow()],
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

export function workoutSessionFormFromSession(session: WorkoutSession): WorkoutSessionFormState {
  return {
    date: session.date,
    focus: session.focus ?? "",
    planId: session.planId ?? "",
    durationMinutes:
      session.durationMinutes !== undefined ? String(session.durationMinutes) : "",
    notes: session.notes ?? "",
    exercises: session.exercises.map(exerciseFormFromEntry),
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

export function validateWorkoutSessionForm(form: WorkoutSessionFormState): string | null {
  if (!form.date.trim()) return "Workout date is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) {
    return "Workout date must be YYYY-MM-DD.";
  }

  if (form.focus && !getWorkoutFocusValues().includes(form.focus)) {
    return "Invalid workout focus.";
  }

  const durationMinutes = parsePositiveIntField(form.durationMinutes, "Duration");
  if (typeof durationMinutes === "string") return durationMinutes;

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

export function workoutSessionPayloadFromForm(
  form: WorkoutSessionFormState
): Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso"> {
  const exercises = form.exercises
    .filter((row) => row.name.trim())
    .map((row) => buildExerciseEntry(row))
    .filter((entry): entry is ExerciseEntry => typeof entry !== "string");

  const payload: Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso"> = {
    date: form.date.trim(),
    exercises,
  };

  if (form.focus) payload.focus = form.focus;
  if (form.planId) payload.planId = form.planId;
  if (form.notes.trim()) payload.notes = form.notes.trim();
  if (form.durationMinutes.trim()) {
    const durationMinutes = parsePositiveIntField(form.durationMinutes, "Duration");
    if (typeof durationMinutes === "number") {
      payload.durationMinutes = durationMinutes;
    }
  }

  return payload;
}
