// Phase 35 — Gamification data models (types + small pure helpers only).
//
// Defines the progression framework vocabulary: axes/tracks, XP grants, level
// and streak state, achievements, quests, milestones, the dashboard snapshot
// DTO, and the persisted GamificationState. No React, storage, or Supabase here.
//
// Type-only cross-import with model.ts (ApplicationStatus): types erase at
// runtime, so this stays decoupled from the domain module's logic (same pattern
// as recurrence.ts <-> model.ts).

import type { ApplicationStatus } from "./model";

// ---------------------------------------------------------------------------
// Axes and tracks
// ---------------------------------------------------------------------------

/** RPG-style progression axes. Mapped to domains, NOT calendar categoryKey. */
export type ProgressionAxis = "mind" | "body" | "career" | "social" | "creative";

export const PROGRESSION_AXES: readonly ProgressionAxis[] = [
  "mind",
  "body",
  "career",
  "social",
  "creative",
];

export const PROGRESSION_AXIS_LABELS: Record<ProgressionAxis, string> = {
  mind: "Mind",
  body: "Body",
  career: "Career",
  social: "Social",
  creative: "Creative",
};

export type ProgressionTrackKind = "global" | "axis" | "skill";

export type ProgressionTrackId =
  | "global"
  | `axis:${ProgressionAxis}`
  | `skill:${string}`;

export const GLOBAL_TRACK_ID: ProgressionTrackId = "global";

export function axisTrackId(axis: ProgressionAxis): ProgressionTrackId {
  return `axis:${axis}`;
}

export function skillTrackId(skillId: string): ProgressionTrackId {
  return `skill:${skillId}`;
}

// ---------------------------------------------------------------------------
// Rewards / ledger
// ---------------------------------------------------------------------------

export type RewardSource =
  | "skill_minutes"
  | "skill_daily_goal"
  | "skill_weekly_goal"
  | "streak_day"
  | "streak_milestone"
  | "workout_completed"
  | "workout_scheduled_slot"
  | "event_attended"
  | "career_status"
  | "career_application"
  | "people_follow_up"
  | "quest_completion"
  | "achievement_grant";

export type XpGrant = {
  /** Deterministic id used to dedupe identical grants across renders. */
  id: string;
  source: RewardSource;
  trackId: ProgressionTrackId;
  /** Integer >= 0. */
  amount: number;
  /** Local YYYY-MM-DD when the grant was earned (when known). */
  dayKey?: string;
  meta?: Record<string, string | number | boolean>;
};

export type LevelState = {
  trackId: ProgressionTrackId;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
};

export type StreakState = {
  trackId: ProgressionTrackId;
  current: number;
  longest: number;
  activeToday: boolean;
};

