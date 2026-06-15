import { describe, expect, it } from "vitest";
import type {
  CareerTarget,
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import { defaultWeeklySchedule } from "./state";
import {
  addDaysIso,
  addHoursIso,
  buildDailyFocusSummary,
  collectSkillFocusItems,
  endOfLocalDayIso,
  filterExpiredFocusItems,
  formatFocusActionLabel,
  formatFocusContextLine,
  formatFocusExpirationHint,
  mergeFocusItems,
  priorityFromScore,
  rankFocusItems,
  scoreFocusItem,
  type FocusItem,
  type FocusItemDraft,
} from "./focus";

const TODAY = "2026-05-27";
const NOW_EVENING = new Date(2026, 4, 27, 18, 30, 0);
const NOW_MORNING = new Date(2026, 4, 27, 9, 0, 0);
const ISO = "2026-05-26T12:00:00.000Z";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SKILL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const APP_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "55555555-5555-4555-8555-555555555555";

function sampleSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: SKILL_A,
    name: "TypeScript",
    schedule: defaultWeeklySchedule(),
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    skillId: SKILL_A,
    minutes: 10,
    startedAtIso: new Date(2026, 4, 27, 8, 0, 0).toISOString(),
    createdAtIso: ISO,
    ...overrides,
  };
}

function sampleEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: EVENT_ID,
    title: "Team standup",
    date: TODAY,
    type: "other",
    reminder: false,
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function samplePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: PERSON_ID,
    name: "Alex",
    birthdayMonthDay: "05-27",
    lastContactDate: "2026-04-01",
    contactCadenceDays: 14,
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleApplication(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: APP_ID,
    company: "Acme Corp",
    roleTitle: "Software Engineer",
    status: "saved",
    requiredSkillIds: [SKILL_A],
    interviews: [],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleTarget(overrides: Partial<CareerTarget> = {}): CareerTarget {
  return {
    id: TARGET_ID,
    roleTitle: "Staff Engineer",
    requiredSkillIds: [SKILL_B],
    updatedAtIso: ISO,
    ...overrides,
  };
}

function samplePlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Push A",
    focus: "push",
    exercises: [{ id: "ex1", name: "Bench press", sets: 3, reps: 10 }],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleWorkoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: SESSION_ID,
    date: "2026-05-20",
    focus: "push",
    exercises: [{ id: "ex1", name: "Squat", sets: 3, reps: 5 }],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<Parameters<typeof buildDailyFocusSummary>[0]> = {}) {
  return {
    skills: [],
    sessions: [],
    events: [],
    people: [],
    jobApplications: [],
    workoutPlans: [],
    workoutSessions: [],
    todayKey: TODAY,
    now: NOW_EVENING,
    ...overrides,
  };
}

