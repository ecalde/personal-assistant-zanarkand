import { useState } from "react";
import {
  addSessionExercise,
  applySessionLoadPatchToPlan,
  applyWorkoutFinishDefaults,
  applyWorkoutLoggerDraft,
  createLiveSessionFromPlan,
  describeExerciseLoadPatch,
  exerciseLoadDivergesFromPlan,
  exerciseLoadPatchChanges,
  markAllExercisesCompleted,
  removeSessionExercise,
  setSessionDurationMinutes,
  setSessionStartHHMM,
  toggleExerciseCompleted,
  updateSessionExercise,
  type ExerciseLoadPatch,
  type WorkoutLoggerDraft,
} from "../../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { LiveWorkoutLogger, type LiveExercisePatch } from "./LiveWorkoutLogger";
import { PlanLoadChangeDialog } from "./PlanLoadChangeDialog";
import { WorkoutCompletionDialog } from "./WorkoutCompletionDialog";

export type PlanLiveLoggerProps = {
  plan: WorkoutPlan;
  dateKey: string;
  persistedSession?: WorkoutSession;
  highlighted?: boolean;
  focusActive: boolean;
  persistDrafts: boolean;
  draft?: WorkoutLoggerDraft;
  showExit?: boolean;
  onDraftChange?: (draft: WorkoutLoggerDraft) => void;
  onCommit: (session: WorkoutSession) => void;
  onUpdatePlan?: (plan: WorkoutPlan) => void;
  onLogDifferentSession: () => void;
  onToggleFocus: (session: WorkoutSession) => void;
  onExit?: () => void;
  onFinished: (session: WorkoutSession) => void;
};

type PendingPlanLoadPrompt = {
  exerciseId: string;
  exerciseName: string;
  patch: ExerciseLoadPatch;
  summary: string;
};

function extractLoadPatch(patch: LiveExercisePatch): ExerciseLoadPatch | null {
  const load: ExerciseLoadPatch = {};
  let hasLoad = false;
  if ("sets" in patch) {
    load.sets = patch.sets;
    hasLoad = true;
  }
  if ("reps" in patch) {
    load.reps = patch.reps;
    hasLoad = true;
  }
  if ("weight" in patch) {
    load.weight = patch.weight;
    hasLoad = true;
  }
  return hasLoad ? load : null;
}

export function PlanLiveLogger({
  plan,
  dateKey,
  persistedSession,
  highlighted = false,
  focusActive,
  persistDrafts,
  draft,
  showExit = false,
  onDraftChange,
  onCommit,
  onUpdatePlan,
  onLogDifferentSession,
  onToggleFocus,
  onExit,
  onFinished,
}: PlanLiveLoggerProps) {
  const [seed] = useState(() =>
    persistedSession ??
    createLiveSessionFromPlan(plan, dateKey, new Date().toISOString(), crypto.randomUUID())
  );
  const session = persistedSession ?? seed;
  const [pendingFinish, setPendingFinish] = useState<"finish" | "markAll" | null>(null);
  const [pendingPlanPrompt, setPendingPlanPrompt] = useState<PendingPlanLoadPrompt | null>(
    null
  );

  function commit(next: WorkoutSession) {
    onCommit(next);
  }

  function withCurrentDraft(next: WorkoutSession): WorkoutSession {
    return persistDrafts ? applyWorkoutLoggerDraft(next, draft) : next;
  }

  function confirmFinish(completedAtIso: string) {
    let next = withCurrentDraft(session);
    if (pendingFinish === "markAll") {
      next = markAllExercisesCompleted(next, completedAtIso);
    }
    next = applyWorkoutFinishDefaults(next, completedAtIso);
    setPendingFinish(null);
    onFinished(next);
  }

  function handleUpdateExercise(exerciseId: string, patch: LiveExercisePatch) {
    const entry = session.exercises.find((item) => item.id === exerciseId);
    if (!entry) return;

    const nextSession = updateSessionExercise(session, exerciseId, patch);
    commit(nextSession);

    const loadPatch = extractLoadPatch(patch);
    if (
      onUpdatePlan &&
      loadPatch &&
      exerciseLoadPatchChanges(entry, loadPatch) &&
      exerciseLoadDivergesFromPlan(plan, entry, loadPatch)
    ) {
      setPendingPlanPrompt({
        exerciseId,
        exerciseName: entry.name,
        patch: loadPatch,
        summary: describeExerciseLoadPatch(loadPatch),
      });
    }
  }

  function confirmUpdatePlan() {
    if (!pendingPlanPrompt || !onUpdatePlan) {
      setPendingPlanPrompt(null);
      return;
    }
    const entry = session.exercises.find((item) => item.id === pendingPlanPrompt.exerciseId);
    if (entry) {
      onUpdatePlan(applySessionLoadPatchToPlan(plan, entry, pendingPlanPrompt.patch));
    }
    setPendingPlanPrompt(null);
  }

  return (
    <>
      <LiveWorkoutLogger
        planName={plan.name}
        session={session}
        highlighted={highlighted}
        persistDrafts={persistDrafts}
        draft={draft}
        focusActive={focusActive}
        onDraftChange={onDraftChange}
        onToggleExercise={(exerciseId) =>
          commit(toggleExerciseCompleted(session, exerciseId, new Date().toISOString()))
        }
        onUpdateExercise={handleUpdateExercise}
        onAddExercise={() => commit(addSessionExercise(session))}
        onRemoveExercise={(exerciseId) => commit(removeSessionExercise(session, exerciseId))}
        onStartTimeChange={(hhmm) => commit(setSessionStartHHMM(session, hhmm))}
        onDurationChange={(raw) => {
          const trimmed = raw.trim();
          if (!trimmed) {
            commit(setSessionDurationMinutes(session, undefined));
            return;
          }
          const parsed = Number(trimmed);
          if (!Number.isInteger(parsed) || parsed <= 0) return;
          commit(setSessionDurationMinutes(session, parsed));
        }}
        onFinish={() => setPendingFinish("finish")}
        onMarkAllComplete={() => setPendingFinish("markAll")}
        onLogDifferentSession={onLogDifferentSession}
        onToggleFocus={() => onToggleFocus(session)}
        onExit={showExit ? onExit : undefined}
      />
      {pendingFinish && (
        <WorkoutCompletionDialog
          planName={plan.name}
          defaultCompletedAtIso={new Date().toISOString()}
          onCancel={() => setPendingFinish(null)}
          onConfirm={({ completedAtIso }) => confirmFinish(completedAtIso)}
        />
      )}
      {pendingPlanPrompt && (
        <PlanLoadChangeDialog
          exerciseName={pendingPlanPrompt.exerciseName}
          summary={pendingPlanPrompt.summary}
          onSessionOnly={() => setPendingPlanPrompt(null)}
          onUpdatePlan={confirmUpdatePlan}
        />
      )}
    </>
  );
}
