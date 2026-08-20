import { useState, type CSSProperties } from "react";
import {
  countCompletedExercises,
  isExerciseCompleted,
  resolveSessionStartHHMM,
  type WorkoutLoggerDraft,
  type WorkoutLoggerExerciseDraft,
} from "../../core/fitness";
import type { ExerciseEntry, WorkoutSession } from "../../core/model";
import { AETHER_TEXT, styles } from "../../ui/appStyles";
import { WorkoutFocusBadge } from "./WorkoutFocusBadge";

export type LiveExercisePatch = Partial<
  Pick<ExerciseEntry, "name" | "sets" | "reps" | "weight">
>;

export type LiveWorkoutLoggerProps = {
  planName: string;
  session: WorkoutSession;
  highlighted?: boolean;
  persistDrafts?: boolean;
  draft?: WorkoutLoggerDraft;
  focusActive?: boolean;
  onDraftChange?: (draft: WorkoutLoggerDraft) => void;
  onToggleExercise: (exerciseId: string) => void;
  onUpdateExercise: (exerciseId: string, patch: LiveExercisePatch) => void;
  onAddExercise: () => void;
  onRemoveExercise: (exerciseId: string) => void;
  onStartTimeChange: (hhmm: string) => void;
  onDurationChange: (raw: string) => void;
  onFinish: () => void;
  onMarkAllComplete: () => void;
  onLogDifferentSession: () => void;
  onToggleFocus?: () => void;
  onExit?: () => void;
};

const compactLabel: CSSProperties = { ...styles.label, fontSize: 12 };

const completeBtnBase: CSSProperties = {
  width: "100%",
  padding: "12px 10px",
  borderRadius: 10,
  border: "1px solid var(--aether-border, #ddd)",
  background: "var(--aether-surface-sunken, #fafafa)",
  color: AETHER_TEXT.secondary,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 15,
};

const completeBtnDone: CSSProperties = {
  ...completeBtnBase,
  border: "2px solid var(--aether-accent, #46c6ff)",
  background: "var(--aether-accent, #46c6ff)",
  color: AETHER_TEXT.onAccent,
};

const cellDone: CSSProperties = {
  ...styles.exerciseCell,
  border: "2px solid var(--aether-accent, #46c6ff)",
  background: "var(--aether-accent-soft, rgba(70,198,255,0.16))",
};

const cellIncomplete: CSSProperties = {
  ...styles.exerciseCell,
  border: "1px solid var(--aether-border, #ddd)",
};

const loggerHighlight: CSSProperties = {
  border: "2px solid var(--aether-accent, #46c6ff)",
  borderRadius: 16,
  padding: 14,
  background: "var(--aether-accent-soft, rgba(70,198,255,0.08))",
};

const loggerPlain: CSSProperties = {
  border: "1px solid var(--aether-border, #ddd)",
  borderRadius: 16,
  padding: 14,
  background: "var(--aether-surface, transparent)",
};

function fieldString(value: number | undefined): string {
  return value !== undefined ? String(value) : "";
}

function isCompletePositiveInt(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === trimmed;
}

function isCompleteNonNegativeNumber(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 && String(parsed) === trimmed;
}

function patchExerciseDraft(
  draft: WorkoutLoggerDraft | undefined,
  exerciseId: string,
  fields: WorkoutLoggerExerciseDraft
): WorkoutLoggerDraft {
  const exercises = { ...(draft?.exercises ?? {}) };
  exercises[exerciseId] = { ...(exercises[exerciseId] ?? {}), ...fields };
  return { ...(draft ?? { exercises: {} }), exercises };
}

type LiveExerciseCellProps = {
  entry: ExerciseEntry;
  canRemove: boolean;
  persistDrafts: boolean;
  draftFields?: WorkoutLoggerExerciseDraft;
  onDraftFields: (fields: WorkoutLoggerExerciseDraft) => void;
  onToggle: () => void;
  onUpdate: (patch: LiveExercisePatch) => void;
  onRemove: () => void;
};

