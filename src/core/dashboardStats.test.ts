import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { ScheduleBlock, Session, Skill } from "./model";
import {
  aggregateProgressTarget,
  buildSkillDayRows,
  buildTimelineItems,
  isInLocalWeek,
  minutesThisWeekForSkill,
  plannedMinutesForDay,
  startOfWeekLocal,
  totalMinutesToday,
} from "./dashboardStats";

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

describe("dashboardStats", () => {
  describe("today calculations", () => {
    it("totalMinutesToday sums sessions on the local day", () => {
      const now = new Date(2026, 4, 26, 14, 0, 0);
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 20, startedAtIso: localIso(2026, 5, 26, 9) }),
        makeSession({ skillId: SKILL_B, minutes: 15, startedAtIso: localIso(2026, 5, 26, 11) }),
        makeSession({ skillId: SKILL_A, minutes: 99, startedAtIso: localIso(2026, 5, 25, 10) }),
      ];
      expect(totalMinutesToday(sessions, now)).toBe(35);
    });

    it("buildSkillDayRows counts per-skill today minutes", () => {
      const now = new Date(2026, 4, 26, 14, 0, 0);
      const skills = [
        makeSkill({ id: SKILL_A, name: "A" }),
        makeSkill({ id: SKILL_B, name: "B" }),
      ];
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 25, startedAtIso: localIso(2026, 5, 26, 8) }),
        makeSession({ skillId: SKILL_B, minutes: 5, startedAtIso: localIso(2026, 5, 26, 9) }),
      ];
      const rows = buildSkillDayRows(skills, sessions, now);
      expect(rows.find((r) => r.skill.id === SKILL_A)?.todayMinutes).toBe(25);
      expect(rows.find((r) => r.skill.id === SKILL_B)?.todayMinutes).toBe(5);
    });

    it("plannedMinutesForDay sums block minutes for weekday", () => {
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: {
          ...defaultWeeklySchedule(),
          tue: [
            { id: "b1", startTime: "09:00", minutes: 30 },
            { id: "b2", startTime: "14:00", minutes: 45 },
          ],
        },
      });
      expect(plannedMinutesForDay(skill, "tue")).toBe(75);
    });
  });

  describe("week calculations", () => {
    it("startOfWeekLocal returns Monday 00:00 for a Wednesday", () => {
      const wed = new Date(2026, 4, 27, 15, 30, 0);
      const mon = startOfWeekLocal(wed);
      expect(mon.getDay()).toBe(1);
      expect(mon.getDate()).toBe(25);
      expect(mon.getHours()).toBe(0);
    });

    it("isInLocalWeek includes Mon–Sun of that week", () => {
      const wed = new Date(2026, 4, 27, 12, 0, 0);
      const weekStart = startOfWeekLocal(wed);
      expect(isInLocalWeek(localIso(2026, 5, 25, 8), weekStart)).toBe(true);
      expect(isInLocalWeek(localIso(2026, 5, 31, 23), weekStart)).toBe(true);
      expect(isInLocalWeek(localIso(2026, 5, 24, 23), weekStart)).toBe(false);
      expect(isInLocalWeek(localIso(2026, 6, 1, 0), weekStart)).toBe(false);
    });

    it("minutesThisWeekForSkill sums only current week for skill", () => {
      const now = new Date(2026, 4, 27, 12, 0, 0);
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 10, startedAtIso: localIso(2026, 5, 25, 9) }),
        makeSession({ skillId: SKILL_A, minutes: 20, startedAtIso: localIso(2026, 5, 27, 10) }),
        makeSession({ skillId: SKILL_A, minutes: 5, startedAtIso: localIso(2026, 5, 24, 10) }),
        makeSession({ skillId: SKILL_B, minutes: 100, startedAtIso: localIso(2026, 5, 26, 10) }),
      ];
      expect(minutesThisWeekForSkill(sessions, SKILL_A, now)).toBe(30);
    });
  });

  describe("overdue status", () => {
    it("marks skill overdue when logged minutes are below expected by now", () => {
      const now = new Date(2026, 4, 26, 10, 0, 0);
      const block: ScheduleBlock = { id: "b1", startTime: "06:00", minutes: 60 };
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: { ...defaultWeeklySchedule(), tue: [block] },
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 10, startedAtIso: localIso(2026, 5, 26, 7) }),
      ];
      const row = buildSkillDayRows([skill], sessions, now)[0];
      expect(row.expectedByNow).toBe(60);
      expect(row.status).toBe("overdue");
    });

    it("marks skill onTrack when logged minutes meet expected by now", () => {
      const now = new Date(2026, 4, 26, 10, 0, 0);
      const block: ScheduleBlock = { id: "b1", startTime: "06:00", minutes: 60 };
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: { ...defaultWeeklySchedule(), tue: [block] },
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 60, startedAtIso: localIso(2026, 5, 26, 7) }),
      ];
      const row = buildSkillDayRows([skill], sessions, now)[0];
      expect(row.status).toBe("onTrack");
    });

    it("marks skill idle when no schedule expected minutes yet", () => {
      const now = new Date(2026, 4, 26, 8, 0, 0);
      const block: ScheduleBlock = { id: "b1", startTime: "12:00", minutes: 30 };
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: { ...defaultWeeklySchedule(), tue: [block] },
      });
      const row = buildSkillDayRows([skill], [], now)[0];
      expect(row.expectedByNow).toBe(0);
      expect(row.status).toBe("idle");
    });
  });

  describe("progress percent capping", () => {
    it("uses daily goal as target when set", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        dailyGoalMinutes: 60,
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 30, startedAtIso: localIso(2026, 5, 26, 9) }),
      ];
      const row = buildSkillDayRows([skill], sessions, now)[0];
      expect(row.progressTargetMinutes).toBe(60);
      expect(row.progressPercent).toBe(50);
    });

    it("caps progress percent at 100", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        dailyGoalMinutes: 40,
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 90, startedAtIso: localIso(2026, 5, 26, 9) }),
      ];
      const row = buildSkillDayRows([skill], sessions, now)[0];
      expect(row.progressPercent).toBe(100);
    });

    it("aggregateProgressTarget sums row targets", () => {
      const now = new Date(2026, 4, 26, 12, 0, 0);
      const skills = [
        makeSkill({ id: SKILL_A, name: "A", dailyGoalMinutes: 30 }),
        makeSkill({ id: SKILL_B, name: "B", dailyGoalMinutes: 45 }),
        makeSkill({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "C" }),
      ];
      const rows = buildSkillDayRows(skills, [], now);
      expect(aggregateProgressTarget(rows)).toBe(75);
    });
  });

  describe("timeline ordering and behavior", () => {
    it("sorts timeline items by start time across skills", () => {
      const now = new Date(2026, 4, 26, 15, 0, 0);
      const skillA = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: {
          ...defaultWeeklySchedule(),
          tue: [{ id: "a1", startTime: "14:00", minutes: 30 }],
        },
      });
      const skillB = makeSkill({
        id: SKILL_B,
        name: "B",
        schedule: {
          ...defaultWeeklySchedule(),
          tue: [{ id: "b1", startTime: "09:00", minutes: 30 }],
        },
      });
      const items = buildTimelineItems([skillA, skillB], [], now);
      expect(items).toHaveLength(2);
      expect(items[0].skill.id).toBe(SKILL_B);
      expect(items[1].skill.id).toBe(SKILL_A);
    });

    it("excludes future same-day sessions from loggedSoFar on timeline", () => {
      const now = new Date(2026, 4, 26, 10, 0, 0);
      const block: ScheduleBlock = { id: "b1", startTime: "09:00", minutes: 30 };
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: { ...defaultWeeklySchedule(), tue: [block] },
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 50, startedAtIso: localIso(2026, 5, 26, 18) }),
      ];
      const items = buildTimelineItems([skill], sessions, now);
      expect(items[0].loggedSoFar).toBe(0);
      expect(items[0].status).toBe("behind");
    });

    it("includes same-day past sessions in loggedSoFar", () => {
      const now = new Date(2026, 4, 26, 11, 0, 0);
      const block: ScheduleBlock = { id: "b1", startTime: "09:00", minutes: 30 };
      const skill = makeSkill({
        id: SKILL_A,
        name: "A",
        schedule: { ...defaultWeeklySchedule(), tue: [block] },
      });
      const sessions = [
        makeSession({ skillId: SKILL_A, minutes: 30, startedAtIso: localIso(2026, 5, 26, 8) }),
      ];
      const items = buildTimelineItems([skill], sessions, now);
      expect(items[0].loggedSoFar).toBe(30);
      expect(items[0].status).toBe("done");
    });
  });
});
