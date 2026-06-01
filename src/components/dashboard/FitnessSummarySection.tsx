import {
  buildRecentSessions,
  buildWorkoutWeekSummary,
  expandWorkoutOccurrencesForDate,
  formatSessionDurationLabel,
  formatSessionHeadline,
  formatWorkoutFocus,
  getLastSession,
  isWorkoutOccurrenceComplete,
} from "../../core/fitness";
import type { WorkoutPlan, WorkoutSession } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type FitnessSummarySectionProps = {
  workoutPlans: WorkoutPlan[];
  workoutSessions: WorkoutSession[];
  todayKey: string;
  onOpenFitness?: () => void;
};

function formatWorkoutDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function FitnessSummarySection({
  workoutPlans,
  workoutSessions,
  todayKey,
  onOpenFitness,
}: FitnessSummarySectionProps) {
  if (workoutPlans.length === 0 && workoutSessions.length === 0) {
    return null;
  }

  const weekSummary = buildWorkoutWeekSummary(workoutSessions, todayKey);
  const lastSession = getLastSession(workoutSessions);
  const recentSessions = buildRecentSessions(workoutSessions, 2);
  const scheduledToday = expandWorkoutOccurrencesForDate(workoutPlans, todayKey);
  const pendingToday = scheduledToday.filter((occurrence) => {
    const plan = workoutPlans.find((p) => p.id === occurrence.planId);
    return plan && !isWorkoutOccurrenceComplete(plan, todayKey, occurrence.blockId, workoutSessions);
  });

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
          <button type="button" onClick={onOpenFitness}>
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
        .
      </p>

      {pendingToday.length > 0 && (
        <p style={{ margin: "0 0 12px 0", ...styles.textSecondary }}>
          Scheduled today: {pendingToday.map((o) => o.planName).join(", ")}
        </p>
      )}

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
