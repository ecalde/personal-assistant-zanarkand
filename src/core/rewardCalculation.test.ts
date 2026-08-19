import { describe, expect, it } from "vitest";
import { defaultPayload } from "./state";
import { defaultWeeklySchedule } from "./state";
import type { AppPayload, CookingSession, Session, Skill, SupplementIntakeLog, WorkoutSession } from "./model";
import { buildProgressionContext } from "./progressionContext";
import {
  applyDailyBonusCap,
  dedupeGrants,
  listXpGrants,
} from "./rewardCalculation";
import { skillTrackId, recipeTrackId, type XpGrant } from "./progressionModel";
import { BONUS_XP, COOKING_XP, MAX_BONUS_XP_PER_DAY } from "./milestoneTables";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date(2026, 4, 26, 12, 0, 0); // Tue May 26 2026, local

function localIso(year: number, month: number, day: number, hour = 9): string {
  return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
}

function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    priority: 2,
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW.toISOString(),
    updatedAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    skillId: SKILL_A,
    minutes: 30,
    startedAtIso: localIso(2026, 5, 26),
    createdAtIso: NOW.toISOString(),
    ...overrides,
  };
}

function payloadWith(parts: Partial<AppPayload>): AppPayload {
  return { ...defaultPayload(), ...parts };
}