export type LevelUpNotification = {
  trackId: ProgressionTrackId;
  previousLevel: number;
  newLevel: number;
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export type AchievementCategory =
  | "consistency"
  | "milestones"
  | "fitness"
  | "learning"
  | "social"
  | "career";

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export type AchievementCondition =
  | { kind: "global_streak_gte"; days: number }
  | { kind: "skill_streak_gte"; days: number }
  | { kind: "global_level_gte"; level: number }
  | { kind: "axis_level_gte"; axis: ProgressionAxis; level: number }
  | { kind: "total_skill_minutes_gte"; minutes: number }
  | { kind: "workouts_completed_gte"; count: number }
  | { kind: "weekly_goal_met_count"; count: number }
  | { kind: "career_applications_gte"; count: number }
  | { kind: "career_status_reached"; status: ApplicationStatus }
  | { kind: "people_follow_ups_gte"; count: number }
  | { kind: "events_social_attended_gte"; count: number };

export type AchievementDefinition = {
  /** Stable slug, e.g. "streak_global_7". */
  id: string;
  category: AchievementCategory;
  tier: AchievementTier;
  title: string;
  description: string;
  axis?: ProgressionAxis;
  hiddenUntilUnlocked?: boolean;
  /** Optional one-time XP awarded to global on first unlock. */
  grantXp?: number;
  condition: AchievementCondition;
};

export type AchievementUnlock = {
  definitionId: string;
  /** Approximate unlock time (snapshot time in v1; no per-unlock history yet). */
  unlockedAtIso: string;
  progress?: { current: number; target: number };
};

export type AchievementProgressItem = {
  definitionId: string;
  current: number;
  target: number;
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestPeriod = "daily" | "weekly" | "monthly";

/** Quest categories per the roadmap are the periods themselves. */
export type QuestCategory = QuestPeriod;

export type QuestCondition =
  | { kind: "log_skill_minutes"; minMinutes: number }
  | { kind: "meet_any_daily_goal" }
  | { kind: "complete_workout"; count?: number }
  | { kind: "complete_scheduled_workout"; count?: number }
  | { kind: "extend_global_streak" }
  | { kind: "career_action"; minCount: number }
  | { kind: "log_people_contact"; count?: number };

export type QuestDefinition = {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  axis?: ProgressionAxis;
  rewardXp: number;
  rewardTrackId?: ProgressionTrackId;
  condition: QuestCondition;
};

export type QuestInstance = {
  /** `${period}:${periodStartKey}:${questId}`. */
  instanceId: string;
  period: QuestPeriod;
  periodStartKey: string;
  periodEndKey: string;
  definition: QuestDefinition;
  progress: { current: number; target: number };
  completed: boolean;
  completedAtIso?: string;
};

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export type MilestoneKind =
  | "global_level"
  | "lifetime_minutes"
  | "global_streak"
  | "career_pipeline";

export type MilestoneHighlight = {
  kind: MilestoneKind;
  label: string;
  reached: boolean;
  /** Current value vs the milestone threshold (for progress display). */
  current: number;
  target: number;
};

// ---------------------------------------------------------------------------
// Snapshot DTO
// ---------------------------------------------------------------------------

export type SkillProgressionView = {
  skillId: string;
  skillName: string;
  axis: ProgressionAxis;
  level: LevelState;
  streak: StreakState;
  totalXp: number;
  bonusXpToday: number;
};

export type ProgressionSnapshot = {
  generatedAtIso: string;
  todayKey: string;
  global: LevelState & { streak: StreakState };
  axes: Record<ProgressionAxis, LevelState>;
  skills: SkillProgressionView[];
  grantsToday: XpGrant[];
  xpToday: number;
  pendingLevelUps: LevelUpNotification[];
  achievements: {
    unlocked: AchievementUnlock[];
    newlyUnlocked: AchievementUnlock[];
    inProgress: AchievementUnlock[];
  };
  quests: {
    daily: QuestInstance[];
    weekly: QuestInstance[];
    monthly: QuestInstance[];
  };
  milestones: MilestoneHighlight[];
};

// ---------------------------------------------------------------------------
// Persisted state (UX acknowledgements only — domain truth stays elsewhere)
// ---------------------------------------------------------------------------

export type GamificationState = {
  /** Highest global level the user has already seen (suppresses repeat toasts). */
  lastAcknowledgedGlobalLevel?: number;
  /** Achievement ids whose "new" badge the user dismissed. */
  dismissedAchievementIds?: string[];
  updatedAtIso?: string;
};

const GAMIFICATION_STATE_ALLOWED_KEYS = [
  "lastAcknowledgedGlobalLevel",
  "dismissedAchievementIds",
  "updatedAtIso",
];
const MAX_DISMISSED_ACHIEVEMENTS = 500;

/**
 * Lenient cleanup for localStorage/backup loads: keeps valid fields, drops
 * anything malformed, returns undefined when nothing meaningful remains so old
 * payloads missing the field load unchanged (mirrors calendarPreferences).
 */
export function normalizeGamificationState(raw: unknown): GamificationState | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;

  const next: GamificationState = {};

  const level = obj.lastAcknowledgedGlobalLevel;
  if (typeof level === "number" && Number.isInteger(level) && level >= 1) {
    next.lastAcknowledgedGlobalLevel = level;
  }

  if (Array.isArray(obj.dismissedAchievementIds)) {
    const ids = obj.dismissedAchievementIds
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100)
      .slice(0, MAX_DISMISSED_ACHIEVEMENTS);
    const unique = [...new Set(ids)];
    if (unique.length > 0) next.dismissedAchievementIds = unique;
  }

  if (typeof obj.updatedAtIso === "string") {
    next.updatedAtIso = obj.updatedAtIso;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function isGamificationStateAllowedKey(key: string): boolean {
  return GAMIFICATION_STATE_ALLOWED_KEYS.includes(key);
}
