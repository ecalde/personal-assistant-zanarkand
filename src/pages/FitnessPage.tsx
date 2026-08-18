import { useEffect, useMemo, useState } from "react";
import {
  addSessionExercise,
  createLiveSessionFromPlan,
  createSessionDraftFromPlan,
  filterAndSortPlans,
  filterAndSortSessions,
  findSessionForPlanDate,
  finishWorkoutSession,
  isWorkoutSessionInProgress,
  markAllExercisesCompletedAndFinish,
  plansForLiveLogger,
  removeSessionExercise,
  setSessionDurationMinutes,
  setSessionStartHHMM,
  toggleExerciseCompleted,
  updateSessionExercise,
  type FitnessFocus,
  type PlansSortMode,
  type SessionsSortMode,
  type WorkoutFocusFilter,
} from "../core/fitness";
import { buildExerciseProgressions } from "../core/exerciseProgression";
import type { WorkoutPlan, WorkoutSession } from "../core/model";
import { formatLocalDateKey } from "../core/timeline";
import { ExerciseProgressionChart } from "../components/fitness/ExerciseProgressionChart";
import { FitnessToolbar } from "../components/fitness/FitnessToolbar";
import { LiveWorkoutLogger } from "../components/fitness/LiveWorkoutLogger";
import { WorkoutPlanCard } from "../components/fitness/WorkoutPlanCard";
import { WorkoutPlanForm } from "../components/fitness/WorkoutPlanForm";
import { WorkoutSessionCard } from "../components/fitness/WorkoutSessionCard";
import { WorkoutSessionForm } from "../components/fitness/WorkoutSessionForm";
import {
  emptyWorkoutPlanFormState,
  validateWorkoutPlanForm,
  workoutPlanFormFromPlan,
  workoutPlanPayloadFromForm,
  type WorkoutPlanFormState,
} from "../components/fitness/workoutPlanFormState";
import {
  emptyWorkoutSessionFormState,
  validateWorkoutSessionForm,
  workoutSessionFormFromSession,
  workoutSessionPayloadFromForm,
  type WorkoutSessionFormState,
} from "../components/fitness/workoutSessionFormState";
import { styles } from "../ui/appStyles";

export type { FitnessFocus };

