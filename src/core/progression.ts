import type { Session, Skill } from "./model";
import { isSameLocalDay } from "./time";

/** XP minutes required per level band (linear: level L starts at (L-1) * B). */
export const XP_PER_LEVEL_BAND = 60;

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
};

export type SkillProgression = {
  skill: Skill;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
  currentStreak: number;
  longestStreak: number;
  streakActiveToday: boolean;
};

export type GlobalProgression = {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  levelProgressPercent: number;
  currentStreak: number;
  longestStreak: number;
  streakActiveToday: boolean;
};

export function totalXpForSkill(sessions: Session[], skillId: string): number {
  return sessions
    .filter((s) => s.skillId === skillId)
    .reduce((sum, s) => sum + s.minutes, 0);
}

export function totalXpGlobal(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.minutes, 0);
}

export function levelFromTotalXp(
  totalXp: number,
  bandSize: number = XP_PER_LEVEL_BAND
): LevelProgress {
  const safeXp = Math.max(0, Number.isInteger(totalXp) ? totalXp : 0);
  const safeBand = bandSize > 0 ? bandSize : XP_PER_LEVEL_BAND;
  const level = Math.floor(safeXp / safeBand) + 1;
  const xpIntoLevel = safeXp % safeBand;
  const xpToNextLevel = safeBand;
  const levelProgressPercent =
    xpToNextLevel > 0 ? Math.min(100, Math.round((xpIntoLevel / xpToNextLevel) * 100)) : 0;

  return { level, xpIntoLevel, xpToNextLevel, levelProgressPercent };
}

/** Streak day: meet daily goal when set, else any logged minutes. */
export function isStreakActiveDay(skill: Skill, dayMinutes: number): boolean {
  if (skill.dailyGoalMinutes !== undefined && skill.dailyGoalMinutes > 0) {
    return dayMinutes >= skill.dailyGoalMinutes;
  }
  return dayMinutes > 0;
}

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayKeyFromIso(iso: string): string {
  return localDayKey(new Date(iso));
}

function addDaysToKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return localDayKey(date);
}

function minutesBySkillAndDay(sessions: Session[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    const dayKey = dayKeyFromIso(session.startedAtIso);
    let skillDays = map.get(session.skillId);
    if (!skillDays) {
      skillDays = new Map();
      map.set(session.skillId, skillDays);
    }
    skillDays.set(dayKey, (skillDays.get(dayKey) ?? 0) + session.minutes);
  }

  return map;
}

function activeDaysForSkill(skill: Skill, skillDays: Map<string, number> | undefined): Set<string> {
  const active = new Set<string>();
  if (!skillDays) return active;

  for (const [dayKey, minutes] of skillDays) {
    if (isStreakActiveDay(skill, minutes)) {
      active.add(dayKey);
    }
  }

  return active;
}

export function computeCurrentStreak(activeDays: Set<string>, now: Date = new Date()): number {
  if (activeDays.size === 0) return 0;

  const todayKey = localDayKey(now);
  const yesterdayKey = addDaysToKey(todayKey, -1);

  let anchor: string | null = null;
  if (activeDays.has(todayKey)) {
    anchor = todayKey;
  } else if (activeDays.has(yesterdayKey)) {
    anchor = yesterdayKey;
  } else {
    return 0;
  }

  let streak = 0;
  let cursor = anchor;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }

  return streak;
}

export function computeLongestStreak(activeDays: Set<string>): number {
  if (activeDays.size === 0) return 0;

  const sorted = [...activeDays].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (addDaysToKey(prev, 1) === next) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function globalActiveDayKeys(
  skills: Skill[],
  bySkillDay: Map<string, Map<string, number>>
): Set<string> {
  const allDayKeys = new Set<string>();
  for (const skillDays of bySkillDay.values()) {
    for (const dayKey of skillDays.keys()) {
      allDayKeys.add(dayKey);
    }
  }

  const active = new Set<string>();
  for (const dayKey of allDayKeys) {
    for (const skill of skills) {
      const minutes = bySkillDay.get(skill.id)?.get(dayKey) ?? 0;
      if (isStreakActiveDay(skill, minutes)) {
        active.add(dayKey);
        break;
      }
    }
  }

  return active;
}

function streakActiveToday(activeDays: Set<string>, now: Date): boolean {
  return activeDays.has(localDayKey(now));
}

export function buildSkillProgressions(
  skills: Skill[],
  sessions: Session[],
  now: Date = new Date()
): SkillProgression[] {
  const bySkillDay = minutesBySkillAndDay(sessions);

  return skills.map((skill) => {
    const totalXp = totalXpForSkill(sessions, skill.id);
    const levelProgress = levelFromTotalXp(totalXp);
    const skillDays = bySkillDay.get(skill.id);
    const activeDays = activeDaysForSkill(skill, skillDays);
    const todayMinutes =
      skillDays?.get(localDayKey(now)) ??
      sessions
        .filter((s) => s.skillId === skill.id && isSameLocalDay(s.startedAtIso, now))
        .reduce((sum, s) => sum + s.minutes, 0);

    return {
      skill,
      totalXp,
      ...levelProgress,
      currentStreak: computeCurrentStreak(activeDays, now),
      longestStreak: computeLongestStreak(activeDays),
      streakActiveToday: isStreakActiveDay(skill, todayMinutes),
    };
  });
}

export function buildGlobalProgression(
  skills: Skill[],
  sessions: Session[],
  now: Date = new Date()
): GlobalProgression {
  const totalXp = totalXpGlobal(sessions);
  const levelProgress = levelFromTotalXp(totalXp);
  const bySkillDay = minutesBySkillAndDay(sessions);
  const activeDays = globalActiveDayKeys(skills, bySkillDay);

  return {
    totalXp,
    ...levelProgress,
    currentStreak: computeCurrentStreak(activeDays, now),
    longestStreak: computeLongestStreak(activeDays),
    streakActiveToday: streakActiveToday(activeDays, now),
  };
}
