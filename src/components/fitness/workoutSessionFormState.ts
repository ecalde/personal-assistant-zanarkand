import type { ExerciseEntry, WorkoutFocus, WorkoutSession } from "../../core/model";
import { combineDateTimeToIso, getWorkoutFocusValues, resolveSessionStartHHMM } from "../../core/fitness";
import { normalizeTargetMuscleIds } from "../../core/muscles";
import {
  emptyExerciseEntryFormRow,
  exerciseFormFromEntry,
  type ExerciseEntryFormRow,
} from "./workoutPlanFormState";

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WorkoutSessionFormState = {
  date: string;
  startTime: string;
  focus: WorkoutFocus | "";
  planId: string;
  durationMinutes: string;
  notes: string;
  exercises: ExerciseEntryFormRow[];
};

export function emptyWorkoutSessionFormState(dateKey: string): WorkoutSessionFormState {
  return {
    date: dateKey,
    startTime: "",
    focus: "",
    planId: "",
    durationMinutes: "",
    notes: "",
    exercises: [emptyExerciseEntryFormRow()],
  };
}

export function workoutSessionFormFromSession(session: WorkoutSession): WorkoutSessionFormState {
  return {
    date: session.date,
    startTime: resolveSessionStartHHMM(session) ?? "",
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
  const targetMuscleIds = normalizeTargetMuscleIds(row.targetMuscleIds);
  if (targetMuscleIds.length > 0) entry.targetMuscleIds = targetMuscleIds;
  if (row.completedAtIso !== undefined) entry.completedAtIso = row.completedAtIso;
  if (row.sourceExerciseId !== undefined) entry.sourceExerciseId = row.sourceExerciseId;
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

  if (form.startTime.trim() && !HHMM_RE.test(form.startTime.trim())) {
    return "Start time must be HH:MM.";
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
  if (form.startTime.trim()) {
    const startedAtIso = combineDateTimeToIso(form.date.trim(), form.startTime.trim());
    if (startedAtIso) payload.startedAtIso = startedAtIso;
  }

  return payload;
}