describe("time helpers", () => {
  it("endOfLocalDayIso returns local end-of-day timestamp", () => {
    const iso = endOfLocalDayIso("2026-05-27");
    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
  });

  it("addHoursIso shifts timestamp forward", () => {
    const base = "2026-05-27T10:00:00.000Z";
    const shifted = addHoursIso(base, 2);
    expect(new Date(shifted).getTime() - new Date(base).getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("addDaysIso shifts timestamp forward by whole days", () => {
    const base = endOfLocalDayIso("2026-05-27");
    const shifted = addDaysIso(base, 7);
    const diffDays = Math.round(
      (new Date(shifted).getTime() - new Date(base).getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(diffDays).toBe(7);
  });
});

describe("filterExpiredFocusItems", () => {
  it("removes expired items and preserves order", () => {
    const items: FocusItem[] = [
      {
        id: "a",
        category: "event",
        title: "Active",
        description: "",
        priorityScore: 900,
        urgency: "high",
        urgencyLabel: "High",
        reasonCodes: ["event_today"],
        expiresAtIso: "2026-05-28T00:00:00.000Z",
      },
      {
        id: "b",
        category: "skill",
        title: "Expired",
        description: "",
        priorityScore: 800,
        urgency: "high",
        urgencyLabel: "High",
        reasonCodes: ["skill_overdue"],
        expiresAtIso: "2026-05-27T12:00:00.000Z",
      },
      {
        id: "c",
        category: "fitness",
        title: "No expiry",
        description: "",
        priorityScore: 400,
        urgency: "low",
        urgencyLabel: "Low",
        reasonCodes: ["fitness_no_workout_this_week"],
      },
    ];

    const filtered = filterExpiredFocusItems(items, "2026-05-27T18:00:00.000Z");
    expect(filtered.map((item) => item.id)).toEqual(["a", "c"]);
  });
});

describe("formatFocusActionLabel", () => {
  it("maps action types to CTA labels", () => {
    expect(formatFocusActionLabel("log_skill_minutes")).toBe("Log minutes");
    expect(formatFocusActionLabel("apply_to_job")).toBe("Apply");
    expect(formatFocusActionLabel("resolve_conflict")).toBe("Review conflict");
    expect(formatFocusActionLabel("schedule_workout")).toBe("Start workout");
  });
});

describe("formatFocusExpirationHint", () => {
  it("returns undefined for past expirations", () => {
    expect(
      formatFocusExpirationHint("2026-05-27T10:00:00.000Z", "2026-05-27T18:00:00.000Z")
    ).toBeUndefined();
  });

  it("returns hour hint for same-day expiry", () => {
    const hint = formatFocusExpirationHint(
      "2026-05-27T20:00:00.000Z",
      "2026-05-27T18:00:00.000Z"
    );
    expect(hint).toMatch(/Expires in ~/);
  });
});

describe("action metadata", () => {
  it("assigns log_skill_minutes action to overdue skills", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
      },
    });
    const drafts = collectSkillFocusItems([skill], [], NOW_EVENING);
    const overdue = drafts.find((d) => d.reasonCodes.includes("skill_overdue"));
    expect(overdue?.suggestedActionType).toBe("log_skill_minutes");
    expect(overdue?.actionTargetId).toBe(SKILL_A);
    expect(overdue?.expiresAtIso).toBeDefined();
  });

  it("assigns apply_to_job action to saved applications", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        jobApplications: [sampleApplication()],
      })
    );
    const item = summary.items.find((i) =>
      i.reasonCodes.includes("career_saved_not_applied")
    );
    expect(item?.suggestedActionType).toBe("apply_to_job");
    expect(item?.actionTargetId).toBe(APP_ID);
    expect(item?.expiresAtIso).toBeDefined();
  });

  it("assigns contact_person action to follow-ups", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        people: [samplePerson({ lastContactDate: "2026-01-01", contactCadenceDays: 7 })],
      })
    );
    const item = summary.items.find((i) =>
      i.reasonCodes.includes("people_follow_up_overdue")
    );
    expect(item?.suggestedActionType).toBe("contact_person");
    expect(item?.actionTargetId).toBe(PERSON_ID);
  });

  it("assigns resolve_conflict action for timeline conflicts", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
      },
    });
    const summary = buildDailyFocusSummary(
      emptyInput({
        skills: [skill],
        events: [
          sampleEvent({
            title: "Meeting",
            startTime: "09:30",
            endTime: "10:30",
          }),
        ],
        now: NOW_MORNING,
      })
    );
    const item = summary.items.find((i) =>
      i.reasonCodes.includes("timeline_schedule_conflict")
    );
    expect(item?.suggestedActionType).toBe("resolve_conflict");
    expect(item?.actionTargetId).toBeDefined();
  });
});

describe("buildDailyFocusSummary expiration", () => {
  it("excludes items past their expiration", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
      },
    });
    const summary = buildDailyFocusSummary(
      emptyInput({
        skills: [skill],
        now: new Date(2026, 4, 27, 23, 30, 0),
      })
    );
    expect(
      summary.items.some((item) => item.reasonCodes.includes("skill_overdue"))
    ).toBe(false);
  });
});

describe("priorityFromScore", () => {
  it("maps score bands to urgency levels", () => {
    expect(priorityFromScore(960)).toBe("critical");
    expect(priorityFromScore(950)).toBe("critical");
    expect(priorityFromScore(800)).toBe("high");
    expect(priorityFromScore(750)).toBe("high");
    expect(priorityFromScore(600)).toBe("medium");
    expect(priorityFromScore(500)).toBe("medium");
    expect(priorityFromScore(499)).toBe("low");
  });
});

