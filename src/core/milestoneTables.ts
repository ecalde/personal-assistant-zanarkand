// Phase 35 — Milestone threshold tables.
//
// Static, versioned tables reused by the reward calculation and achievement
// engines so thresholds live in one place. No runtime logic beyond simple
// lookups; pure data plus tiny total helpers.

export const XP_PER_LEVEL_BAND_GLOBAL = 60;

/** Optional band-size multipliers per track kind (level curve config, v1 = 1x). */
export const LEVEL_BAND_MULTIPLIERS = {
  global: 1,
  axis: 1,
  skill: 1,
} as const;

/** Streak day thresholds that grant a one-time milestone bonus, and the XP each gives. */
export const STREAK_MILESTONES: ReadonlyArray<{ days: number; xp: number }> = [
  { days: 3, xp: 10 },
  { days: 7, xp: 25 },
  { days: 14, xp: 50 },
  { days: 30, xp: 100 },
  { days: 60, xp: 200 },
  { days: 90, xp: 300 },
];

/** Lifetime logged-minute trophies surfaced as milestone highlights. */
export const LIFETIME_MINUTE_TROPHIES: readonly number[] = [100, 500, 1000, 5000, 10000];

/** Global level titles for early levels (falls back to "Level N" beyond the table). */
export const GLOBAL_LEVEL_TITLES: Record<number, string> = {
  1: "Getting Started",
  2: "Warming Up",
  3: "Finding Rhythm",
  5: "Committed",
  10: "Dedicated",
  20: "Relentless",
  50: "Legendary",
};

export function globalLevelTitle(level: number): string {
  const exact = GLOBAL_LEVEL_TITLES[level];
  if (exact) return exact;

  let best = "";
  let bestLevel = 0;
  for (const key of Object.keys(GLOBAL_LEVEL_TITLES)) {
    const n = Number(key);
    if (n <= level && n >= bestLevel) {
      bestLevel = n;
      best = GLOBAL_LEVEL_TITLES[n]!;
    }
  }
  return best || `Level ${level}`;
}

// Bonus XP amounts (kept here so reward sources share one source of truth).
export const BONUS_XP = {
  skillDailyGoal: 15,
  skillWeeklyGoal: 50,
  globalStreakDay: 5,
  workoutCompleted: 20,
  workoutScheduledSlot: 10,
  eventAttended: 10,
  careerStatusForward: 30,
  careerApplication: 15,
  peopleFollowUp: 20,
} as const;

/** Maximum bonus (non base-minutes) XP creditable per local day. */
export const MAX_BONUS_XP_PER_DAY = 200;
