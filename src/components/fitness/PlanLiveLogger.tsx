import { useState } from "react";
import {
  addSessionExercise,
  applyWorkoutFinishDefaults,
  applyWorkoutLoggerDraft,
  createLiveSessionFromPlan,
  markAllExercisesCompleted,
  removeSessionExercise,
  setSessionDurationMinutes,
  setSessionStartHHMM,
  toggleExerciseCompleted,
  updateSessionExercise,
  type WorkoutLoggerDraft,
} from "../../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { LiveWorkoutLogger } from "./LiveWorkoutLogger";
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
  onLogDifferentSession: () => void;
  onToggleFocus: (session: WorkoutSession) => void;
  onExit?: () => void;
  onFinished: (session: WorkoutSession) => void;
};

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
        onUpdateExercise={(exerciseId, patch) =>
          commit(updateSessionExercise(session, exerciseId, patch))
        }
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
    </>
  );
}
