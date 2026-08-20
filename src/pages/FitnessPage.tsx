import { useEffect, useMemo, useState } from "react";
import {
  createLiveSessionFromPlan,
  filterAndSortPlans,
  filterAndSortSessions,
  findActiveWorkoutSession,
  findSessionForPlanDate,
  isWorkoutSessionInProgress,
  plansForLiveLogger,
  type FitnessFocus,
  type PlansSortMode,
  type SessionsSortMode,
  type WorkoutFocusFilter,
  type WorkoutLoggerDraft,
} from "../core/fitness";
import { buildExerciseProgressions } from "../core/exerciseProgression";
import type { SupplementIntakeLog, SupplementProtocol, WorkoutPlan, WorkoutSession } from "../core/model";
import { formatLocalDateKey } from "../core/timeline";
import { groupWorkoutSessionsForHistory } from "../core/workoutHistory";
import { readFocusPhase } from "../core/focusPhaseStorage";
import { ExerciseProgressionChart } from "../components/fitness/ExerciseProgressionChart";
import {
  FitnessSectionSwitcher,
  type FitnessSection,
} from "../components/fitness/FitnessSectionSwitcher";
import { FitnessToolbar } from "../components/fitness/FitnessToolbar";
import { PlanLiveLogger } from "../components/fitness/PlanLiveLogger";
import { SessionHistoryGroups } from "../components/fitness/SessionHistoryGroups";
import { SupplementTrackerSection } from "../components/fitness/SupplementTrackerSection";
import { WorkoutPlanCard } from "../components/fitness/WorkoutPlanCard";
import { WorkoutPlanForm } from "../components/fitness/WorkoutPlanForm";
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

export type WorkoutFocusResume = {
  sessionId: string;
  planId?: string;
};

