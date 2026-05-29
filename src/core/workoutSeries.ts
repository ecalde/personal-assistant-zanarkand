// Pure workout plan schedule-series helpers.
//
// Validates optional schedule bounds on WorkoutPlan (when the weekly template applies),
// delegating series semantics to skillSeries.ts. Total functions; dates are local
// YYYY-MM-DD keys compared lexicographically.

import type { AppPayload, WorkoutPlan, WorkoutScheduleSeries } from "./model";
import {
  formatSkillScheduleSeriesLabel,
  getScheduleSeriesDateRange,
  isScheduleSeriesActiveOnDate,
  isValidSkillScheduleSeries,
  normalizeSkillScheduleSeries,
  type SkillSeriesDateRange,
} from "./skillSeries";

export type WorkoutPlanSeriesDateRange = SkillSeriesDateRange;

export function isValidWorkoutScheduleSeries(raw: unknown): raw is WorkoutScheduleSeries {
  return isValidSkillScheduleSeries(raw);
}

export function normalizeWorkoutScheduleSeries(
  raw: unknown
): WorkoutScheduleSeries | undefined {
  return normalizeSkillScheduleSeries(raw);
}

export function isWorkoutPlanActiveOnDate(plan: WorkoutPlan, dateKey: string): boolean {
  return isScheduleSeriesActiveOnDate(plan.scheduleSeries, dateKey);
}

export function getWorkoutPlanSeriesDateRange(plan: WorkoutPlan): WorkoutPlanSeriesDateRange {
  return getScheduleSeriesDateRange(plan.scheduleSeries);
}

/** Human-readable schedule availability label for workout plan cards. */
export function formatWorkoutScheduleSeriesLabel(plan: WorkoutPlan): string {
  if (plan.scheduleSeries === undefined) {
    return "Scheduled indefinitely";
  }

  const skillLabel = formatSkillScheduleSeriesLabel({
    id: plan.id,
    name: plan.name,
    schedule: plan.schedule ?? { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    createdAtIso: plan.createdAtIso,
    updatedAtIso: plan.updatedAtIso,
    scheduleSeries: plan.scheduleSeries,
  });

  return skillLabel
    .replace("Available indefinitely", "Scheduled indefinitely")
    .replace(/^Available from /, "Scheduled from ")
    .replace(/^Available /, "Scheduled ")
    .replace(/^Available only on /, "Scheduled only on ");
}

/** Drops invalid scheduleSeries from workout plans on load/import (fail-closed repair). */
export function cleanupInvalidWorkoutScheduleSeries(payload: AppPayload): AppPayload {
  let changed = false;
  const workoutPlans = (payload.workoutPlans ?? []).map((plan) => {
    if (plan.scheduleSeries !== undefined && !isValidWorkoutScheduleSeries(plan.scheduleSeries)) {
      changed = true;
      const next = { ...plan };
      delete next.scheduleSeries;
      return next;
    }
    return plan;
  });
  if (!changed) return payload;
  return { ...payload, workoutPlans };
}
