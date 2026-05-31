// Phase 35 — Progression snapshot orchestrator.
//
// Composes the context + engines into the single ProgressionSnapshot DTO that
// the dashboard, focus, and review layers consume. Pure: no React, storage, or
// Supabase; recomputed on demand (XP itself is never persisted — only UX acks
// in GamificationState).

import type { AppPayload } from "./model";
import { buildProgressionContext } from "./progressionContext";
import {
  applyDailyBonusCap,
  dedupeGrants,
  listXpGrants,
} from "./rewardCalculation";
import {
  buildAxisLevelStates,
  buildGlobalLevelState,
  buildSkillLevelState,
  computeTrackTotals,
} from "./progressionEngine";
import { evaluateAchievements } from "./achievementEngine";
import { evaluateQuests } from "./questEngine";
import { getAchievementById } from "./achievementCatalog";
import {
  GLOBAL_TRACK_ID,
  skillTrackId,
  type GamificationState,
  type LevelUpNotification,
  type MilestoneHighlight,
  type ProgressionSnapshot,
  type QuestInstance,
  type SkillProgressionView,
  type StreakState,
  type XpGrant,
} from "./progressionModel";
import {
  LIFETIME_MINUTE_TROPHIES,
  STREAK_MILESTONES,
  globalLevelTitle,
} from "./milestoneTables";

function questCompletionGrants(
  quests: QuestInstance[],
  todayKey: string
): XpGrant[] {
  const grants: XpGrant[] = [];
  for (const quest of quests) {
    if (!quest.completed) continue;
    grants.push({
      id: `quest_completion:${quest.instanceId}`,
      source: "quest_completion",
      trackId: quest.definition.rewardTrackId ?? GLOBAL_TRACK_ID,
      amount: quest.definition.rewardXp,
      dayKey: quest.period === "daily" ? todayKey : quest.periodEndKey,
    });
  }
  return grants;
}

function buildMilestones(
  totalSkillMinutes: number,
  globalLevel: number,
  currentStreak: number,
  longestStreak: number,
  hasOffer: boolean
): MilestoneHighlight[] {
  const nextTrophy =
    LIFETIME_MINUTE_TROPHIES.find((t) => t > totalSkillMinutes) ??
    LIFETIME_MINUTE_TROPHIES[LIFETIME_MINUTE_TROPHIES.length - 1]!;

  const nextStreak =
    STREAK_MILESTONES.find((m) => m.days > currentStreak)?.days ??
    STREAK_MILESTONES[STREAK_MILESTONES.length - 1]!.days;

  return [
    {
      kind: "global_level",
      label: globalLevelTitle(globalLevel),
      reached: true,
      current: globalLevel,
      target: globalLevel,
    },
    {
      kind: "lifetime_minutes",
      label: `${nextTrophy.toLocaleString()} lifetime minutes`,
      reached: totalSkillMinutes >= nextTrophy,
      current: totalSkillMinutes,
      target: nextTrophy,
    },
    {
      kind: "global_streak",
      label: `${nextStreak}-day streak`,
      reached: longestStreak >= nextStreak,
      current: currentStreak,
      target: nextStreak,
    },
    {
      kind: "career_pipeline",
      label: "Land an offer",
      reached: hasOffer,
      current: hasOffer ? 1 : 0,
      target: 1,
    },
  ];
}

export function buildProgressionSnapshot(
  payload: AppPayload,
  gamificationState?: GamificationState,
  now: Date = new Date()
): ProgressionSnapshot {
  const context = buildProgressionContext(payload, now);
  const generatedAtIso = now.toISOString();
  const todayKey = context.todayKey;

  const baseGrants = listXpGrants(context);
  const quests = evaluateQuests(context, generatedAtIso);
  const completedQuestGrants = questCompletionGrants(
    [...quests.daily, ...quests.weekly, ...quests.monthly],
    todayKey
  );

  const grantsWithQuests = dedupeGrants([...baseGrants, ...completedQuestGrants]);

  // Levels before achievement XP, used to evaluate level-based achievements.
  const totalsPre = computeTrackTotals(grantsWithQuests, context.axisBySkillId);
  const globalPre = buildGlobalLevelState(totalsPre);
  const axesPre = buildAxisLevelStates(totalsPre);

  const achievements = evaluateAchievements(
    context,
    { global: globalPre, axes: axesPre },
    generatedAtIso
  );

  const achievementGrants: XpGrant[] = [];
  for (const unlock of achievements.unlocked) {
    const def = getAchievementById(unlock.definitionId);
    if (def?.grantXp && def.grantXp > 0) {
      achievementGrants.push({
        id: `achievement_grant:${def.id}`,
        source: "achievement_grant",
        trackId: GLOBAL_TRACK_ID,
        amount: def.grantXp,
      });
    }
  }

  const allGrants = applyDailyBonusCap(
    dedupeGrants([...grantsWithQuests, ...achievementGrants])
  );

  const totals = computeTrackTotals(allGrants, context.axisBySkillId);
  const globalLevel = buildGlobalLevelState(totals);
  const axes = buildAxisLevelStates(totals);

  const globalStreak: StreakState = {
    trackId: GLOBAL_TRACK_ID,
    current: context.globalProgression.currentStreak,
    longest: context.globalProgression.longestStreak,
    activeToday: context.globalProgression.streakActiveToday,
  };

  const skills: SkillProgressionView[] = context.skills.map((skill) => {
    const axis = context.axisBySkillId.get(skill.id) ?? "mind";
    const prog = context.skillProgressionById.get(skill.id);
    const bonusXpToday = allGrants
      .filter(
        (g) =>
          g.trackId === skillTrackId(skill.id) &&
          g.source !== "skill_minutes" &&
          g.dayKey === todayKey
      )
      .reduce((sum, g) => sum + g.amount, 0);

    return {
      skillId: skill.id,
      skillName: skill.name,
      axis,
      level: buildSkillLevelState(skill.id, totals),
      streak: {
        trackId: skillTrackId(skill.id),
        current: prog?.currentStreak ?? 0,
        longest: prog?.longestStreak ?? 0,
        activeToday: prog?.streakActiveToday ?? false,
      },
      totalXp: totals.bySkill.get(skill.id) ?? 0,
      bonusXpToday,
    };
  });

  const grantsToday = allGrants.filter((g) => g.dayKey === todayKey);
  const xpToday = grantsToday.reduce((sum, g) => sum + g.amount, 0);

  const acknowledgedLevel = gamificationState?.lastAcknowledgedGlobalLevel ?? 0;
  const pendingLevelUps: LevelUpNotification[] =
    globalLevel.level > acknowledgedLevel
      ? [
          {
            trackId: GLOBAL_TRACK_ID,
            previousLevel: acknowledgedLevel,
            newLevel: globalLevel.level,
          },
        ]
      : [];

  const dismissed = new Set(gamificationState?.dismissedAchievementIds ?? []);
  const newlyUnlocked = achievements.unlocked.filter(
    (u) => !dismissed.has(u.definitionId)
  );

  const hasOffer = context.careerStatusReached.some((r) => r.status === "offer");
  const milestones = buildMilestones(
    context.totalSkillMinutes,
    globalLevel.level,
    globalStreak.current,
    globalStreak.longest,
    hasOffer
  );

  return {
    generatedAtIso,
    todayKey,
    global: { ...globalLevel, streak: globalStreak },
    axes,
    skills,
    grantsToday,
    xpToday,
    pendingLevelUps,
    achievements: {
      unlocked: achievements.unlocked,
      newlyUnlocked,
      inProgress: achievements.inProgress,
    },
    quests,
    milestones,
  };
}