export type FitnessPageProps = {
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  supplementProtocols: SupplementProtocol[];
  supplementIntakeLogs: SupplementIntakeLog[];
  fitnessFocus?: FitnessFocus;
  workoutFocus?: WorkoutFocusResume;
  onAddPlan: (input: Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdatePlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (planId: string) => void;
  onAddSession: (input: Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateSession: (session: WorkoutSession) => void;
  onUpsertSession: (session: WorkoutSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onEnterWorkoutFocus: (session: WorkoutSession, planId?: string) => void;
  onExitWorkoutFocus: () => void;
  onWorkoutDraftChange: (draft: WorkoutLoggerDraft) => void;
  onAddProtocol: (
    input: Omit<SupplementProtocol, "id" | "createdAtIso" | "updatedAtIso">
  ) => void;
  onUpdateProtocol: (protocol: SupplementProtocol) => void;
  onDeleteProtocol: (protocolId: string) => void;
  onUpsertIntake: (log: SupplementIntakeLog) => void;
};

function planForSession(session: WorkoutSession, plans: WorkoutPlan[]): WorkoutPlan {
  const existing = session.planId ? plans.find((plan) => plan.id === session.planId) : undefined;
  if (existing) return existing;
  return {
    id: session.planId ?? session.id,
    name: "Workout",
    ...(session.focus ? { focus: session.focus } : {}),
    exercises: session.exercises,
    createdAtIso: session.createdAtIso,
    updatedAtIso: session.updatedAtIso,
  };
}

export default function FitnessPage({
  workoutPlans,
  workoutSessions,
  supplementProtocols,
  supplementIntakeLogs,
  fitnessFocus,
  workoutFocus,
  onAddPlan,
  onUpdatePlan,
  onDeletePlan,
  onAddSession,
  onUpdateSession,
  onUpsertSession,
  onDeleteSession,
  onEnterWorkoutFocus,
  onExitWorkoutFocus,
  onWorkoutDraftChange,
  onAddProtocol,
  onUpdateProtocol,
  onDeleteProtocol,
  onUpsertIntake,
}: FitnessPageProps) {
  const todayKey = formatLocalDateKey(new Date());
  const [section, setSection] = useState<FitnessSection>(() =>
    fitnessFocus?.kind === "supplement" ? "supplements" : "workouts"
  );

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<WorkoutPlanFormState>(emptyWorkoutPlanFormState());
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [planSortMode, setPlanSortMode] = useState<PlansSortMode>("recent");
  const [planFocusFilter, setPlanFocusFilter] = useState<WorkoutFocusFilter>("all");
  const [activePlanId, setActivePlanId] = useState<string | null>(
    () =>
      workoutFocus?.planId ??
      (fitnessFocus?.kind === "workout" ? fitnessFocus.planId : null)
  );
  const [loggerEpoch, setLoggerEpoch] = useState(0);
  const [loggerDraft, setLoggerDraft] = useState<WorkoutLoggerDraft | undefined>(() => {
    const phase = readFocusPhase();
    return phase?.kind === "workout" ? phase.draft : undefined;
  });

  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<WorkoutSessionFormState>(
    emptyWorkoutSessionFormState(todayKey)
  );
  const [sessionFormError, setSessionFormError] = useState<string | null>(null);
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionSortMode, setSessionSortMode] = useState<SessionsSortMode>("recent");
  const [sessionFocusFilter, setSessionFocusFilter] = useState<WorkoutFocusFilter>("all");

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

  const sessionGroups = useMemo(
    () => groupWorkoutSessionsForHistory(filteredSessions, todayKey),
    [filteredSessions, todayKey]
  );

  const focusPlanId = fitnessFocus?.kind === "workout" ? fitnessFocus.planId : undefined;
  const focusProtocolId =
    fitnessFocus?.kind === "supplement" ? fitnessFocus.protocolId : undefined;
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

  const activePlan = activePlanId
    ? workoutPlans.find((plan) => plan.id === activePlanId)
    : undefined;
  const activeLiveSession = activePlan
    ? findSessionForPlanDate(workoutSessions, activePlan.id, todayKey)
    : workoutFocus
      ? workoutSessions.find((session) => session.id === workoutFocus.sessionId)
      : undefined;
  const loggerPlan = activePlan
    ?? (activeLiveSession ? planForSession(activeLiveSession, workoutPlans) : undefined);
  const focusActive = Boolean(
    workoutFocus &&
      (workoutFocus.sessionId === activeLiveSession?.id ||
        (activePlan && workoutFocus.planId === activePlan.id))
  );

  useEffect(() => {
    if (fitnessFocus?.kind === "workout") {
      document.getElementById(`live-workout-${fitnessFocus.planId}`)?.scrollIntoView({
        block: "nearest",
      });
      return;
    }
    if (fitnessFocus?.kind === "supplement") {
      document.getElementById(`today-supplement-${fitnessFocus.protocolId}`)?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [fitnessFocus, section]);

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

  function ensureLiveSession(plan: WorkoutPlan): WorkoutSession {
    const existing = findSessionForPlanDate(workoutSessions, plan.id, todayKey);
    if (existing && isWorkoutSessionInProgress(existing)) return existing;
    return createLiveSessionFromPlan(plan, todayKey, new Date().toISOString(), crypto.randomUUID());
  }

  function openPlanLogger(plan: WorkoutPlan, opts: { focus: boolean }) {
    setSection("workouts");
    setActivePlanId(plan.id);
    if (!opts.focus) return;
    setLoggerDraft(undefined);
    const session = ensureLiveSession(plan);
    onUpsertSession(session);
    onEnterWorkoutFocus(session, plan.id);
  }

  function resumeSession(session: WorkoutSession, opts: { focus: boolean }) {
    setSection("workouts");
    const plan = planForSession(session, workoutPlans);
    setActivePlanId(plan.id);
    if (!opts.focus) return;
    onUpsertSession(session);
    onEnterWorkoutFocus(session, session.planId);
  }

  function handleToggleFocus(session: WorkoutSession) {
    if (focusActive) {
      onExitWorkoutFocus();
      setLoggerDraft(undefined);
      setLoggerEpoch((value) => value + 1);
      return;
    }
    onUpsertSession(session);
    onEnterWorkoutFocus(session, session.planId ?? activePlanId ?? undefined);
  }

  function handleDraftChange(draft: WorkoutLoggerDraft) {
    setLoggerDraft(draft);
    onWorkoutDraftChange(draft);
  }

  function handleFinished(session: WorkoutSession) {
    onUpsertSession(session);
    onExitWorkoutFocus();
    setLoggerDraft(undefined);
    setActivePlanId(null);
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
      onAddSession({ ...payload, completedAtIso: new Date().toISOString() });
    }

    resetSessionForm();
  }

  const showDedicatedLogger = Boolean(loggerPlan) && section === "workouts";

  return (
    <div style={{ display: "grid", gap: 14 }}>
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
          <div style={styles.cardTitle}>Fitness</div>
          <FitnessSectionSwitcher value={section} onChange={setSection} />
        </div>
        <div style={{ ...styles.textSecondary }}>
          {section === "workouts"
            ? "Open a plan to tap exercises complete. Focus mode keeps the session if you close the tab."
            : "Track supplement protocols and tap each dose as you take it."}
        </div>
      </div>

      {section === "supplements" && (
        <SupplementTrackerSection
          protocols={supplementProtocols}
          logs={supplementIntakeLogs}
          todayKey={todayKey}
          focusProtocolId={focusProtocolId}
          onAddProtocol={onAddProtocol}
          onUpdateProtocol={onUpdateProtocol}
          onDeleteProtocol={onDeleteProtocol}
          onUpsertIntake={onUpsertIntake}
        />
      )}

      {showDedicatedLogger && loggerPlan && (
        <div style={styles.card}>
          <PlanLiveLogger
            key={`${loggerPlan.id}:${loggerEpoch}:${workoutFocus?.sessionId ?? "idle"}`}
            plan={loggerPlan}
            dateKey={todayKey}
            persistedSession={
              activeLiveSession && isWorkoutSessionInProgress(activeLiveSession)
                ? activeLiveSession
                : undefined
            }
            highlighted={focusPlanId === loggerPlan.id}
            focusActive={focusActive}
            persistDrafts={focusActive}
            draft={focusActive ? loggerDraft : undefined}
            showExit
            onDraftChange={handleDraftChange}
            onCommit={onUpsertSession}
            onLogDifferentSession={openCreateSessionForm}
            onToggleFocus={handleToggleFocus}
            onExit={() => setActivePlanId(null)}
            onFinished={handleFinished}
          />
        </div>
      )}

      {section === "workouts" && !showDedicatedLogger && todayRailPlans.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Today</div>
          <div style={{ ...styles.textSecondary, marginBottom: 12 }}>
            Tap complete as you go. Each checked exercise saves immediately and stays off the
            calendar until you finish the session.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {todayRailPlans.map((plan) => {
              const existing = findSessionForPlanDate(workoutSessions, plan.id, todayKey);
              const persistedSession =
                existing && isWorkoutSessionInProgress(existing) ? existing : undefined;
              return (
                <PlanLiveLogger
                  key={`${plan.id}:${todayKey}`}
                  plan={plan}
                  dateKey={todayKey}
                  persistedSession={persistedSession}
                  highlighted={focusPlanId === plan.id}
                  focusActive={workoutFocus?.planId === plan.id}
                  persistDrafts={workoutFocus?.planId === plan.id}
                  draft={workoutFocus?.planId === plan.id ? loggerDraft : undefined}
                  onDraftChange={handleDraftChange}
                  onCommit={onUpsertSession}
                  onLogDifferentSession={openCreateSessionForm}
                  onToggleFocus={(session) => {
                    setActivePlanId(plan.id);
                    handleToggleFocus(session);
                  }}
                  onFinished={handleFinished}
                />
              );
            })}
          </div>
        </div>
      )}

      {section === "workouts" && !showDedicatedLogger && (
        <>
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
            <button type="button" onClick={openCreatePlanForm} style={styles.actionBtn}>
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
              <button type="button" onClick={openCreatePlanForm} style={styles.actionBtn}>
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
              <div style={styles.workoutGalleryGrid}>
                {filteredPlans.map((plan) => {
                  const existing = findSessionForPlanDate(workoutSessions, plan.id, todayKey);
                  return (
                    <WorkoutPlanCard
                      key={plan.id}
                      plan={plan}
                      liveSession={
                        existing && isWorkoutSessionInProgress(existing) ? existing : undefined
                      }
                      onOpen={() => openPlanLogger(plan, { focus: false })}
                      onLogSession={() => openPlanLogger(plan, { focus: true })}
                      onEdit={() => openEditPlanForm(plan)}
                      onDelete={() => onDeletePlan(plan.id)}
                    />
                  );
                })}
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {findActiveWorkoutSession(workoutSessions) && (
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => {
                  const active = findActiveWorkoutSession(workoutSessions);
                  if (active) resumeSession(active, { focus: true });
                }}
              >
                Focus mode
              </button>
            )}
            {!showSessionForm && (
              <button type="button" onClick={openCreateSessionForm} style={styles.actionBtn}>
                Log session
              </button>
            )}
          </div>
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
              <button type="button" onClick={openCreateSessionForm} style={styles.actionBtn}>
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
              <SessionHistoryGroups
                groups={sessionGroups}
                plans={workoutPlans}
                onResume={(session) => resumeSession(session, { focus: true })}
                onEdit={openEditSessionForm}
                onDelete={onDeleteSession}
              />
            )}
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
}
