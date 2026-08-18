import { useState, type CSSProperties } from "react";
import {
  buildDashboardWorkoutLoggers,
  buildRecentSessions,
  buildWorkoutWeekSummary,
  formatSessionDurationLabel,
  formatSessionHeadline,
  formatWorkoutFocus,
  getLastSession,
  type DashboardWorkoutExercise,
  type FitnessFocus,
} from "../../core/fitness";
import type { SupplementIntakeLog, SupplementProtocol, WorkoutPlan, WorkoutSession } from "../../core/model";
import { dueProtocolsForDate, findIntakeForProtocolDate } from "../../core/supplements";
import { AETHER_TEXT, styles } from "../../ui/appStyles";
import { SupplementDoseRow } from "../fitness/SupplementDoseRow";

export type FitnessSummarySectionProps = {
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  supplementProtocols: SupplementProtocol[];
  supplementIntakeLogs: SupplementIntakeLog[];
  todayKey: string;
  onOpenFitness?: (focus?: FitnessFocus) => void;
  onToggleTodayExercise?: (planId: string, exerciseId: string) => void;
  onSetTodayExerciseWeight?: (
    planId: string,
    exerciseId: string,
    weight: number | undefined
  ) => void;
  onUpsertSupplementIntake?: (log: SupplementIntakeLog) => void;
};

function formatWorkoutDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fieldString(value: number | undefined): string {
  return value !== undefined ? String(value) : "";
}

const completeBtn: CSSProperties = {
  ...styles.smallBtn,
  minWidth: 88,
  fontWeight: 800,
};

const completeBtnDone: CSSProperties = {
  ...completeBtn,
  border: "2px solid var(--aether-accent, #46c6ff)",
  background: "var(--aether-accent, #46c6ff)",
  color: AETHER_TEXT.onAccent,
};

const loggerCard: CSSProperties = {
  border: "1px solid var(--aether-border, #ddd)",
  borderRadius: 12,
  padding: 10,
  marginBottom: 12,
  display: "grid",
  gap: 8,
  background: "var(--aether-surface, transparent)",
};

const exerciseRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

type DashboardExerciseRowProps = {
  planId: string;
  exercise: DashboardWorkoutExercise;
  onToggle?: (planId: string, exerciseId: string) => void;
  onSetWeight?: (planId: string, exerciseId: string, weight: number | undefined) => void;
};

function DashboardExerciseRow({
  planId,
  exercise,
  onToggle,
  onSetWeight,
}: DashboardExerciseRowProps) {
  const [weight, setWeight] = useState(fieldString(exercise.weight));

  function commitWeight(raw: string) {
    if (!onSetWeight) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      if (exercise.weight !== undefined) onSetWeight(planId, exercise.exerciseId, undefined);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== exercise.weight) onSetWeight(planId, exercise.exerciseId, parsed);
  }

  return (
    <div style={exerciseRow}>
      {onToggle ? (
        <button
          type="button"
          aria-pressed={exercise.completed}
          aria-label={
            exercise.completed ? `${exercise.name} completed` : `Complete ${exercise.name}`
          }
          onClick={() => onToggle(planId, exercise.exerciseId)}
          style={exercise.completed ? completeBtnDone : completeBtn}
        >
          {exercise.completed ? "Done" : "Complete"}
        </button>
      ) : null}
      <span style={{ flex: "1 1 120px", fontWeight: 700 }}>{exercise.name}</span>
      {onSetWeight ? (
        <label style={{ ...styles.label, fontSize: 12, minWidth: 88, margin: 0 }}>
          Weight
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => commitWeight(weight)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitWeight(weight);
              }
            }}
            inputMode="decimal"
            aria-label={`${exercise.name} weight`}
            style={{ ...styles.inputCompact, minWidth: 72, width: 88 }}
          />
        </label>
      ) : null}
    </div>
  );
}

