// Phase 35 — Reward calculation engine.
//
// Translates a ProgressionContext into a deterministic list of XpGrants. Pure:
// total functions, no mutation, stable ids so identical grants dedupe across
// renders. Quest- and achievement-sourced grants are added by the snapshot
// orchestrator (they depend on the other engines), not here.

import {
  axisTrackId,
  skillTrackId,
  GLOBAL_TRACK_ID,
  type XpGrant,
} from "./progressionModel";
import {
  BONUS_XP,
  MAX_BONUS_XP_PER_DAY,
  STREAK_MILESTONES,
} from "./milestoneTables";
import type { ProgressionContext } from "./progressionContext";

function pushGrant(grants: XpGrant[], grant: XpGrant): void {
  if (!Number.isFinite(grant.amount) || grant.amount <= 0) return;
  grants.push({ ...grant, amount: Math.round(grant.amount) });
}

/** Base + bonus grants from domain activity (excludes quest/achievement XP). */
export function listXpGrants(context: ProgressionContext): XpGrant[] {
  const grants: XpGrant[] = [];

  // Base skill minutes (1 XP / minute) -> skill track (rolls into axis + global).
  for (const [skillId, days] of context.minutesBySkillDay) {
    for (const [dayKey, minutes] of days) {
      pushGrant(grants, {
        id: `skill_minutes:${skillId}:${dayKey}`,
        source: "skill_minutes",
        trackId: skillTrackId(skillId),
        amount: minutes,
        dayKey,
      });
    }
  }

  // Daily goal bonus.
  for (const [skillId, dayKeys] of context.dailyGoalMetDaysBySkill) {
    for (const dayKey of dayKeys) {
      pushGrant(grants, {
        id: `skill_daily_goal:${skillId}:${dayKey}`,
        source: "skill_daily_goal",
        trackId: skillTrackId(skillId),
        amount: BONUS_XP.skillDailyGoal,
        dayKey,
      });
    }
  }

  // Weekly goal bonus.
  for (const [skillId, weekKeys] of context.weeklyGoalMetWeeksBySkill) {
    for (const weekKey of weekKeys) {
      pushGrant(grants, {
        id: `skill_weekly_goal:${skillId}:${weekKey}`,
        source: "skill_weekly_goal",
        trackId: skillTrackId(skillId),
        amount: BONUS_XP.skillWeeklyGoal,
        dayKey: weekKey,
      });
    }
  }

  // Global streak day bonus.
  for (const dayKey of context.globalActiveDayKeys) {
    pushGrant(grants, {
      id: `streak_day:${dayKey}`,
      source: "streak_day",
      trackId: GLOBAL_TRACK_ID,
      amount: BONUS_XP.globalStreakDay,
      dayKey,
    });
  }

  // Streak milestones (based on longest streak, so totals stay monotonic).
  for (const { days, xp } of STREAK_MILESTONES) {
    if (context.globalProgression.longestStreak >= days) {
      pushGrant(grants, {
        id: `streak_milestone:global:${days}`,
        source: "streak_milestone",
        trackId: GLOBAL_TRACK_ID,
        amount: xp,
      });
    }
  }
  for (const prog of context.skillProgressions) {
    for (const { days, xp } of STREAK_MILESTONES) {
      if (prog.longestStreak >= days) {
        pushGrant(grants, {
          id: `streak_milestone:skill:${prog.skill.id}:${days}`,
          source: "streak_milestone",
          trackId: skillTrackId(prog.skill.id),
          amount: xp,
        });
      }
    }
  }

  // Workout completions -> Body axis.
  for (const session of context.workoutSessions) {
    pushGrant(grants, {
      id: `workout_completed:${session.id}`,
      source: "workout_completed",
      trackId: axisTrackId("body"),
      amount: BONUS_XP.workoutCompleted,
      dayKey: session.date,
    });
  }
  for (const slot of context.scheduledWorkoutCompletions) {
    pushGrant(grants, {
      id: `workout_scheduled_slot:${slot.planId}:${slot.dateKey}`,
      source: "workout_scheduled_slot",
      trackId: axisTrackId("body"),
      amount: BONUS_XP.workoutScheduledSlot,
      dayKey: slot.dateKey,
    });
  }

  // Career -> Career axis.
  for (const app of context.jobApplications) {
    pushGrant(grants, {
      id: `career_application:${app.id}`,
      source: "career_application",
      trackId: axisTrackId("career"),
      amount: BONUS_XP.careerApplication,
      dayKey: app.updatedAtIso.slice(0, 10),
    });
  }
  for (const reached of context.careerStatusReached) {
    if (reached.progressOrder < 2) continue; // applied-only already credited above
    pushGrant(grants, {
      id: `career_status:${reached.applicationId}:${reached.status}`,
      source: "career_status",
      trackId: axisTrackId("career"),
      amount: BONUS_XP.careerStatusForward,
      dayKey: reached.dayKey,
    });
  }

  // People follow-ups -> Social axis.
  for (const contact of context.peopleContacts) {
    pushGrant(grants, {
      id: `people_follow_up:${contact.personId}:${contact.dayKey}`,
      source: "people_follow_up",
      trackId: axisTrackId("social"),
      amount: BONUS_XP.peopleFollowUp,
      dayKey: contact.dayKey,
    });
  }

  // Event attendance proxy -> Social axis.
  for (const attended of context.attendedEvents) {
    pushGrant(grants, {
      id: `event_attended:${attended.eventId}:${attended.dateKey}`,
      source: "event_attended",
      trackId: axisTrackId("social"),
      amount: BONUS_XP.eventAttended,
      dayKey: attended.dateKey,
    });
  }

  return dedupeGrants(grants);
}

/** Keeps the first grant per id (deterministic, since generation order is stable). */
export function dedupeGrants(grants: XpGrant[]): XpGrant[] {
  const seen = new Set<string>();
  const out: XpGrant[] = [];
  for (const grant of grants) {
    if (seen.has(grant.id)) continue;
    seen.add(grant.id);
    out.push(grant);
  }
  return out;
}

/**
 * Clamps per-day bonus XP (everything except base skill minutes and grants with
 * no dayKey) so a single day cannot exceed the cap. Returns a new array with
 * adjusted amounts; original order preserved. Grants reduced to 0 are dropped.
 */
export function applyDailyBonusCap(
  grants: XpGrant[],
  maxPerDay: number = MAX_BONUS_XP_PER_DAY
): XpGrant[] {
  const adjusted = new Map<string, number>();
  const sorted = [...grants].sort((a, b) => {
    const dayA = a.dayKey ?? "";
    const dayB = b.dayKey ?? "";
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    return a.id.localeCompare(b.id);
  });

  const usedByDay = new Map<string, number>();
  for (const grant of sorted) {
    if (grant.dayKey === undefined || grant.source === "skill_minutes") {
      adjusted.set(grant.id, grant.amount);
      continue;
    }
    const used = usedByDay.get(grant.dayKey) ?? 0;
    const remaining = Math.max(0, maxPerDay - used);
    const amount = Math.min(grant.amount, remaining);
    adjusted.set(grant.id, amount);
    usedByDay.set(grant.dayKey, used + amount);
  }

  const out: XpGrant[] = [];
  for (const grant of grants) {
    const amount = adjusted.get(grant.id) ?? grant.amount;
    if (amount <= 0) continue;
    out.push(amount === grant.amount ? grant : { ...grant, amount });
  }
  return out;
}
