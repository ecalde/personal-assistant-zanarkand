// Phase 35 — Achievement catalog (static definitions).
//
// Versioned list of achievements grouped across the six categories. Evaluation
// lives in achievementEngine.ts; this file is pure data.

import type { AchievementDefinition } from "./progressionModel";

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  // ----- consistency -----
  {
    id: "streak_global_3",
    category: "consistency",
    tier: "bronze",
    title: "On a Roll",
    description: "Keep a 3-day global streak.",
    condition: { kind: "global_streak_gte", days: 3 },
  },
  {
    id: "streak_global_7",
    category: "consistency",
    tier: "silver",
    title: "Week Warrior",
    description: "Keep a 7-day global streak.",
    grantXp: 25,
    condition: { kind: "global_streak_gte", days: 7 },
  },
  {
    id: "streak_global_30",
    category: "consistency",
    tier: "gold",
    title: "Unstoppable",
    description: "Keep a 30-day global streak.",
    grantXp: 100,
    condition: { kind: "global_streak_gte", days: 30 },
  },
  {
    id: "streak_skill_14",
    category: "consistency",
    tier: "silver",
    title: "Single-Minded",
    description: "Keep a 14-day streak on any one skill.",
    condition: { kind: "skill_streak_gte", days: 14 },
  },

  // ----- milestones -----
  {
    id: "first_session",
    category: "milestones",
    tier: "bronze",
    title: "First Steps",
    description: "Log your first practice session.",
    condition: { kind: "total_skill_minutes_gte", minutes: 1 },
  },
  {
    id: "lifetime_xp_500",
    category: "milestones",
    tier: "silver",
    title: "Five Hundred",
    description: "Log 500 lifetime minutes.",
    condition: { kind: "total_skill_minutes_gte", minutes: 500 },
  },
  {
    id: "global_level_10",
    category: "milestones",
    tier: "gold",
    title: "Double Digits",
    description: "Reach global level 10.",
    grantXp: 100,
    condition: { kind: "global_level_gte", level: 10 },
  },

  // ----- fitness -----
  {
    id: "workouts_10",
    category: "fitness",
    tier: "bronze",
    title: "Getting Strong",
    description: "Complete 10 workout sessions.",
    axis: "body",
    condition: { kind: "workouts_completed_gte", count: 10 },
  },
  {
    id: "body_level_5",
    category: "fitness",
    tier: "silver",
    title: "Athlete",
    description: "Reach Body axis level 5.",
    axis: "body",
    condition: { kind: "axis_level_gte", axis: "body", level: 5 },
  },

  // ----- learning -----
  {
    id: "skill_minutes_1000",
    category: "learning",
    tier: "silver",
    title: "Deep Work",
    description: "Log 1,000 lifetime skill minutes.",
    axis: "mind",
    condition: { kind: "total_skill_minutes_gte", minutes: 1000 },
  },
  {
    id: "weekly_goal_4x",
    category: "learning",
    tier: "gold",
    title: "Goal Crusher",
    description: "Meet a weekly skill goal 4 times.",
    axis: "mind",
    grantXp: 50,
    condition: { kind: "weekly_goal_met_count", count: 4 },
  },

  // ----- social -----
  {
    id: "follow_up_5",
    category: "social",
    tier: "bronze",
    title: "Staying in Touch",
    description: "Log 5 people follow-ups.",
    axis: "social",
    condition: { kind: "people_follow_ups_gte", count: 5 },
  },
  {
    id: "social_events_10",
    category: "social",
    tier: "silver",
    title: "People Person",
    description: "Attend 10 social events.",
    axis: "social",
    condition: { kind: "events_social_attended_gte", count: 10 },
  },

  // ----- career -----
  {
    id: "first_application",
    category: "career",
    tier: "bronze",
    title: "Job Hunter",
    description: "Track your first job application.",
    axis: "career",
    condition: { kind: "career_applications_gte", count: 1 },
  },
  {
    id: "pipeline_active_3",
    category: "career",
    tier: "silver",
    title: "Pipeline Builder",
    description: "Track 3 job applications.",
    axis: "career",
    condition: { kind: "career_applications_gte", count: 3 },
  },
  {
    id: "status_onsite",
    category: "career",
    tier: "gold",
    title: "Final Round",
    description: "Reach the onsite stage in any application.",
    axis: "career",
    grantXp: 50,
    condition: { kind: "career_status_reached", status: "onsite" },
  },
];

export function getAchievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_CATALOG.find((def) => def.id === id);
}
