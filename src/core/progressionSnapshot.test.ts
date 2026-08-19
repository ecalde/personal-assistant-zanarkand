import { describe, expect, it } from "vitest";
import { defaultPayload, defaultWeeklySchedule } from "./state";
import type { AppPayload, Session, Skill } from "./model";
import { buildProgressionSnapshot } from "./progressionSnapshot";
import type { GamificationState } from "./progressionModel";

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

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    skillId: SKILL_A,
    minutes: 30,
    startedAtIso: localIso(2026, 5, 26),
    createdAtIso: GEN,
    ...overrides,
  };
}

function payloadWith(parts: Partial<AppPayload>): AppPayload {
  return { ...defaultPayload(), ...parts };
}

describe("buildProgressionSnapshot", () => {
  it("returns an empty-but-valid snapshot for an empty payload", () => {
    const snapshot = buildProgressionSnapshot(defaultPayload(), undefined, NOW);
    expect(snapshot.global.level).toBe(1);
    expect(snapshot.global.totalXp).toBe(0);
    expect(snapshot.skills).toHaveLength(0);
    expect(snapshot.quests.daily.length).toBeGreaterThan(0);
    expect(snapshot.todayKey).toBe("2026-05-26");
  });

  it("sums base minutes and today bonuses into global XP and grantsToday", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL", dailyGoalMinutes: 30 })],
      sessions: [makeSession({ id: "s1", minutes: 30, startedAtIso: localIso(2026, 5, 26) })],
    });
    const snapshot = buildProgressionSnapshot(payload, undefined, NOW);

    // 30 base minutes + 15 daily goal + 5 streak day + quest rewards >= 50.
    expect(snapshot.global.totalXp).toBeGreaterThanOrEqual(50);
    expect(snapshot.xpToday).toBeGreaterThan(0);
    expect(snapshot.grantsToday.some((g) => g.source === "skill_minutes")).toBe(true);
    expect(snapshot.axes.mind.totalXp).toBeGreaterThanOrEqual(45);
  });

  it("flags a pending level-up when global level exceeds the acknowledged level", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [makeSession({ id: "s1", minutes: 130, startedAtIso: localIso(2026, 5, 26) })],
    });

    const unseen = buildProgressionSnapshot(payload, undefined, NOW);
    expect(unseen.global.level).toBeGreaterThanOrEqual(2);
    expect(unseen.pendingLevelUps).toHaveLength(1);

    const acked: GamificationState = {
      lastAcknowledgedGlobalLevel: unseen.global.level,
    };
    const seen = buildProgressionSnapshot(payload, acked, NOW);
    expect(seen.pendingLevelUps).toHaveLength(0);
  });

  it("hides newly-unlocked achievements that were dismissed", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [makeSession({ id: "s1", minutes: 10, startedAtIso: localIso(2026, 5, 26) })],
    });

    const fresh = buildProgressionSnapshot(payload, undefined, NOW);
    expect(fresh.achievements.newlyUnlocked.some((u) => u.definitionId === "first_session")).toBe(
      true
    );

    const dismissed = buildProgressionSnapshot(
      payload,
      { dismissedAchievementIds: ["first_session"] },
      NOW
    );
    expect(
      dismissed.achievements.newlyUnlocked.some((u) => u.definitionId === "first_session")
    ).toBe(false);
    expect(dismissed.achievements.unlocked.some((u) => u.definitionId === "first_session")).toBe(
      true
    );
  });

  it("routes cooking XP to creative and body without granting XP for a recipe with no cooks", () => {
    const recipeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const emptyRecipe = payloadWith({
      recipes: [
        {
          id: recipeId,
          title: "Carbonara",
          category: "dinner",
          difficulty: "easy",
          experienceLevel: "beginner",
          ingredients: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", rawText: "eggs" }],
          steps: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              order: 0,
              text: "Cook",
              kind: "blocking",
              blocksProgress: true,
            },
          ],
          equipment: [],
          gallery: [],
          source: "manual",
          createdAtIso: GEN,
          updatedAtIso: GEN,
        },
      ],
    });
    const unused = buildProgressionSnapshot(emptyRecipe, undefined, NOW);
    expect(unused.axes.creative.totalXp).toBe(0);

    const cooked = buildProgressionSnapshot(
      payloadWith({
        cookingSessions: [
          {
            id: "cook-1",
            recipeId,
            recipeTitle: "Carbonara",
            status: "completed",
            cookDate: "2026-05-26",
            startedAtIso: localIso(2026, 5, 26, 18),
            finishedAtIso: localIso(2026, 5, 26, 19),
            timers: [],
            createdAtIso: GEN,
            updatedAtIso: GEN,
          },
        ],
      }),
      undefined,
      NOW
    );
    expect(cooked.axes.creative.totalXp).toBeGreaterThan(0);
    expect(cooked.axes.body.totalXp).toBeGreaterThan(0);
    expect(cooked.grantsToday.some((g) => g.source === "cooking_first_cook")).toBe(true);
    expect(cooked.achievements.unlocked.some((u) => u.definitionId === "first_cook")).toBe(true);
  });
});
