// Phase 35 — Quest engine.
//
// Instantiates the active daily / weekly / monthly quests for "now" and scores
// progress from a ProgressionContext. Deterministic (fixed catalog, no
// randomness). Pure: no mutation, total functions.

import { QUEST_CATALOG } from "./questCatalog";
import {
  inPeriod,
  type PeriodBounds,
  type ProgressionContext,
} from "./progressionContext";
import type {
  QuestCondition,
  QuestDefinition,
  QuestInstance,
  QuestPeriod,
} from "./progressionModel";

export type QuestEvaluation = {
  daily: QuestInstance[];
  weekly: QuestInstance[];
  monthly: QuestInstance[];
};

function periodBounds(period: QuestPeriod, context: ProgressionContext): PeriodBounds {
  switch (period) {
    case "daily":
      return { startKey: context.todayKey, endKey: context.todayKey };
    case "weekly":
      return context.week;
    case "monthly":
      return context.month;
  }
}

function minutesInPeriod(context: ProgressionContext, bounds: PeriodBounds): number {
  let total = 0;
  for (const [dayKey, minutes] of context.minutesByDay) {
    if (inPeriod(dayKey, bounds)) total += minutes;
  }
  return total;
}

function workoutsInPeriod(context: ProgressionContext, bounds: PeriodBounds): number {
  return context.workoutSessions.filter((s) => inPeriod(s.date, bounds)).length;
}

function scheduledWorkoutsInPeriod(
  context: ProgressionContext,
  bounds: PeriodBounds
): number {
  return context.scheduledWorkoutCompletions.filter((s) => inPeriod(s.dateKey, bounds))
    .length;
}

function anyDailyGoalMetOn(context: ProgressionContext, dayKey: string): boolean {
  for (const days of context.dailyGoalMetDaysBySkill.values()) {
    if (days.has(dayKey)) return true;
  }
  return false;
}

function careerActionsInPeriod(context: ProgressionContext, bounds: PeriodBounds): number {
  return context.jobApplications.filter((app) =>
    inPeriod(app.updatedAtIso.slice(0, 10), bounds)
  ).length;
}

function peopleContactsInPeriod(
  context: ProgressionContext,
  bounds: PeriodBounds
): number {
  return context.peopleContacts.filter((c) => inPeriod(c.dayKey, bounds)).length;
}

function scoreCondition(
  condition: QuestCondition,
  context: ProgressionContext,
  bounds: PeriodBounds
): { current: number; target: number } {
  switch (condition.kind) {
    case "log_skill_minutes":
      return { current: minutesInPeriod(context, bounds), target: condition.minMinutes };
    case "meet_any_daily_goal":
      return {
        current: anyDailyGoalMetOn(context, context.todayKey) ? 1 : 0,
        target: 1,
      };
    case "complete_workout":
      return { current: workoutsInPeriod(context, bounds), target: condition.count ?? 1 };
    case "complete_scheduled_workout":
      return {
        current: scheduledWorkoutsInPeriod(context, bounds),
        target: condition.count ?? 1,
      };
    case "extend_global_streak":
      return {
        current: context.globalProgression.streakActiveToday ? 1 : 0,
        target: 1,
      };
    case "career_action":
      return { current: careerActionsInPeriod(context, bounds), target: condition.minCount };
    case "log_people_contact":
      return {
        current: peopleContactsInPeriod(context, bounds),
        target: condition.count ?? 1,
      };
  }
}

function buildInstance(
  def: QuestDefinition,
  context: ProgressionContext,
  generatedAtIso: string
): QuestInstance {
  const bounds = periodBounds(def.period, context);
  const scored = scoreCondition(def.condition, context, bounds);
  const current = Math.min(scored.current, scored.target);
  const completed = scored.current >= scored.target && scored.target > 0;

  return {
    instanceId: `${def.period}:${bounds.startKey}:${def.id}`,
    period: def.period,
    periodStartKey: bounds.startKey,
    periodEndKey: bounds.endKey,
    definition: def,
    progress: { current, target: scored.target },
    completed,
    completedAtIso: completed ? generatedAtIso : undefined,
  };
}

export function evaluateQuests(
  context: ProgressionContext,
  generatedAtIso: string
): QuestEvaluation {
  const daily: QuestInstance[] = [];
  const weekly: QuestInstance[] = [];
  const monthly: QuestInstance[] = [];

  for (const def of QUEST_CATALOG) {
    const instance = buildInstance(def, context, generatedAtIso);
    if (def.period === "daily") daily.push(instance);
    else if (def.period === "weekly") weekly.push(instance);
    else monthly.push(instance);
  }

  return { daily, weekly, monthly };
}