describe("rewardCalculation", () => {
  it("emits one base skill-minute grant per skill-day", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [
        makeSession({ id: "s1", minutes: 20, startedAtIso: localIso(2026, 5, 25) }),
        makeSession({ id: "s2", minutes: 25, startedAtIso: localIso(2026, 5, 26) }),
        makeSession({ id: "s3", minutes: 15, startedAtIso: localIso(2026, 5, 26) }),
      ],
    });
    const context = buildProgressionContext(payload, NOW);
    const grants = listXpGrants(context);

    const base = grants.filter((g) => g.source === "skill_minutes");
    expect(base).toHaveLength(2); // two distinct days
    const today = base.find((g) => g.dayKey === "2026-05-26");
    expect(today?.amount).toBe(40);
    expect(today?.trackId).toBe(skillTrackId(SKILL_A));
  });

  it("adds a daily-goal bonus only when the goal is met", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL", dailyGoalMinutes: 30 })],
      sessions: [makeSession({ id: "s1", minutes: 30, startedAtIso: localIso(2026, 5, 26) })],
    });
    const grants = listXpGrants(buildProgressionContext(payload, NOW));
    expect(grants.some((g) => g.source === "skill_daily_goal")).toBe(true);

    const under = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL", dailyGoalMinutes: 30 })],
      sessions: [makeSession({ id: "s1", minutes: 29, startedAtIso: localIso(2026, 5, 26) })],
    });
    const underGrants = listXpGrants(buildProgressionContext(under, NOW));
    expect(underGrants.some((g) => g.source === "skill_daily_goal")).toBe(false);
  });

  it("credits a workout completion to the body axis", () => {
    const workout: WorkoutSession = {
      id: "w1",
      date: "2026-05-26",
      exercises: [],
      completedAtIso: NOW.toISOString(),
      createdAtIso: NOW.toISOString(),
      updatedAtIso: NOW.toISOString(),
    };
    const payload = payloadWith({ workoutSessions: [workout] });
    const grants = listXpGrants(buildProgressionContext(payload, NOW));
    const grant = grants.find((g) => g.source === "workout_completed");
    expect(grant?.trackId).toBe("axis:body");
    expect(grant?.amount).toBe(20);
  });

  it("credits one body grant per complete supplement day, not per dose", () => {
    const protocolId = "prot-1";
    const complete: SupplementIntakeLog = {
      id: "log-1",
      protocolId,
      date: "2026-05-26",
      doses: [
        { id: "d1", slotIndex: 0, amount: 5, takenAtIso: NOW.toISOString() },
        { id: "d2", slotIndex: 1, amount: 5, takenAtIso: NOW.toISOString() },
        { id: "d3", slotIndex: 2, amount: 5, takenAtIso: NOW.toISOString() },
        { id: "d4", slotIndex: 3, amount: 5, takenAtIso: NOW.toISOString() },
      ],
      createdAtIso: NOW.toISOString(),
      updatedAtIso: NOW.toISOString(),
    };
    const partial: SupplementIntakeLog = {
      ...complete,
      id: "log-2",
      date: "2026-05-25",
      doses: [
        { id: "p1", slotIndex: 0, amount: 5, takenAtIso: NOW.toISOString() },
        { id: "p2", slotIndex: 1, amount: 5 },
      ],
    };
    const grants = listXpGrants(
      buildProgressionContext(
        payloadWith({
          supplementProtocols: [
            {
              id: protocolId,
              name: "Creatine",
              unit: "g",
              active: true,
              phases: [
                {
                  id: "phase-1",
                  kind: "maintenance",
                  startDate: "2026-05-01",
                  dosesPerDay: 1,
                  amountPerDose: 5,
                },
              ],
              createdAtIso: NOW.toISOString(),
              updatedAtIso: NOW.toISOString(),
            },
          ],
          supplementIntakeLogs: [complete, partial],
        }),
        NOW
      )
    );
    const supplementGrants = grants.filter((g) => g.source === "supplement_adherence_day");
    expect(supplementGrants).toHaveLength(1);
    expect(supplementGrants[0]).toMatchObject({
      id: `supplement_adherence_day:${protocolId}:2026-05-26`,
      trackId: "axis:body",
      amount: BONUS_XP.supplementAdherenceDay,
      dayKey: "2026-05-26",
    });
  });

  it("does not grant XP for creating a protocol with no complete days", () => {
    const grants = listXpGrants(
      buildProgressionContext(
        payloadWith({
          supplementProtocols: [
            {
              id: "prot-1",
              name: "Creatine",
              unit: "g",
              active: true,
              phases: [
                {
                  id: "phase-1",
                  kind: "maintenance",
                  startDate: "2026-05-01",
                  dosesPerDay: 1,
                  amountPerDose: 5,
                },
              ],
              createdAtIso: NOW.toISOString(),
              updatedAtIso: NOW.toISOString(),
            },
          ],
        }),
        NOW
      )
    );
    expect(grants.some((g) => g.source === "supplement_adherence_day")).toBe(false);
  });

  it("keeps supplement day grants under the daily bonus cap", () => {
    const day = "2026-05-26";
    const grants: XpGrant[] = [
      {
        id: "supp",
        source: "supplement_adherence_day",
        trackId: "axis:body",
        amount: 50,
        dayKey: day,
      },
      {
        id: "workout",
        source: "workout_completed",
        trackId: "axis:body",
        amount: 180,
        dayKey: day,
      },
    ];
    const capped = applyDailyBonusCap(grants, MAX_BONUS_XP_PER_DAY);
    const total = capped.reduce((sum, g) => sum + g.amount, 0);
    expect(total).toBe(MAX_BONUS_XP_PER_DAY);
  });

  it("dedupes grants by id", () => {
    const grants: XpGrant[] = [
      { id: "x", source: "streak_day", trackId: "global", amount: 5 },
      { id: "x", source: "streak_day", trackId: "global", amount: 5 },
    ];
    expect(dedupeGrants(grants)).toHaveLength(1);
  });

  it("caps per-day bonus XP and never touches base minutes", () => {
    const day = "2026-05-26";
    const grants: XpGrant[] = [
      { id: "base", source: "skill_minutes", trackId: skillTrackId(SKILL_A), amount: 500, dayKey: day },
      { id: "b1", source: "workout_completed", trackId: "axis:body", amount: 150, dayKey: day },
      { id: "b2", source: "people_follow_up", trackId: "axis:social", amount: 150, dayKey: day },
    ];
    const capped = applyDailyBonusCap(grants, 200);

    const base = capped.find((g) => g.id === "base");
    expect(base?.amount).toBe(500);

    const bonusTotal = capped
      .filter((g) => g.source !== "skill_minutes")
      .reduce((sum, g) => sum + g.amount, 0);
    expect(bonusTotal).toBe(200);
  });

  it("grants first-cook, home-meal, and tier-up XP for a completed cooking session", () => {
    const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const session: CookingSession = {
      id: "cook-1",
      recipeId,
      recipeTitle: "Carbonara",
      status: "completed",
      cookDate: "2026-05-26",
      startedAtIso: localIso(2026, 5, 26, 18),
      finishedAtIso: localIso(2026, 5, 26, 19),
      timers: [],
      createdAtIso: NOW.toISOString(),
      updatedAtIso: NOW.toISOString(),
    };
    const grants = listXpGrants(
      buildProgressionContext(payloadWith({ cookingSessions: [session] }), NOW)
    );

    expect(
      grants.find((g) => g.source === "cooking_first_cook")
    ).toMatchObject({
      trackId: recipeTrackId(recipeId),
      amount: COOKING_XP.firstCook,
      dayKey: "2026-05-26",
    });
    expect(
      grants.find((g) => g.source === "cooking_home_meal")
    ).toMatchObject({
      trackId: "axis:body",
      amount: COOKING_XP.homeCookedMeal,
    });
    expect(
      grants.find((g) => g.source === "cooking_mastery_tier_up")
    ).toMatchObject({
      trackId: recipeTrackId(recipeId),
      amount: COOKING_XP.masteryTierUp,
    });
    expect(grants.some((g) => g.source === "cooking_repeat")).toBe(false);
  });

  it("uses diminishing repeat XP and a one-time tier-up on the third cook", () => {
    const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    function cook(id: string, date: string): CookingSession {
      return {
        id,
        recipeId,
        recipeTitle: "Carbonara",
        status: "completed",
        cookDate: date,
        startedAtIso: `${date}T18:00:00.000Z`,
        finishedAtIso: `${date}T18:30:00.000Z`,
        timers: [],
        createdAtIso: NOW.toISOString(),
        updatedAtIso: NOW.toISOString(),
      };
    }
    const grants = listXpGrants(
      buildProgressionContext(
        payloadWith({
          cookingSessions: [
            cook("c1", "2026-05-24"),
            cook("c2", "2026-05-25"),
            cook("c3", "2026-05-26"),
          ],
        }),
        NOW
      )
    );
    const repeats = grants.filter((g) => g.source === "cooking_repeat");
    expect(repeats).toHaveLength(2);
    expect(repeats.find((g) => g.id === "cooking_repeat:c2")?.amount).toBe(18);
    expect(repeats.find((g) => g.id === "cooking_repeat:c3")?.amount).toBe(14);

    const tierUps = grants.filter((g) => g.source === "cooking_mastery_tier_up");
    expect(tierUps.map((g) => g.id)).toEqual([
      "cooking_mastery_tier_up:c1:1",
      "cooking_mastery_tier_up:c3:3",
    ]);
  });

  it("does not grant cooking XP for adding a recipe with no sessions", () => {
    const grants = listXpGrants(
      buildProgressionContext(
        payloadWith({
          recipes: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              title: "Carbonara",
              category: "dinner",
              difficulty: "easy",
              experienceLevel: "beginner",
              ingredients: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", rawText: "eggs" }],
              steps: [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  order: 0,
                  text: "Cook",
                  kind: "blocking",
                  blocksProgress: true,
                },
              ],
              equipment: [],
              gallery: [],
              source: "manual",
              createdAtIso: NOW.toISOString(),
              updatedAtIso: NOW.toISOString(),
            },
          ],
        }),
        NOW
      )
    );
    expect(grants.some((g) => g.source.startsWith("cooking_"))).toBe(false);
  });
});