describe("scoreFocusItem", () => {
  it("sums score components into priorityScore", () => {
    const draft: FocusItemDraft = {
      id: "skill:a",
      category: "skill",
      title: "Test",
      description: "Desc",
      reasonCodes: ["skill_overdue"],
      score: {
        categoryBase: 800,
        urgencyBonus: 100,
        severityBonus: 30,
        skillPriorityBonus: 50,
        timeOfDayBonus: 40,
      },
    };
    const item = scoreFocusItem(draft);
    expect(item.priorityScore).toBe(1020);
    expect(item.urgency).toBe("critical");
    expect(item.urgencyLabel).toBe("Critical");
  });
});

describe("mergeFocusItems", () => {
  it("merges same skill into one item with combined reason codes", () => {
    const drafts: FocusItemDraft[] = [
      {
        id: `skill:${SKILL_A}`,
        category: "skill",
        sourceId: SKILL_A,
        title: "Catch up on TypeScript",
        description: "Behind schedule.",
        reasonCodes: ["skill_overdue"],
        score: {
          categoryBase: 800,
          urgencyBonus: 0,
          severityBonus: 40,
          skillPriorityBonus: 0,
          timeOfDayBonus: 40,
        },
      },
      {
        id: `skill:${SKILL_A}`,
        category: "skill",
        sourceId: SKILL_A,
        title: "Keep your 5-day streak on TypeScript",
        description: "Log time today.",
        reasonCodes: ["skill_streak_at_risk"],
        score: {
          categoryBase: 750,
          urgencyBonus: 0,
          severityBonus: 25,
          skillPriorityBonus: 0,
          timeOfDayBonus: 80,
        },
      },
    ];

    const merged = mergeFocusItems(drafts);
    expect(merged).toHaveLength(1);
    expect(merged[0].reasonCodes).toEqual(
      expect.arrayContaining(["skill_overdue", "skill_streak_at_risk"])
    );
    expect(merged[0].score.timeOfDayBonus).toBe(80);
    expect(merged[0].score.severityBonus).toBe(40);
  });
});

describe("rankFocusItems", () => {
  it("ranks timeline conflicts above fitness nudges", () => {
    const items: FocusItem[] = [
      {
        id: "fitness:1",
        category: "fitness",
        title: "No workouts",
        description: "Log a session.",
        priorityScore: 420,
        urgency: "low",
        urgencyLabel: "Low",
        reasonCodes: ["fitness_no_workout_this_week"],
      },
      {
        id: "timeline:1",
        category: "timeline",
        title: "Schedule conflict",
        description: "Overlap today.",
        priorityScore: 950,
        urgency: "critical",
        urgencyLabel: "Critical",
        reasonCodes: ["timeline_schedule_conflict"],
      },
    ];

    const ranked = rankFocusItems(items);
    expect(ranked[0].category).toBe("timeline");
    expect(ranked[1].category).toBe("fitness");
  });
});

describe("collectSkillFocusItems", () => {
  it("creates overdue focus item when behind schedule", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
      },
    });
    const drafts = collectSkillFocusItems([skill], [], NOW_EVENING);
    const overdue = drafts.find((d) => d.reasonCodes.includes("skill_overdue"));
    expect(overdue).toBeDefined();
    expect(overdue?.title).toContain("Catch up on TypeScript");
    expect(overdue?.estimatedMinutes).toBe(60);
  });

  it("creates streak-at-risk item in the evening when streak is active but not today", () => {
    const skill = sampleSkill({
      dailyGoalMinutes: 30,
      schedule: {
        ...defaultWeeklySchedule(),
        tue: [{ id: "b1", startTime: "09:00", minutes: 30 }],
        wed: [{ id: "b2", startTime: "09:00", minutes: 30 }],
      },
    });
    const sessions = [
      sampleSession({
        minutes: 30,
        startedAtIso: new Date(2026, 4, 26, 10, 0, 0).toISOString(),
      }),
    ];
    const drafts = collectSkillFocusItems([skill], sessions, NOW_EVENING);
    const streak = drafts.find((d) => d.reasonCodes.includes("skill_streak_at_risk"));
    expect(streak).toBeDefined();
    expect(streak?.title).toContain("streak");
  });
});

