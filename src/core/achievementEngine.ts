// Phase 35 — Achievement engine.
//
// Evaluates the static catalog against a ProgressionContext (plus computed
// level states). Pure: no mutation, total functions. Unlock time is the
// snapshot time in v1 (no per-unlock history yet).

import { ACHIEVEMENT_CATALOG } from "./achievementCatalog";
import type { ProgressionContext } from "./progressionContext";
import {
  type AchievementCondition,
  type AchievementUnlock,
  type LevelState,
  type ProgressionAxis,
} from "./progressionModel";

const CAREER_PROGRESS_ORDER: Record<string, number> = {
  saved: 0,
  applied: 1,
  screening: 2,
  technical: 3,
  onsite: 4,
  offer: 5,
};

export type AchievementEvaluation = {
  unlocked: AchievementUnlock[];
  inProgress: AchievementUnlock[];
};

type ConditionResult = { current: number; target: number; met: boolean };

function maxSkillLongestStreak(context: ProgressionContext): number {
  let max = 0;
  for (const prog of context.skillProgressions) {
    if (prog.longestStreak > max) max = prog.longestStreak;
  }
  return max;
}

function maxCareerProgressOrder(context: ProgressionContext): number {
  let max = -1;
  for (const reached of context.careerStatusReached) {
    if (reached.progressOrder > max) max = reached.progressOrder;
  }
  return max;
}

function evaluateCondition(
  condition: AchievementCondition,
  context: ProgressionContext,
  global: LevelState,
  axes: Record<ProgressionAxis, LevelState>
): ConditionResult {
  switch (condition.kind) {
    case "global_streak_gte": {
      const current = context.globalProgression.longestStreak;
      return { current, target: condition.days, met: current >= condition.days };
    }
    case "skill_streak_gte": {
      const current = maxSkillLongestStreak(context);
      return { current, target: condition.days, met: current >= condition.days };
    }
    case "global_level_gte": {
      return {
        current: global.level,
        target: condition.level,
        met: global.level >= condition.level,
      };
    }
    case "axis_level_gte": {
      const current = axes[condition.axis].level;
      return { current, target: condition.level, met: current >= condition.level };
    }
    case "total_skill_minutes_gte": {
      const current = context.totalSkillMinutes;
      return { current, target: condition.minutes, met: current >= condition.minutes };
    }
    case "workouts_completed_gte": {
      const current = context.workoutsCompletedTotal;
      return { current, target: condition.count, met: current >= condition.count };
    }
    case "weekly_goal_met_count": {
      const current = context.weeklyGoalsMetCount;
      return { current, target: condition.count, met: current >= condition.count };
    }
    case "career_applications_gte": {
      const current = context.applicationsCount;
      return { current, target: condition.count, met: current >= condition.count };
    }
    case "career_status_reached": {
      const targetOrder = CAREER_PROGRESS_ORDER[condition.status] ?? 0;
      const met = maxCareerProgressOrder(context) >= targetOrder;
      return { current: met ? 1 : 0, target: 1, met };
    }
    case "people_follow_ups_gte": {
      const current = context.peopleContacts.length;
      return { current, target: condition.count, met: current >= condition.count };
    }
    case "events_social_attended_gte": {
      const current = context.socialEventsAttendedCount;
      return { current, target: condition.count, met: current >= condition.count };
    }
  }
}

export function evaluateAchievements(
  context: ProgressionContext,
  levels: { global: LevelState; axes: Record<ProgressionAxis, LevelState> },
  generatedAtIso: string
): AchievementEvaluation {
  const unlocked: AchievementUnlock[] = [];
  const inProgress: AchievementUnlock[] = [];

  for (const def of ACHIEVEMENT_CATALOG) {
    const result = evaluateCondition(def.condition, context, levels.global, levels.axes);
    if (result.met) {
      unlocked.push({
        definitionId: def.id,
        unlockedAtIso: generatedAtIso,
        progress: { current: result.target, target: result.target },
      });
    } else if (!def.hiddenUntilUnlocked && result.current > 0) {
      inProgress.push({
        definitionId: def.id,
        unlockedAtIso: "",
        progress: { current: result.current, target: result.target },
      });
    }
  }

  return { unlocked, inProgress };
}