function LiveExerciseCell({
  entry,
  canRemove,
  persistDrafts,
  draftFields,
  onDraftFields,
  onToggle,
  onUpdate,
  onRemove,
}: LiveExerciseCellProps) {
  const completed = isExerciseCompleted(entry);
  const [name, setName] = useState(draftFields?.name ?? entry.name);
  const [sets, setSets] = useState(draftFields?.sets ?? fieldString(entry.sets));
  const [reps, setReps] = useState(draftFields?.reps ?? fieldString(entry.reps));
  const [weight, setWeight] = useState(draftFields?.weight ?? fieldString(entry.weight));

  function maybeDraft(fields: WorkoutLoggerExerciseDraft) {
    if (persistDrafts) onDraftFields(fields);
  }

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(entry.name);
      return;
    }
    if (trimmed !== entry.name) onUpdate({ name: trimmed });
  }

  function commitPositiveInt(
    raw: string,
    key: "sets" | "reps",
    current: number | undefined
  ) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current !== undefined) onUpdate({ [key]: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    if (parsed !== current) onUpdate({ [key]: parsed });
  }

  function commitWeight(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (entry.weight !== undefined) onUpdate({ weight: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== entry.weight) onUpdate({ weight: parsed });
  }

  return (
    <div style={completed ? cellDone : cellIncomplete}>
      <button
        type="button"
        aria-pressed={completed}
        aria-label={completed ? `${entry.name} completed` : `Complete ${entry.name}`}
        onClick={onToggle}
        style={completed ? completeBtnDone : completeBtnBase}
      >
        {completed ? "Done" : "Complete"}
      </button>

      <label style={compactLabel}>
        Exercise
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            maybeDraft({ name: e.target.value });
          }}
          onBlur={commitName}
          style={styles.inputCompact}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <label style={compactLabel}>
          Sets
          <input
            value={sets}
            onChange={(e) => {
              setSets(e.target.value);
              maybeDraft({ sets: e.target.value });
              if (isCompletePositiveInt(e.target.value)) {
                commitPositiveInt(e.target.value, "sets", entry.sets);
              }
            }}
            onBlur={() => commitPositiveInt(sets, "sets", entry.sets)}
            inputMode="numeric"
            style={styles.inputCompact}
          />
        </label>
        <label style={compactLabel}>
          Reps
          <input
            value={reps}
            onChange={(e) => {
              setReps(e.target.value);
              maybeDraft({ reps: e.target.value });
              if (isCompletePositiveInt(e.target.value)) {
                commitPositiveInt(e.target.value, "reps", entry.reps);
              }
            }}
            onBlur={() => commitPositiveInt(reps, "reps", entry.reps)}
            inputMode="numeric"
            style={styles.inputCompact}
          />
        </label>
        <label style={compactLabel}>
          Weight
          <input
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              maybeDraft({ weight: e.target.value });
              if (isCompleteNonNegativeNumber(e.target.value)) {
                commitWeight(e.target.value);
              }
            }}
            onBlur={() => commitWeight(weight)}
            inputMode="decimal"
            style={styles.inputCompact}
          />
        </label>
      </div>

      {canRemove && (
        <button type="button" onClick={onRemove} style={styles.ghostBtn}>
          Remove
        </button>
      )}
    </div>
  );
}

export function LiveWorkoutLogger({
  planName,
  session,
  highlighted = false,
  persistDrafts = false,
  draft,
  focusActive = false,
  onDraftChange,
  onToggleExercise,
  onUpdateExercise,
  onAddExercise,
  onRemoveExercise,
  onStartTimeChange,
  onDurationChange,
  onFinish,
  onMarkAllComplete,
  onLogDifferentSession,
  onToggleFocus,
  onExit,
}: LiveWorkoutLoggerProps) {
  const completedCount = countCompletedExercises(session);
  const startTime = resolveSessionStartHHMM(session) ?? "";
  const [duration, setDuration] = useState(
    draft?.duration ?? (session.durationMinutes !== undefined ? String(session.durationMinutes) : "")
  );

  const canRemove = session.exercises.length > 1;

  function updateDraft(patch: Partial<WorkoutLoggerDraft>) {
    if (!persistDrafts || !onDraftChange) return;
    onDraftChange({
      duration: patch.duration ?? draft?.duration ?? duration,
      notes: patch.notes ?? draft?.notes,
      exercises: patch.exercises ?? draft?.exercises ?? {},
    });
  }

  return (
    <div
      id={`live-workout-${session.planId ?? session.id}`}
      style={highlighted || focusActive ? loggerHighlight : loggerPlain}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {onExit && (
            <button type="button" onClick={onExit} style={styles.ghostBtn}>
              Back
            </button>
          )}
          <div style={{ ...styles.cardTitle, marginBottom: 0 }}>{planName}</div>
          <WorkoutFocusBadge focus={session.focus} />
          <span style={styles.captionText}>
            {completedCount}/{session.exercises.length} complete
          </span>
          {focusActive && <span style={styles.statusPill}>Focus on</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onToggleFocus && (
              <button
                type="button"
                onClick={onToggleFocus}
                aria-pressed={focusActive}
                style={styles.actionBtn}
              >
                {focusActive ? "Exit focus mode" : "Focus mode"}
              </button>
            )}
          </div>
        </div>

        {focusActive && (
          <div style={{ ...styles.textSecondary, fontSize: 13 }}>
            Focus keeps this session and anything you are typing after you close the
            tab. Turn it off to discard unfinished typing.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={compactLabel}>
            Start time
            <input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(e.target.value)}
              style={styles.timeInput}
            />
          </label>
          <label style={compactLabel}>
            Duration (min)
            <input
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                updateDraft({ duration: e.target.value });
                if (isCompletePositiveInt(e.target.value)) {
                  onDurationChange(e.target.value);
                }
              }}
              onBlur={() => onDurationChange(duration)}
              placeholder="60"
              inputMode="numeric"
              style={styles.minInput}
            />
          </label>
        </div>

        <div style={styles.exerciseGrid}>
          {session.exercises.map((entry) => (
            <LiveExerciseCell
              key={entry.id}
              entry={entry}
              canRemove={canRemove}
              persistDrafts={persistDrafts}
              draftFields={draft?.exercises[entry.id]}
              onDraftFields={(fields) =>
                updateDraft({
                  exercises: patchExerciseDraft(draft, entry.id, fields).exercises,
                })
              }
              onToggle={() => onToggleExercise(entry.id)}
              onUpdate={(patch) => onUpdateExercise(entry.id, patch)}
              onRemove={() => onRemoveExercise(entry.id)}
            />
          ))}
          <button type="button" onClick={onAddExercise} style={styles.exerciseAddCell}>
            Add exercise
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={onFinish} style={styles.actionBtn}>
            Finish workout
          </button>
          <button type="button" onClick={onMarkAllComplete} style={styles.actionBtn}>
            Mark all complete
          </button>
          <button type="button" onClick={onLogDifferentSession} style={styles.ghostBtn}>
            Log a different session
          </button>
        </div>
      </div>
    </div>
  );
}