describe("buildDailyFocusSummary", () => {
  it("returns empty items and no headline for empty payload", () => {
    const summary = buildDailyFocusSummary(emptyInput());
    expect(summary.items).toEqual([]);
    expect(summary.headline).toBeUndefined();
    expect(summary.context.skillOverdueCount).toBe(0);
  });

  it("includes event today in ranked items", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        events: [sampleEvent({ title: "Doctor appointment" })],
      })
    );
    expect(summary.items.length).toBeGreaterThan(0);
    expect(summary.items[0].reasonCodes).toContain("event_today");
    expect(summary.items[0].title).toContain("Doctor appointment");
    expect(summary.context.eventsTodayCount).toBe(1);
  });

  it("includes people birthday today", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        people: [samplePerson()],
      })
    );
    expect(summary.items.some((item) => item.reasonCodes.includes("people_birthday_today"))).toBe(
      true
    );
  });

  it("includes career saved application", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        jobApplications: [sampleApplication()],
      })
    );
    expect(summary.items.some((item) => item.reasonCodes.includes("career_saved_not_applied"))).toBe(
      true
    );
  });

  it("includes fitness long gap signal", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        workoutPlans: [samplePlan()],
        workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
      })
    );
    expect(
      summary.items.some((item) => item.reasonCodes.includes("fitness_long_gap_since_last"))
    ).toBe(true);
  });

  it("ranks timeline conflict above fitness when both present", () => {
    const skill = sampleSkill({
      schedule: {
        ...defaultWeeklySchedule(),
        wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
      },
    });
    const summary = buildDailyFocusSummary(
      emptyInput({
        skills: [skill],
        events: [
          sampleEvent({
            title: "Meeting",
            startTime: "09:30",
            endTime: "10:30",
          }),
        ],
        workoutPlans: [samplePlan()],
        workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
        now: NOW_MORNING,
      })
    );
    const timelineIndex = summary.items.findIndex((item) => item.category === "timeline");
    const fitnessIndex = summary.items.findIndex((item) => item.category === "fitness");
    expect(timelineIndex).toBeGreaterThanOrEqual(0);
    expect(fitnessIndex).toBeGreaterThanOrEqual(0);
    expect(timelineIndex).toBeLessThan(fitnessIndex);
    expect(summary.context.timelineConflictMinutes).toBeGreaterThan(0);
  });

  it("caps skill items per category", () => {
    const skills = Array.from({ length: 10 }, (_, i) =>
      sampleSkill({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        name: `Skill ${i}`,
        schedule: {
          ...defaultWeeklySchedule(),
          wed: [{ id: `b${i}`, startTime: "09:00", minutes: 60 }],
        },
      })
    );
    const summary = buildDailyFocusSummary(
      emptyInput({
        skills,
        opts: { maxItems: 5, perCategoryCap: 4 },
      })
    );
    expect(summary.items.length).toBeLessThanOrEqual(5);
    expect(summary.byCategory.skill.length).toBeLessThanOrEqual(4);
  });

  it("is deterministic for the same input", () => {
    const input = emptyInput({
      events: [sampleEvent()],
      people: [samplePerson()],
      jobApplications: [sampleApplication()],
    });
    const a = buildDailyFocusSummary(input);
    const b = buildDailyFocusSummary(input);
    expect(a.items.map((item) => item.id)).toEqual(b.items.map((item) => item.id));
    expect(a.items.map((item) => item.priorityScore)).toEqual(
      b.items.map((item) => item.priorityScore)
    );
  });

  it("supports career target skill gap without applications", () => {
    const summary = buildDailyFocusSummary(
      emptyInput({
        skills: [
          sampleSkill({ id: SKILL_A, name: "TypeScript" }),
          sampleSkill({ id: SKILL_B, name: "System Design" }),
        ],
        careerTarget: sampleTarget({ requiredSkillIds: [SKILL_B] }),
      })
    );
    expect(summary.items.some((item) => item.reasonCodes.includes("career_skill_gap"))).toBe(true);
  });

  it("does not emit fitness signals for brand-new users with no plans or sessions", () => {
    const summary = buildDailyFocusSummary(emptyInput());
    expect(summary.byCategory.fitness).toEqual([]);
  });
});

describe("formatFocusContextLine", () => {
  it("joins context stats with separators", () => {
    const line = formatFocusContextLine({
      skillOverdueCount: 1,
      eventsTodayCount: 2,
      timelineConflictMinutes: 30,
      netAvailableSkillMinutes: 45,
      workoutsThisWeek: 1,
      applicationsNeedingAttention: 1,
    });
    expect(line).toContain("30m conflicts");
    expect(line).toContain("45m available for skills");
    expect(line).toContain("1 workout this week");
    expect(line).toContain("1 career item");
  });
});
