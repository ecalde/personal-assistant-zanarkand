import { useMemo, useState } from "react";
import {
  createSessionDraftFromPlan,
  filterAndSortPlans,
  filterAndSortSessions,
  type PlansSortMode,
  type SessionsSortMode,
  type WorkoutFocusFilter,
} from "../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../core/model";
import { formatLocalDateKey } from "../core/timeline";
import { FitnessToolbar } from "../components/fitness/FitnessToolbar";
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

export type FitnessPageProps = {
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  onAddPlan: (input: Omit<WorkoutPlan, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdatePlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (planId: string) => void;
  onAddSession: (input: Omit<WorkoutSession, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdateSession: (session: WorkoutSession) => void;
  onDeleteSession: (sessionId: string) => void;
};

export default function FitnessPage({
  workoutPlans,
  workoutSessions,
  onAddPlan,
  onUpdatePlan,
  onDeletePlan,
  onAddSession,
  onUpdateSession,
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
      focus: draft.focus ?? "",
      planId: draft.planId ?? "",
      durationMinutes: "",
      notes: draft.notes ?? "",
      exercises: draft.exercises.map((entry) => ({
        id: entry.id,
        name: entry.name,
        sets: entry.sets !== undefined ? String(entry.sets) : "",
        reps: entry.reps !== undefined ? String(entry.reps) : "",
        weight: entry.weight !== undefined ? String(entry.weight) : "",
        notes: entry.notes ?? "",
      })),
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
      onAddSession(payload);
    }

    resetSessionForm();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Fitness</div>
        <div style={{ opacity: 0.85 }}>
          Track workout plans and log completed sessions with sets, reps, and weight.
        </div>
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
