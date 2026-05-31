// Phase 35 — Progression engine.
//
// Aggregates XpGrants into per-track totals and level states. Streak rules stay
// in progression.ts; the level curve reuses levelFromTotalXp (linear bands).
// Pure: no mutation, total functions.

import { levelFromTotalXp } from "./progression";
import {
  PROGRESSION_AXES,
  axisTrackId,
  skillTrackId,
  GLOBAL_TRACK_ID,
  type LevelState,
  type ProgressionAxis,
  type ProgressionTrackId,
  type XpGrant,
} from "./progressionModel";
import {
  LEVEL_BAND_MULTIPLIERS,
  XP_PER_LEVEL_BAND_GLOBAL,
} from "./milestoneTables";

export type TrackTotals = {
  global: number;
  byAxis: Record<ProgressionAxis, number>;
  bySkill: Map<string, number>;
};

function emptyAxisTotals(): Record<ProgressionAxis, number> {
  return { mind: 0, body: 0, career: 0, social: 0, creative: 0 };
}

function parseSkillId(trackId: ProgressionTrackId): string | null {
  return trackId.startsWith("skill:") ? trackId.slice("skill:".length) : null;
}

function parseAxis(trackId: ProgressionTrackId): ProgressionAxis | null {
  if (!trackId.startsWith("axis:")) return null;
  const axis = trackId.slice("axis:".length) as ProgressionAxis;
  return PROGRESSION_AXES.includes(axis) ? axis : null;
}

/**
 * Computes totals per track. Global aggregates every grant exactly once. Axis
 * totals include both direct axis grants and the skill grants routed to that
 * axis (via axisBySkillId).
 */
export function computeTrackTotals(
  grants: XpGrant[],
  axisBySkillId: Map<string, ProgressionAxis>
): TrackTotals {
  const byAxis = emptyAxisTotals();
  const bySkill = new Map<string, number>();
  let global = 0;

  for (const grant of grants) {
    const amount = grant.amount;
    if (amount <= 0) continue;
    global += amount;

    const skillId = parseSkillId(grant.trackId);
    if (skillId !== null) {
      bySkill.set(skillId, (bySkill.get(skillId) ?? 0) + amount);
      const axis = axisBySkillId.get(skillId) ?? "mind";
      byAxis[axis] += amount;
      continue;
    }

    const axis = parseAxis(grant.trackId);
    if (axis !== null) {
      byAxis[axis] += amount;
    }
  }

  return { global, byAxis, bySkill };
}

function bandSizeFor(kind: "global" | "axis" | "skill"): number {
  return XP_PER_LEVEL_BAND_GLOBAL * LEVEL_BAND_MULTIPLIERS[kind];
}

export function computeLevelState(
  trackId: ProgressionTrackId,
  totalXp: number,
  bandSize: number
): LevelState {
  const progress = levelFromTotalXp(totalXp, bandSize);
  return {
    trackId,
    totalXp,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpToNextLevel: progress.xpToNextLevel,
    levelProgressPercent: progress.levelProgressPercent,
  };
}

export function buildGlobalLevelState(totals: TrackTotals): LevelState {
  return computeLevelState(GLOBAL_TRACK_ID, totals.global, bandSizeFor("global"));
}

export function buildAxisLevelStates(
  totals: TrackTotals
): Record<ProgressionAxis, LevelState> {
  const band = bandSizeFor("axis");
  return {
    mind: computeLevelState(axisTrackId("mind"), totals.byAxis.mind, band),
    body: computeLevelState(axisTrackId("body"), totals.byAxis.body, band),
    career: computeLevelState(axisTrackId("career"), totals.byAxis.career, band),
    social: computeLevelState(axisTrackId("social"), totals.byAxis.social, band),
    creative: computeLevelState(axisTrackId("creative"), totals.byAxis.creative, band),
  };
}

export function buildSkillLevelState(
  skillId: string,
  totals: TrackTotals
): LevelState {
  return computeLevelState(
    skillTrackId(skillId),
    totals.bySkill.get(skillId) ?? 0,
    bandSizeFor("skill")
  );
}