export function FitnessSummarySection({
  workoutPlans,
  workoutSessions,
  supplementProtocols,
  supplementIntakeLogs,
  todayKey,
  onOpenFitness,
  onToggleTodayExercise,
  onSetTodayExerciseWeight,
  onUpsertSupplementIntake,
}: FitnessSummarySectionProps) {
  if (
    workoutPlans.length === 0 &&
    workoutSessions.length === 0 &&
    supplementProtocols.length === 0
  ) {
    return null;
  }

  const weekSummary = buildWorkoutWeekSummary(workoutSessions, todayKey);
  const lastSession = getLastSession(workoutSessions);
  const recentSessions = buildRecentSessions(workoutSessions, 2);
  const todayLoggers = buildDashboardWorkoutLoggers(workoutPlans, workoutSessions, todayKey);
  const dueSupplements = dueProtocolsForDate(supplementProtocols, todayKey);

  return (
    <section style={styles.dashboardSection} aria-label="Fitness summary">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Fitness</h2>
        {onOpenFitness && (
          <button type="button" onClick={() => onOpenFitness()}>
            View fitness
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>
        {weekSummary.count} session{weekSummary.count === 1 ? "" : "s"} logged this week
        {weekSummary.totalDurationMinutes > 0
          ? ` · ${weekSummary.totalDurationMinutes} min total`
          : ""}
        {workoutPlans.length > 0
          ? ` · ${workoutPlans.length} saved plan${workoutPlans.length === 1 ? "" : "s"}`
          : ""}
        {supplementProtocols.length > 0
          ? ` · ${supplementProtocols.length} protocol${supplementProtocols.length === 1 ? "" : "s"}`
          : ""}
        .
      </p>

      {todayLoggers.map((logger) => (
        <div key={logger.planId} style={loggerCard}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
              {logger.planName}
              <span style={{ ...styles.textMuted, fontWeight: 600 }}> · {logger.progressLabel}</span>
            </h3>
            {onOpenFitness ? (
              <button
                type="button"
                style={styles.smallBtn}
                onClick={() =>
                  onOpenFitness({ kind: "workout", date: todayKey, planId: logger.planId })
                }
                aria-label={`Open ${logger.planName} in Fitness`}
              >
                Open in Fitness
              </button>
            ) : null}
          </div>
          {logger.exercises.map((exercise) => (
            <DashboardExerciseRow
              key={exercise.exerciseId}
              planId={logger.planId}
              exercise={exercise}
              onToggle={onToggleTodayExercise}
              onSetWeight={onSetTodayExerciseWeight}
            />
          ))}
        </div>
      ))}

      {onUpsertSupplementIntake
        ? dueSupplements.map((protocol) => (
            <div key={protocol.id} style={{ marginBottom: 12 }}>
              <SupplementDoseRow
                protocol={protocol}
                dateKey={todayKey}
                persistedLog={findIntakeForProtocolDate(
                  supplementIntakeLogs,
                  protocol.id,
                  todayKey
                )}
                onUpsertIntake={onUpsertSupplementIntake}
                onOpenFitness={
                  onOpenFitness
                    ? () =>
                        onOpenFitness({
                          kind: "supplement",
                          date: todayKey,
                          protocolId: protocol.id,
                        })
                    : undefined
                }
              />
            </div>
          ))
        : null}

      {lastSession && (
        <p style={{ margin: "0 0 12px 0", ...styles.textSecondary }}>
          Last workout: {formatWorkoutDate(lastSession.date)}
          {lastSession.focus ? ` · ${formatWorkoutFocus(lastSession.focus)}` : ""}
          {(() => {
            const duration = formatSessionDurationLabel(lastSession);
            return duration ? ` · ${duration}` : "";
          })()}
          {" · "}
          {formatSessionHeadline(lastSession)}
        </p>
      )}

      {recentSessions.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, ...styles.textSecondary }}>
          {recentSessions.map((session) => (
            <li key={session.id} style={{ marginBottom: 6 }}>
              {formatWorkoutDate(session.date)} — {formatSessionHeadline(session)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
