import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type { LifeEvent, Skill } from "./model";
import {
  buildUnifiedTimelineRange,
  compareUnifiedTimelineItems,
  computeDailyWorkload,
  computeDailyWorkloadForDay,
  detectConflictsForDay,
  isForecastableTimed,
  sortUnifiedTimelineItems,
  summarizeWeek,
  type LifeEventTimelineItem,
  type ScheduleBlockTimelineItem,
  type UnifiedTimelineDay,
} from "./timeline";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SKILL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-05-26T12:00:00.000Z";
const TUE = "2026-05-26";
const WED = "2026-05-27";

function makeSkill(overrides: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    priority: 2,
    schedule: defaultWeeklySchedule(),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function makeEvent(
  id: string,
  date: string,
  title: string,
  startTime?: string,
  endTime?: string
): LifeEvent {
  return {
    id,
    title,
    date,
    type: "other",
    startTime,
    endTime,
    reminder: false,
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
}

function scheduleItem(
  overrides: Partial<ScheduleBlockTimelineItem> & {
    skillId: string;
    blockId: string;
    date: string;
  }
): ScheduleBlockTimelineItem {
  return {
    kind: "scheduleBlock",
    title: "Skill",
    skillName: "Skill",
    startTime: "09:00",
    endTime: "09:30",
    startMin: 540,
    endMin: 570,
    durationMinutes: 30,
    plannedMinutes: 30,
    ...overrides,
  };
}

function eventItem(
  overrides: Partial<LifeEventTimelineItem> & { eventId: string; date: string; title: string }
): LifeEventTimelineItem {
  return {
    kind: "lifeEvent",
    eventType: "other",
    reminder: false,
    ...overrides,
  };
}

describe("timeline sorting", () => {
  it("sorts by date ascending across days", () => {
    const items = sortUnifiedTimelineItems([
      scheduleItem({ skillId: SKILL_A, blockId: "b1", date: WED, startTime: "09:00", endTime: "09:30" }),
      scheduleItem({ skillId: SKILL_A, blockId: "b2", date: TUE, startTime: "14:00", endTime: "14:30" }),
    ]);

    expect(items.map((item) => item.date)).toEqual([TUE, WED]);
  });

  it("sorts timed ranges before time-anchored markers before untimed", () => {
    const sorted = sortUnifiedTimelineItems([
      eventItem({ eventId: "u", date: TUE, title: "Untimed" }),
      eventItem({
        eventId: "a",
        date: TUE,
        title: "Anchored",
        startTime: "12:00",
        startMin: 720,
      }),
      scheduleItem({
        skillId: SKILL_A,
        blockId: "t",
        date: TUE,
        title: "Timed",
        startTime: "09:00",
        endTime: "10:00",
        startMin: 540,
        endMin: 600,
        durationMinutes: 60,
        plannedMinutes: 60,
      }),
    ]);

    expect(sorted.map((item) => item.title)).toEqual(["Timed", "Anchored", "Untimed"]);
  });

  it("sorts timed items by startTime then endTime", () => {
    const a = scheduleItem({
      skillId: SKILL_A,
      blockId: "a",
      date: TUE,
      title: "Late start",
      startTime: "14:00",
      endTime: "15:00",
      startMin: 840,
      endMin: 900,
    });
    const b = scheduleItem({
      skillId: SKILL_B,
      blockId: "b",
      date: TUE,
      title: "Early start",
      startTime: "09:00",
      endTime: "10:00",
      startMin: 540,
      endMin: 600,
    });

    expect(compareUnifiedTimelineItems(b, a)).toBeLessThan(0);
  });

  it("uses title then stable id as tiebreaker", () => {
    const alpha = eventItem({ eventId: "b", date: TUE, title: "Alpha" });
    const beta = eventItem({ eventId: "a", date: TUE, title: "Beta" });
    expect(compareUnifiedTimelineItems(alpha, beta)).toBeLessThan(0);
  });
});

describe("buildUnifiedTimelineRange", () => {
  it("expands schedule blocks for each date in range with computed endTime", () => {
    const skill = makeSkill({
      id: SKILL_A,
      name: "SQL",
      schedule: {
        ...defaultWeeklySchedule(),
        tue: [{ id: "b1", startTime: "09:00", minutes: 45 }],
      },
    });

    const days = buildUnifiedTimelineRange([skill], [], TUE, TUE);
    expect(days).toHaveLength(1);
    expect(days[0].items).toHaveLength(1);

    const block = days[0].items[0];
    expect(block.kind).toBe("scheduleBlock");
    if (block.kind === "scheduleBlock") {
      expect(block.endTime).toBe("09:45");
      expect(block.plannedMinutes).toBe(45);
    }
  });

  it("includes events in range and excludes out-of-range events", () => {
    const days = buildUnifiedTimelineRange(
      [],
      [
        makeEvent("e1", TUE, "Today"),
        makeEvent("e2", "2026-05-20", "Past"),
        makeEvent("e3", WED, "Tomorrow"),
      ],
      TUE,
      TUE
    );

    expect(days[0].items).toHaveLength(1);
    expect(days[0].items[0].kind).toBe("lifeEvent");
    if (days[0].items[0].kind === "lifeEvent") {
      expect(days[0].items[0].eventId).toBe("e1");
    }
  });

  it("merges schedule blocks and events into one sorted day list", () => {
    const skill = makeSkill({
      id: SKILL_A,
      name: "Blender",
      schedule: {
        ...defaultWeeklySchedule(),
        tue: [{ id: "b1", startTime: "14:00", minutes: 30 }],
      },
    });

    const days = buildUnifiedTimelineRange(
      [skill],
      [makeEvent("e1", TUE, "Morning meet", "09:00", "10:00")],
      TUE,
      TUE
    );

    expect(days[0].items.map((item) => item.title)).toEqual(["Morning meet", "Blender"]);
  });

  it("excludes untimed events when includeUntimedEvents is false", () => {
    const days = buildUnifiedTimelineRange(
      [],
      [makeEvent("e1", TUE, "All day")],
      TUE,
      TUE,
      { includeUntimedEvents: false }
    );

    expect(days[0].items).toHaveLength(0);
  });

  it("treats startTime-only events as non-forecastable markers", () => {
    const days = buildUnifiedTimelineRange(
      [],
      [makeEvent("e1", TUE, "Marker", "11:00")],
      TUE,
      TUE
    );

    const item = days[0].items[0];
    expect(item.startTime).toBe("11:00");
    expect(item.endTime).toBeUndefined();
    expect(item.durationMinutes).toBeUndefined();
    expect(isForecastableTimed(item)).toBe(false);
  });
});

describe("overlap detection", () => {
  it("detects schedule vs event overlap with eventBlocksSchedule reason", () => {
    const day: UnifiedTimelineDay = {
      date: TUE,
      items: [
        scheduleItem({
          skillId: SKILL_A,
          blockId: "b1",
          date: TUE,
          title: "SQL",
          startTime: "09:00",
          endTime: "10:00",
          startMin: 540,
          endMin: 600,
          durationMinutes: 60,
          plannedMinutes: 60,
        }),
        eventItem({
          eventId: "e1",
          date: TUE,
          title: "Meeting",
          startTime: "09:30",
          endTime: "10:30",
          startMin: 570,
          endMin: 630,
          durationMinutes: 60,
        }),
      ],
      conflicts: [],
    };

    const conflicts = detectConflictsForDay(TUE, day.items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("eventBlocksSchedule");
    expect(conflicts[0].overlapMinutes).toBe(30);
    expect(conflicts[0].overlapStartTime).toBe("09:30");
    expect(conflicts[0].overlapEndTime).toBe("10:00");
    expect(conflicts[0].severity).toBe("warn");
  });

  it("detects schedule vs schedule overlap", () => {
    const dayItems = [
      scheduleItem({
        skillId: SKILL_A,
        blockId: "b1",
        date: TUE,
        startTime: "09:00",
        endTime: "10:00",
        startMin: 540,
        endMin: 600,
      }),
      scheduleItem({
        skillId: SKILL_B,
        blockId: "b2",
        date: TUE,
        startTime: "09:30",
        endTime: "10:30",
        startMin: 570,
        endMin: 630,
      }),
    ];

    const conflicts = detectConflictsForDay(TUE, dayItems);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("scheduleOverlap");
    expect(conflicts[0].severity).toBe("info");
  });

  it("does not produce overlap minutes for startTime-only events", () => {
    const days = buildUnifiedTimelineRange(
      [
        makeSkill({
          id: SKILL_A,
          name: "SQL",
          schedule: {
            ...defaultWeeklySchedule(),
            tue: [{ id: "b1", startTime: "09:00", minutes: 60 }],
          },
        }),
      ],
      [makeEvent("e1", TUE, "Marker", "09:30")],
      TUE,
      TUE
    );

    expect(days[0].conflicts).toHaveLength(0);
  });

  it("annotates hasConflict on items when building range", () => {
    const days = buildUnifiedTimelineRange(
      [
        makeSkill({
          id: SKILL_A,
          name: "SQL",
          schedule: {
            ...defaultWeeklySchedule(),
            tue: [{ id: "b1", startTime: "09:00", minutes: 60 }],
          },
        }),
      ],
      [makeEvent("e1", TUE, "Meeting", "09:00", "10:00")],
      TUE,
      TUE
    );

    expect(days[0].conflicts).toHaveLength(1);
    expect(days[0].items.every((item) => item.hasConflict)).toBe(true);
  });
});

describe("daily workload", () => {
  it("sums planned skill minutes and forecastable event blocked minutes", () => {
    const day: UnifiedTimelineDay = {
      date: TUE,
      items: [
        scheduleItem({
          skillId: SKILL_A,
          blockId: "b1",
          date: TUE,
          plannedMinutes: 60,
          durationMinutes: 60,
          startMin: 540,
          endMin: 600,
        }),
        scheduleItem({
          skillId: SKILL_B,
          blockId: "b2",
          date: TUE,
          plannedMinutes: 30,
          durationMinutes: 30,
          startMin: 840,
          endMin: 870,
        }),
        eventItem({
          eventId: "e1",
          date: TUE,
          title: "Lunch",
          startTime: "12:00",
          endTime: "13:00",
          startMin: 720,
          endMin: 780,
          durationMinutes: 60,
        }),
        eventItem({
          eventId: "e2",
          date: TUE,
          title: "Marker",
          startTime: "15:00",
          startMin: 900,
        }),
      ],
      conflicts: [],
    };

    const totals = computeDailyWorkloadForDay(day);
    expect(totals.plannedSkillMinutes).toBe(90);
    expect(totals.blockedMinutes).toBe(60);
    expect(totals.netFreeMinutes).toBe(1440 - 60);
  });

  it("counts conflict minutes only for schedule-vs-event overlaps", () => {
    const day: UnifiedTimelineDay = {
      date: TUE,
      items: [],
      conflicts: [
        {
          date: TUE,
          aId: "scheduleBlock:a:b1:2026-05-26",
          bId: "lifeEvent:e1",
          overlapStartTime: "09:30",
          overlapEndTime: "10:00",
          overlapMinutes: 30,
          severity: "warn",
          reason: "eventBlocksSchedule",
        },
        {
          date: TUE,
          aId: "scheduleBlock:a:b1:2026-05-26",
          bId: "scheduleBlock:b:b2:2026-05-26",
          overlapStartTime: "09:45",
          overlapEndTime: "10:00",
          overlapMinutes: 15,
          severity: "info",
          reason: "scheduleOverlap",
        },
      ],
    };

    const totals = computeDailyWorkloadForDay(day);
    expect(totals.conflictMinutes).toBe(30);
    expect(totals.netAvailableForSkillsMinutes).toBe(-30);
  });

  it("summarizes week totals from daily workloads", () => {
    const workloads = computeDailyWorkload([
      {
        date: TUE,
        items: [
          scheduleItem({
            skillId: SKILL_A,
            blockId: "b1",
            date: TUE,
            plannedMinutes: 60,
          }),
        ],
        conflicts: [],
      },
      {
        date: WED,
        items: [
          scheduleItem({
            skillId: SKILL_A,
            blockId: "b2",
            date: WED,
            plannedMinutes: 45,
          }),
          eventItem({
            eventId: "e1",
            date: WED,
            title: "Meet",
            startTime: "10:00",
            endTime: "11:00",
            startMin: 600,
            endMin: 660,
            durationMinutes: 60,
          }),
        ],
        conflicts: [],
      },
    ]);

    const summary = summarizeWeek(workloads);
    expect(summary.totalPlanned).toBe(105);
    expect(summary.totalBlocked).toBe(60);
    expect(workloads).toHaveLength(2);
  });
});
