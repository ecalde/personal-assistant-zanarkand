import { describe, expect, it } from "vitest";
import { defaultPayload, defaultWeeklySchedule } from "./state";
import type { AppPayload, JobApplication, Session, Skill } from "./model";
import { buildProgressionContext } from "./progressionContext";
import { evaluateAchievements } from "./achievementEngine";
import { buildAxisLevelStates, buildGlobalLevelState, computeTrackTotals } from "./progressionEngine";
import { listXpGrants } from "./rewardCalculation";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date(2026, 4, 26, 12, 0, 0);
const GEN = NOW.toISOString();

function localIso(year: number, month: number, day: number, hour = 9): string {
  return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    priority: 2,
    schedule: defaultWeeklySchedule(),
    createdAtIso: GEN,
    updatedAtIso: GEN,
    ...overrides,
  };
}

function payloadWith(parts: Partial<AppPayload>): AppPayload {
  return { ...defaultPayload(), ...parts };
}

function evaluate(payload: AppPayload) {
  const context = buildProgressionContext(payload, NOW);
  const totals = computeTrackTotals(listXpGrants(context), context.axisBySkillId);
  return evaluateAchievements(
    context,
    { global: buildGlobalLevelState(totals), axes: buildAxisLevelStates(totals) },
    GEN
  );
}

describe("achievementEngine", () => {
  it("unlocks the first-session achievement once any minutes are logged", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [
        {
          id: "s1",
          skillId: SKILL_A,
          minutes: 10,
          startedAtIso: localIso(2026, 5, 26),
          createdAtIso: GEN,
        } satisfies Session,
      ],
    });
    const result = evaluate(payload);
    expect(result.unlocked.some((u) => u.definitionId === "first_session")).toBe(true);
  });

  it("reports in-progress for partially-met thresholds", () => {
    const apps: JobApplication[] = [
      {
        id: "app-1",
        company: "Acme",
        roleTitle: "Engineer",
        status: "applied",
        requiredSkillIds: [],
        createdAtIso: GEN,
        updatedAtIso: GEN,
      },
    ];
    const result = evaluate(payloadWith({ jobApplications: apps }));
    expect(result.unlocked.some((u) => u.definitionId === "first_application")).toBe(true);
    const pipeline = result.inProgress.find((u) => u.definitionId === "pipeline_active_3");
    expect(pipeline?.progress).toEqual({ current: 1, target: 3 });
  });

  it("unlocks career stage achievement when an onsite is reached", () => {
    const apps: JobApplication[] = [
      {
        id: "app-1",
        company: "Acme",
        roleTitle: "Engineer",
        status: "onsite",
        requiredSkillIds: [],
        createdAtIso: GEN,
        updatedAtIso: GEN,
      },
    ];
    const result = evaluate(payloadWith({ jobApplications: apps }));
    expect(result.unlocked.some((u) => u.definitionId === "status_onsite")).toBe(true);
  });
});
