import { describe, expect, it } from "vitest";
import { defaultPayload, defaultWeeklySchedule } from "./state";
import type { AppPayload, Session, Skill } from "./model";
import { buildProgressionContext } from "./progressionContext";
import { evaluateQuests } from "./questEngine";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date(2026, 4, 26, 12, 0, 0); // Tue May 26 2026
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

describe("questEngine", () => {
  it("completes the daily 15-minute quest when enough is logged today", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [makeSession({ id: "s1", minutes: 20, startedAtIso: localIso(2026, 5, 26) })],
    });
    const quests = evaluateQuests(buildProgressionContext(payload, NOW), GEN);
    const daily = quests.daily.find((q) => q.definition.id === "daily_log_15");
    expect(daily?.progress).toEqual({ current: 15, target: 15 });
    expect(daily?.completed).toBe(true);
    expect(daily?.completedAtIso).toBe(GEN);
  });

  it("scopes weekly progress to the current week and keys the instance by week start", () => {
    const payload = payloadWith({
      skills: [makeSkill({ id: SKILL_A, name: "SQL" })],
      sessions: [
        // Monday of the current week (2026-05-25) + a prior week day (excluded).
        makeSession({ id: "s1", minutes: 60, startedAtIso: localIso(2026, 5, 25) }),
        makeSession({ id: "s2", minutes: 60, startedAtIso: localIso(2026, 5, 26) }),
        makeSession({ id: "s3", minutes: 999, startedAtIso: localIso(2026, 5, 18) }),
      ],
    });
    const quests = evaluateQuests(buildProgressionContext(payload, NOW), GEN);
    const weekly = quests.weekly.find((q) => q.definition.id === "weekly_minutes_120");
    expect(weekly?.progress.current).toBe(120);
    expect(weekly?.completed).toBe(true);
    expect(weekly?.instanceId).toBe("weekly:2026-05-25:weekly_minutes_120");
  });

  it("produces monthly instances keyed by the first of the month", () => {
    const payload = payloadWith({ skills: [makeSkill({ id: SKILL_A, name: "SQL" })] });
    const quests = evaluateQuests(buildProgressionContext(payload, NOW), GEN);
    const monthly = quests.monthly.find((q) => q.definition.id === "monthly_minutes_600");
    expect(monthly?.instanceId).toBe("monthly:2026-05-01:monthly_minutes_600");
    expect(monthly?.completed).toBe(false);
  });

  it("scores the weekly cook-3 quest from completed cooking sessions", () => {
    function cook(id: string, date: string) {
      return {
        id,
        recipeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        recipeTitle: "Carbonara",
        status: "completed" as const,
        cookDate: date,
        startedAtIso: `${date}T18:00:00.000Z`,
        finishedAtIso: `${date}T18:30:00.000Z`,
        timers: [],
        createdAtIso: GEN,
        updatedAtIso: GEN,
      };
    }
    const quests = evaluateQuests(
      buildProgressionContext(
        payloadWith({
          cookingSessions: [
            cook("c1", "2026-05-25"),
            cook("c2", "2026-05-26"),
            cook("c3", "2026-05-26"),
            cook("c4", "2026-05-18"),
          ],
        }),
        NOW
      ),
      GEN
    );
    const weekly = quests.weekly.find((q) => q.definition.id === "weekly_cook_3");
    expect(weekly?.progress).toEqual({ current: 3, target: 3 });
    expect(weekly?.completed).toBe(true);
  });

  it("scores the try-something-new quest only for first-ever cooks in the week", () => {
    function cook(id: string, date: string, recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
      return {
        id,
        recipeId,
        recipeTitle: "Carbonara",
        status: "completed" as const,
        cookDate: date,
        startedAtIso: `${date}T18:00:00.000Z`,
        finishedAtIso: `${date}T18:30:00.000Z`,
        timers: [],
        createdAtIso: GEN,
        updatedAtIso: GEN,
      };
    }
    const repeat = evaluateQuests(
      buildProgressionContext(
        payloadWith({
          cookingSessions: [cook("c1", "2026-05-18"), cook("c2", "2026-05-26")],
        }),
        NOW
      ),
      GEN
    );
    expect(repeat.weekly.find((q) => q.definition.id === "weekly_new_recipe")?.completed).toBe(
      false
    );

    const first = evaluateQuests(
      buildProgressionContext(
        payloadWith({
          cookingSessions: [cook("c1", "2026-05-26", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")],
        }),
        NOW
      ),
      GEN
    );
    expect(first.weekly.find((q) => q.definition.id === "weekly_new_recipe")?.completed).toBe(true);
    expect(first.daily.find((q) => q.definition.id === "daily_cook")?.completed).toBe(true);
  });
});
