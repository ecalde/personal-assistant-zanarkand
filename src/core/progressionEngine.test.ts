import { describe, expect, it } from "vitest";
import {
  buildAxisLevelStates,
  buildGlobalLevelState,
  buildSkillLevelState,
  computeTrackTotals,
} from "./progressionEngine";
import { axisTrackId, skillTrackId, type ProgressionAxis, type XpGrant } from "./progressionModel";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function grant(overrides: Partial<XpGrant> & { id: string; trackId: XpGrant["trackId"]; amount: number }): XpGrant {
  return { source: "skill_minutes", ...overrides };
}

describe("progressionEngine", () => {
  it("routes skill grants into their axis and into global exactly once", () => {
    const axisBySkillId = new Map<string, ProgressionAxis>([[SKILL_A, "mind"]]);
    const grants: XpGrant[] = [
      grant({ id: "g1", trackId: skillTrackId(SKILL_A), amount: 40 }),
      grant({ id: "g2", trackId: axisTrackId("body"), amount: 20, source: "workout_completed" }),
      grant({ id: "g3", trackId: "global", amount: 5, source: "streak_day" }),
    ];

    const totals = computeTrackTotals(grants, axisBySkillId);

    expect(totals.global).toBe(65);
    expect(totals.bySkill.get(SKILL_A)).toBe(40);
    expect(totals.byAxis.mind).toBe(40);
    expect(totals.byAxis.body).toBe(20);
  });

  it("defaults unknown skill axis to mind", () => {
    const grants: XpGrant[] = [grant({ id: "g1", trackId: skillTrackId(SKILL_A), amount: 30 })];
    const totals = computeTrackTotals(grants, new Map());
    expect(totals.byAxis.mind).toBe(30);
  });

  it("builds level states using the linear band", () => {
    const totals = computeTrackTotals(
      [grant({ id: "g1", trackId: "global", amount: 120 })],
      new Map()
    );
    const global = buildGlobalLevelState(totals);
    expect(global.totalXp).toBe(120);
    expect(global.level).toBe(3);

    const axes = buildAxisLevelStates(totals);
    expect(axes.mind.level).toBe(1);

    const skill = buildSkillLevelState(SKILL_A, totals);
    expect(skill.totalXp).toBe(0);
    expect(skill.level).toBe(1);
  });
});
