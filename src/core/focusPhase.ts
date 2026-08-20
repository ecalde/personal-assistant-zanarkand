/**
 * Focus-phase state: a workout or cooking session that should resume after the
 * tab/window closes. Draft typing lives here only while focus is on; exiting
 * discards drafts without writing them to the session.
 */

import type { WorkoutLoggerDraft } from "./fitness";

export type FocusPhaseKind = "workout" | "cooking";

export type WorkoutFocusPhase = {
  kind: "workout";
  sessionId: string;
  planId?: string;
  draft?: WorkoutLoggerDraft;
};

export type CookingFocusPhase = {
  kind: "cooking";
  sessionId: string;
};

export type FocusPhaseState = WorkoutFocusPhase | CookingFocusPhase;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseExerciseDraft(value: unknown): WorkoutLoggerDraft["exercises"][string] | undefined {
  if (!isRecord(value)) return undefined;
  const next: WorkoutLoggerDraft["exercises"][string] = {};
  if (typeof value.name === "string") next.name = value.name;
  if (typeof value.sets === "string") next.sets = value.sets;
  if (typeof value.reps === "string") next.reps = value.reps;
  if (typeof value.weight === "string") next.weight = value.weight;
  return next;
}

function parseWorkoutDraft(value: unknown): WorkoutLoggerDraft | undefined {
  if (!isRecord(value)) return undefined;
  const exercises: WorkoutLoggerDraft["exercises"] = {};
  if (isRecord(value.exercises)) {
    for (const [id, fields] of Object.entries(value.exercises)) {
      if (!id) continue;
      const parsed = parseExerciseDraft(fields);
      if (parsed) exercises[id] = parsed;
    }
  }
  const draft: WorkoutLoggerDraft = { exercises };
  if (typeof value.duration === "string") draft.duration = value.duration;
  if (typeof value.notes === "string") draft.notes = value.notes;
  return draft;
}

/** Lenient parse for untrusted localStorage JSON. */
export function parseFocusPhaseState(input: unknown): FocusPhaseState | undefined {
  if (!isRecord(input)) return undefined;
  if (typeof input.sessionId !== "string" || !input.sessionId) return undefined;

  if (input.kind === "cooking") {
    return { kind: "cooking", sessionId: input.sessionId };
  }

  if (input.kind === "workout") {
    const phase: WorkoutFocusPhase = { kind: "workout", sessionId: input.sessionId };
    if (typeof input.planId === "string" && input.planId) phase.planId = input.planId;
    const draft = parseWorkoutDraft(input.draft);
    if (draft) phase.draft = draft;
    return phase;
  }

  return undefined;
}

export function withWorkoutFocusDraft(
  phase: FocusPhaseState,
  draft: WorkoutLoggerDraft | undefined
): FocusPhaseState {
  if (phase.kind !== "workout") return phase;
  const next: WorkoutFocusPhase = { kind: "workout", sessionId: phase.sessionId };
  if (phase.planId) next.planId = phase.planId;
  if (draft) next.draft = draft;
  return next;
}

export function withoutFocusDraft(phase: FocusPhaseState): FocusPhaseState {
  if (phase.kind !== "workout") return phase;
  const next: WorkoutFocusPhase = { kind: "workout", sessionId: phase.sessionId };
  if (phase.planId) next.planId = phase.planId;
  return next;
}

export function focusPhaseLabel(kind: FocusPhaseKind): string {
  return kind === "workout" ? "Workout focus" : "Cooking focus";
}
