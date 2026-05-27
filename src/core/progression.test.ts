import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { Session, Skill } from "./model";
import {
  buildGlobalProgression,
  buildSkillProgressions,
  computeCurrentStreak,
  computeLongestStreak,
  isStreakActiveDay,
  levelFromTotalXp,
  totalXpForSkill,
  XP_PER_LEVEL_BAND,
} from "./progression";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SKILL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
  const now = "2026-05-26T12:00:00.000Z";
  return {
    priority: 2,
    schedule: defaultWeeklySchedule(),
    createdAtIso: now,
    updatedAtIso: now,
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session>): Session {
  const now = "2026-05-26T12:00:00.000Z";
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    skillId: SKILL_A,
    minutes: 10,
    startedAtIso: now,
    createdAtIso: now,
    ...overrides,
  };
}

function localIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

describe("progression", () => {
  describe("XP and levels", () => {
    it("totalXpForSkill sums only that skill", () => {
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 20 }),
        makeSession({ skillId: SKILL_B, minutes: 40 }),
        makeSession({ skillId: SKILL_A, minutes: 15 }),
      ];
      expect(totalXpForSkill(sessions, SKILL_A)).toBe(35);
    });

    it("levelFromTotalXp: 0 XP is level 1", () => {
      const p = levelFromTotalXp(0);
      expect(p.level).toBe(1);
      expect(p.xpIntoLevel).toBe(0);
      expect(p.xpToNextLevel).toBe(XP_PER_LEVEL_BAND);
      expect(p.levelProgressPercent).toBe(0);
    });

    it("levelFromTotalXp: boundary at band size", () => {
      const at59 = levelFromTotalXp(59);
      expect(at59.level).toBe(1);
      expect(at59.xpIntoLevel).toBe(59);

      const at60 = levelFromTotalXp(60);
      expect(at60.level).toBe(2);
      expect(at60.xpIntoLevel).toBe(0);
    });

    it("levelFromTotalXp: caps progress percent at 100", () => {
      const p = levelFromTotalXp(XP_PER_LEVEL_BAND - 1);
      expect(p.levelProgressPercent).toBeLessThanOrEqual(100);
    });
  });

  describe("isStreakActiveDay", () => {
    const skillWithGoal = makeSkill({
      id: SKILL_A,
      name: "SQL",
      dailyGoalMinutes: 30,
    });
    const skillNoGoal = makeSkill({ id: SKILL_B, name: "Blender" });

    it("requires meeting daily goal when set", () => {
      expect(isStreakActiveDay(skillWithGoal, 29)).toBe(false);
      expect(isStreakActiveDay(skillWithGoal, 30)).toBe(true);
    });

    it("counts any minutes when no daily goal", () => {
      expect(isStreakActiveDay(skillNoGoal, 0)).toBe(false);
      expect(isStreakActiveDay(skillNoGoal, 1)).toBe(true);
    });
  });

  describe("computeCurrentStreak", () => {
    const now = new Date(2026, 4, 26, 14, 0, 0);

    it("returns 0 when no active days", () => {
      expect(computeCurrentStreak(new Set(), now)).toBe(0);
    });

    it("counts consecutive days ending today", () => {
      const active = new Set(["2026-05-24", "2026-05-25", "2026-05-26"]);
      expect(computeCurrentStreak(active, now)).toBe(3);
    });

    it("anchors on yesterday when today not active yet", () => {
      const active = new Set(["2026-05-24", "2026-05-25"]);
      expect(computeCurrentStreak(active, now)).toBe(2);
    });

    it("returns 0 when last active day is before yesterday", () => {
      const active = new Set(["2026-05-22", "2026-05-23"]);
      expect(computeCurrentStreak(active, now)).toBe(0);
    });
  });

  describe("computeLongestStreak", () => {
    it("finds max run across disjoint periods", () => {
      const active = new Set(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-10", "2026-05-11"]);
      expect(computeLongestStreak(active)).toBe(3);
    });
  });

  describe("buildSkillProgressions", () => {
    it("streak respects daily goal per skill", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skill = makeSkill({
        id: SKILL_A,
        name: "SQL",
        dailyGoalMinutes: 30,
      });
      const sessions = [
        makeSession({
          skillId: SKILL_A,
          minutes: 29,
          startedAtIso: localIso(2026, 5, 26, 9),
        }),
      ];
      const [prog] = buildSkillProgressions([skill], sessions, now);
      expect(prog.streakActiveToday).toBe(false);
      expect(prog.currentStreak).toBe(0);
    });

    it("counts streak when goal met", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skill = makeSkill({
        id: SKILL_A,
        name: "SQL",
        dailyGoalMinutes: 30,
      });
      const sessions = [
        makeSession({
          skillId: SKILL_A,
          minutes: 30,
          startedAtIso: localIso(2026, 5, 25, 9),
        }),
        makeSession({
          skillId: SKILL_A,
          minutes: 30,
          startedAtIso: localIso(2026, 5, 26, 9),
        }),
      ];
      const [prog] = buildSkillProgressions([skill], sessions, now);
      expect(prog.streakActiveToday).toBe(true);
      expect(prog.currentStreak).toBe(2);
    });

    it("any minutes counts when no goal", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skill = makeSkill({ id: SKILL_A, name: "Walk" });
      const sessions = [
        makeSession({
          skillId: SKILL_A,
          minutes: 5,
          startedAtIso: localIso(2026, 5, 26, 8),
        }),
      ];
      const [prog] = buildSkillProgressions([skill], sessions, now);
      expect(prog.streakActiveToday).toBe(true);
      expect(prog.currentStreak).toBe(1);
    });
  });

  describe("buildGlobalProgression", () => {
    it("global streak continues across different skills on consecutive days", () => {
      const now = new Date(2026, 4, 27, 12, 0, 0);
      const skillA = makeSkill({ id: SKILL_A, name: "A" });
      const skillB = makeSkill({ id: SKILL_B, name: "B" });
      const sessions = [
        makeSession({
          skillId: SKILL_A,
          minutes: 10,
          startedAtIso: localIso(2026, 5, 26, 9),
        }),
        makeSession({
          skillId: SKILL_B,
          minutes: 10,
          startedAtIso: localIso(2026, 5, 27, 9),
        }),
      ];
      const global = buildGlobalProgression([skillA, skillB], sessions, now);
      expect(global.currentStreak).toBe(2);
      expect(global.streakActiveToday).toBe(true);
    });

    it("global totalXp sums all sessions", () => {
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 20 }),
        makeSession({ skillId: SKILL_B, minutes: 40 }),
      ];
      const global = buildGlobalProgression(
        [
          makeSkill({ id: SKILL_A, name: "A" }),
          makeSkill({ id: SKILL_B, name: "B" }),
        ],
        sessions
      );
      expect(global.totalXp).toBe(60);
      expect(global.level).toBe(2);
    });
  });

  describe("goal change recalculates streak", () => {
    it("stricter goal removes previously active days", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const sessions = [
        makeSession({
          skillId: SKILL_A,
          minutes: 20,
          startedAtIso: localIso(2026, 5, 26, 9),
        }),
      ];
      const loose = makeSkill({ id: SKILL_A, name: "SQL" });
      const strict = makeSkill({ id: SKILL_A, name: "SQL", dailyGoalMinutes: 30 });

      const [looseProg] = buildSkillProgressions([loose], sessions, now);
      const [strictProg] = buildSkillProgressions([strict], sessions, now);

      expect(looseProg.streakActiveToday).toBe(true);
      expect(strictProg.streakActiveToday).toBe(false);
    });
  });
});
