// Phase 35 — Quest catalog (static definitions).
//
// Fixed daily/weekly/monthly quests. The active period instances are produced
// deterministically by questEngine.ts (no randomness, like the briefing
// template selection).

import type { QuestDefinition } from "./progressionModel";

export const QUEST_CATALOG: readonly QuestDefinition[] = [
  // ----- daily -----
  {
    id: "daily_log_15",
    period: "daily",
    title: "Warm up",
    description: "Log 15 minutes of any skill today.",
    rewardXp: 10,
    condition: { kind: "log_skill_minutes", minMinutes: 15 },
  },
  {
    id: "daily_extend_streak",
    period: "daily",
    title: "Keep the streak",
    description: "Extend your global streak today.",
    rewardXp: 10,
    condition: { kind: "extend_global_streak" },
  },
  {
    id: "daily_workout",
    period: "daily",
    title: "Move your body",
    description: "Complete one workout today.",
    axis: "body",
    rewardXp: 15,
    condition: { kind: "complete_workout", count: 1 },
  },

  {
    id: "daily_cook",
    period: "daily",
    title: "Cook tonight",
    description: "Complete one home-cooked meal today.",
    axis: "creative",
    rewardXp: 15,
    condition: { kind: "complete_cooking_session", count: 1 },
  },

  // ----- weekly -----
  {
    id: "weekly_minutes_120",
    period: "weekly",
    title: "Two solid hours",
    description: "Log 120 minutes of skills this week.",
    rewardXp: 40,
    condition: { kind: "log_skill_minutes", minMinutes: 120 },
  },
  {
    id: "weekly_scheduled_workouts_2",
    period: "weekly",
    title: "Stay on plan",
    description: "Complete 2 scheduled workouts this week.",
    axis: "body",
    rewardXp: 40,
    condition: { kind: "complete_scheduled_workout", count: 2 },
  },
  {
    id: "weekly_people_contact",
    period: "weekly",
    title: "Reach out",
    description: "Log a follow-up with someone this week.",
    axis: "social",
    rewardXp: 30,
    condition: { kind: "log_people_contact", count: 1 },
  },
  {
    id: "weekly_cook_3",
    period: "weekly",
    title: "Cook 3 home meals",
    description: "Complete 3 home-cooked meals this week.",
    axis: "creative",
    rewardXp: 40,
    condition: { kind: "complete_cooking_session", count: 3 },
  },
  {
    id: "weekly_new_recipe",
    period: "weekly",
    title: "Try something new",
    description: "Cook a recipe you have never completed before.",
    axis: "creative",
    rewardXp: 30,
    condition: { kind: "cook_new_recipe", count: 1 },
  },

  // ----- monthly -----
  {
    id: "monthly_minutes_600",
    period: "monthly",
    title: "Ten hours in",
    description: "Log 600 minutes of skills this month.",
    rewardXp: 120,
    condition: { kind: "log_skill_minutes", minMinutes: 600 },
  },
  {
    id: "monthly_career_action",
    period: "monthly",
    title: "Move your career",
    description: "Take one career action this month.",
    axis: "career",
    rewardXp: 80,
    condition: { kind: "career_action", minCount: 1 },
  },
  {
    id: "monthly_cook_12",
    period: "monthly",
    title: "A dozen home meals",
    description: "Complete 12 home-cooked meals this month.",
    axis: "creative",
    rewardXp: 80,
    condition: { kind: "complete_cooking_session", count: 12 },
  },
];

export function getQuestById(id: string): QuestDefinition | undefined {
  return QUEST_CATALOG.find((def) => def.id === id);
}