export type FitnessPageProps = {
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  fitnessFocus?: FitnessFocus;
  onAddPlan: (input: Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdatePlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (planId: string) => void;
  onAddSession: (input: Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateSession: (session: WorkoutSession) => void;
  onUpsertSession: (session: WorkoutSession) => void;
  onDeleteSession: (sessionId: string) => void;
};

type TodayRailItemProps = {
  plan: WorkoutPlan;
  dateKey: string;
  persistedSession?: WorkoutSession;
  highlighted: boolean;
  onCommit: (session: WorkoutSession) => void;
  onLogDifferentSession: () => void;
};

function TodayRailItem({
  plan,
  dateKey,
  persistedSession,
  highlighted,
  onCommit,
  onLogDifferentSession,
}: TodayRailItemProps) {
  const [draft] = useState(() =>
    createLiveSessionFromPlan(plan, dateKey, new Date().toISOString(), crypto.randomUUID())
  );
  const session = persistedSession ?? draft;

  return (
    <LiveWorkoutLogger
      planName={plan.name}
      session={session}
      highlighted={highlighted}
      onToggleExercise={(exerciseId) =>
        onCommit(toggleExerciseCompleted(session, exerciseId, new Date().toISOString()))
      }
      onUpdateExercise={(exerciseId, patch) =>
        onCommit(updateSessionExercise(session, exerciseId, patch))
      }
      onAddExercise={() => onCommit(addSessionExercise(session))}
      onRemoveExercise={(exerciseId) => onCommit(removeSessionExercise(session, exerciseId))}
      onStartTimeChange={(hhmm) => onCommit(setSessionStartHHMM(session, hhmm))}
      onDurationChange={(raw) => {
        const trimmed = raw.trim();
        if (!trimmed) {
          onCommit(setSessionDurationMinutes(session, undefined));
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isInteger(parsed) || parsed <= 0) return;
        onCommit(setSessionDurationMinutes(session, parsed));
      }}
      onFinish={() => onCommit(finishWorkoutSession(session, new Date().toISOString()))}
      onMarkAllComplete={() =>
        onCommit(markAllExercisesCompletedAndFinish(session, new Date().toISOString()))
      }
      onLogDifferentSession={onLogDifferentSession}
    />
  );
}

export default function FitnessPage({
  workoutPlans,
  workoutSessions,
  fitnessFocus,
  onAddPlan,
  onUpdatePlan,
  onDeletePlan,
  onAddSession,
  onUpdateSession,
  onUpsertSession,
  onDeleteSession,
}: FitnessPageProps) {
  const todayKey = formatLocalDateKey(new Date());

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<WorkoutPlanFormState>(emptyWorkoutPlanFormState());
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [planSortMode, setPlanSortMode] = useState<PlansSortMode>("recent");
  const [planFocusFilter, setPlanFocusFilter] = useState<WorkoutFocusFilter>("all");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<WorkoutSessionFormState>(
    emptyWorkoutSessionFormState(todayKey)
  );
  const [sessionFormError, setSessionFormError] = useState<string | null>(null);
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionSortMode, setSessionSortMode] = useState<SessionsSortMode>("recent");
  const [sessionFocusFilter, setSessionFocusFilter] = useState<WorkoutFocusFilter>("all");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const filteredPlans = useMemo(
    () =>
      filterAndSortPlans(workoutPlans, {
        query: planQuery,
        sortMode: planSortMode,
        focusFilter: planFocusFilter,
      }),
    [workoutPlans, planQuery, planSortMode, planFocusFilter]
  );

  const filteredSessions = useMemo(
    () =>
      filterAndSortSessions(workoutSessions, {
        query: sessionQuery,
        sortMode: sessionSortMode,
        focusFilter: sessionFocusFilter,
      }),
    [workoutSessions, sessionQuery, sessionSortMode, sessionFocusFilter]
  );

  const focusPlanId = fitnessFocus?.planId;
  const todayRailPlans = useMemo(() => {
    const plans = plansForLiveLogger(workoutPlans, workoutSessions, todayKey);
    if (!focusPlanId) return plans;
    return [...plans].sort((a, b) => {
      if (a.id === focusPlanId) return -1;
      if (b.id === focusPlanId) return 1;
      return 0;
    });
  }, [workoutPlans, workoutSessions, todayKey, focusPlanId]);

  const exerciseProgressions = useMemo(
    () => buildExerciseProgressions(workoutPlans, workoutSessions),
    [workoutPlans, workoutSessions]
  );

  useEffect(() => {
    if (!focusPlanId) return;
    document.getElementById(`live-workout-${focusPlanId}`)?.scrollIntoView({
      block: "nearest",
    });
  }, [focusPlanId]);

  function resetPlanForm() {
    setPlanForm(emptyWorkoutPlanFormState());
    setEditingPlanId(null);
    setPlanFormError(null);
    setShowPlanForm(false);
  }

  function openCreatePlanForm() {
    setPlanForm(emptyWorkoutPlanFormState());
    setEditingPlanId(null);
    setPlanFormError(null);
    setShowPlanForm(true);
  }

  function openEditPlanForm(plan: WorkoutPlan) {
    setPlanForm(workoutPlanFormFromPlan(plan));
    setEditingPlanId(plan.id);
    setPlanFormError(null);
    setShowPlanForm(true);
  }

  function handlePlanSubmit() {
    const validationError = validateWorkoutPlanForm(planForm);
    if (validationError) {
      setPlanFormError(validationError);
      return;
    }

    const payload = workoutPlanPayloadFromForm(planForm);

    if (editingPlanId) {
      const existing = workoutPlans.find((plan) => plan.id === editingPlanId);
      if (!existing) {
        setPlanFormError("Could not find that plan.");
        return;
      }
      onUpdatePlan({ ...existing, ...payload });
    } else {
      onAddPlan(payload);
    }

    resetPlanForm();
  }

  function resetSessionForm() {
    setSessionForm(emptyWorkoutSessionFormState(todayKey));
    setEditingSessionId(null);
    setSessionFormError(null);
    setShowSessionForm(false);
  }

  function openCreateSessionForm() {
    setSessionForm(emptyWorkoutSessionFormState(todayKey));
    setEditingSessionId(null);
    setSessionFormError(null);
    setShowSessionForm(true);
  }

  function openSessionFormFromPlan(plan: WorkoutPlan) {
    const draft = createSessionDraftFromPlan(plan, todayKey);
    setSessionForm({
      date: draft.date,
      startTime: "",
      focus: draft.focus ?? "",
      planId: draft.planId ?? "",
      durationMinutes: "",
      notes: draft.notes ?? "",
      exercises: draft.exercises.map((entry) => {
        const row = {
          id: entry.id,
          name: entry.name,
          sets: entry.sets !== undefined ? String(entry.sets) : "",
          reps: entry.reps !== undefined ? String(entry.reps) : "",
          weight: entry.weight !== undefined ? String(entry.weight) : "",
          notes: entry.notes ?? "",
        } as WorkoutSessionFormState["exercises"][number];
        if (entry.sourceExerciseId !== undefined) {
          row.sourceExerciseId = entry.sourceExerciseId;
        }
        return row;
      }),
    });
    setEditingSessionId(null);
    setSessionFormError(null);
    setShowSessionForm(true);
  }

  function openEditSessionForm(session: WorkoutSession) {
    setSessionForm(workoutSessionFormFromSession(session));
    setEditingSessionId(session.id);
    setSessionFormError(null);
    setShowSessionForm(true);
  }

  function handleSessionSubmit() {
    const validationError = validateWorkoutSessionForm(sessionForm);
    if (validationError) {
      setSessionFormError(validationError);
      return;
    }

    const payload = workoutSessionPayloadFromForm(sessionForm);

    if (editingSessionId) {
      const existing = workoutSessions.find((session) => session.id === editingSessionId);
      if (!existing) {
        setSessionFormError("Could not find that session.");
        return;
      }
      onUpdateSession({ ...existing, ...payload });
    } else {
      // Manual "Log session" is a retro completed log.
      onAddSession({ ...payload, completedAtIso: new Date().toISOString() });
    }

    resetSessionForm();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Fitness</div>
        <div style={{ ...styles.textSecondary }}>
          Track workout plans and log completed sessions with sets, reps, and weight.
        </div>
      </div>

      {todayRailPlans.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Today</div>
          <div style={{ ...styles.textSecondary, marginBottom: 12 }}>
            Tap complete as you go. Each change saves immediately.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {todayRailPlans.map((plan) => {
              const existing = findSessionForPlanDate(workoutSessions, plan.id, todayKey);
              const persistedSession =
                existing && isWorkoutSessionInProgress(existing) ? existing : undefined;
              return (
                <TodayRailItem
                  key={`${plan.id}:${todayKey}`}
                  plan={plan}
                  dateKey={todayKey}
                  persistedSession={persistedSession}
                  highlighted={focusPlanId === plan.id}
                  onCommit={onUpsertSession}
                  onLogDifferentSession={openCreateSessionForm}
                />
              );
            })}
          </div>
        </div>
      )}

      <ExerciseProgressionChart exercises={exerciseProgressions} />

      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={styles.cardTitle}>Workout plans</div>
          {!showPlanForm && (
            <button type="button" onClick={openCreatePlanForm}>
              Add plan
            </button>
          )}
        </div>

        {showPlanForm && (
          <div style={{ marginBottom: 12 }}>
            <WorkoutPlanForm
              editing={Boolean(editingPlanId)}
              form={planForm}
              formError={planFormError}
              onChange={setPlanForm}
              onSubmit={handlePlanSubmit}
              onCancel={resetPlanForm}
            />
          </div>
        )}

        {workoutPlans.length === 0 ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              Create a plan to reuse your usual exercises.
            </div>
            {!showPlanForm && (
              <button type="button" onClick={openCreatePlanForm}>
                Add your first plan
              </button>
            )}
          </div>
        ) : (
          <>
            <FitnessToolbar
              mode="plans"
              query={planQuery}
              sortMode={planSortMode}
              focusFilter={planFocusFilter}
              visibleCount={filteredPlans.length}
              totalCount={workoutPlans.length}
              onQueryChange={setPlanQuery}
              onSortModeChange={setPlanSortMode}
              onFocusFilterChange={setPlanFocusFilter}
            />

            {filteredPlans.length === 0 ? (
              <div style={styles.helpText}>
                No matches for &ldquo;{planQuery.trim()}&rdquo;.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredPlans.map((plan) => (
                  <WorkoutPlanCard
                    key={plan.id}
                    plan={plan}
                    expanded={expandedPlanId === plan.id}
                    onToggleExpand={() =>
                      setExpandedPlanId((current) => (current === plan.id ? null : plan.id))
                    }
                    onLogSession={() => openSessionFormFromPlan(plan)}
                    onEdit={() => openEditPlanForm(plan)}
                    onDelete={() => onDeletePlan(plan.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={styles.cardTitle}>Workout sessions</div>
          {!showSessionForm && (
            <button type="button" onClick={openCreateSessionForm}>
              Log session
            </button>
          )}
        </div>

        {showSessionForm && (
          <div style={{ marginBottom: 12 }}>
            <WorkoutSessionForm
              editing={Boolean(editingSessionId)}
              form={sessionForm}
              formError={sessionFormError}
              plans={workoutPlans}
              onChange={setSessionForm}
              onSubmit={handleSessionSubmit}
              onCancel={resetSessionForm}
            />
          </div>
        )}

        {workoutSessions.length === 0 ? (
          <div>
            <div style={{ marginBottom: 12 }}>Log a workout when you&apos;re done.</div>
            {!showSessionForm && (
              <button type="button" onClick={openCreateSessionForm}>
                Log your first session
              </button>
            )}
          </div>
        ) : (
          <>
            <FitnessToolbar
              mode="sessions"
              query={sessionQuery}
              sortMode={sessionSortMode}
              focusFilter={sessionFocusFilter}
              visibleCount={filteredSessions.length}
              totalCount={workoutSessions.length}
              onQueryChange={setSessionQuery}
              onSortModeChange={setSessionSortMode}
              onFocusFilterChange={setSessionFocusFilter}
            />

            {filteredSessions.length === 0 ? (
              <div style={styles.helpText}>
                No matches for &ldquo;{sessionQuery.trim()}&rdquo;.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredSessions.map((session) => (
                  <WorkoutSessionCard
                    key={session.id}
                    session={session}
                    plans={workoutPlans}
                    expanded={expandedSessionId === session.id}
                    onToggleExpand={() =>
                      setExpandedSessionId((current) =>
                        current === session.id ? null : session.id
                      )
                    }
                    onEdit={() => openEditSessionForm(session)}
                    onDelete={() => onDeleteSession(session.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
