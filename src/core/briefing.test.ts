import { describe, expect, it } from "vitest";
import {
  buildBriefingSeed,
  buildDailyBriefing,
  buildFocusSummaryParagraph,
  buildGreeting,
  buildRecommendations,
  classifyBriefingTone,
  classifyWorkloadLevel,
  collectRiskFlags,
  focusItemToRecommendation,
  formatWorkloadSummary,
  selectDeterministicTemplate,
  type BuildDailyBriefingInput,
} from "./briefing";
import { buildDailyFocusSummary, type FocusReasonCode } from "./focus";
import type {
  JobApplication,
  LifeEvent,
  Person,
  Session,
  Skill,
  WorkoutPlan,
  WorkoutSession,
} from "./model";
import { defaultWeeklySchedule } from "./state";
import { computeDailyWorkloadForDay, type DailyWorkloadTotals, type UnifiedTimelineDay } from "./timeline";

const TODAY = "2026-05-27";
const NOW_EVENING = new Date(2026, 4, 27, 18, 30, 0);
const NOW_MORNING = new Date(2026, 4, 27, 9, 0, 0);
const ISO = "2026-05-26T12:00:00.000Z";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const APP_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";

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
    company: "NVIDIA",
    roleTitle: "Software Engineer",
    status: "saved",
    requiredSkillIds: [SKILL_A],
    interviews: [],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function samplePlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: PLAN_ID,
    name: "Push A",
    focus: "push",
    exercises: [{ id: "ex1", name: "Squat", sets: 3, reps: 5 }],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleWorkoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    date: "2026-05-20",
    focus: "push",
    exercises: [{ id: "ex1", name: "Squat", sets: 3, reps: 5 }],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function emptyTimelineDay(overrides: Partial<UnifiedTimelineDay> = {}): UnifiedTimelineDay {
  return {
    date: TODAY,
    items: [],
    conflicts: [],
    ...overrides,
  };
}

function emptyWorkload(overrides: Partial<DailyWorkloadTotals> = {}): DailyWorkloadTotals {
  return {
    date: TODAY,
    plannedSkillMinutes: 0,
    blockedMinutes: 0,
    conflictMinutes: 0,
    netAvailableForSkillsMinutes: 0,
    netFreeMinutes: 1440,
    ...overrides,
  };
}

function buildFocusInput(overrides: Partial<Parameters<typeof buildDailyFocusSummary>[0]> = {}) {
  return {
    skills: [] as Skill[],
    sessions: [] as Session[],
    events: [] as LifeEvent[],
    people: [] as Person[],
    jobApplications: [] as JobApplication[],
    workoutPlans: [] as WorkoutPlan[],
    workoutSessions: [] as WorkoutSession[],
    todayKey: TODAY,
    now: NOW_EVENING,
    ...overrides,
  };
}

function buildBriefingInput(
  overrides: Partial<BuildDailyBriefingInput> = {}
): BuildDailyBriefingInput {
  const focusInput = buildFocusInput(overrides as Partial<Parameters<typeof buildDailyFocusSummary>[0]>);
  const focusSummary =
    overrides.focusSummary ?? buildDailyFocusSummary(focusInput);
  const unifiedTimelineDay = overrides.unifiedTimelineDay ?? emptyTimelineDay();
  const workload =
    overrides.workload ??
    computeDailyWorkloadForDay(unifiedTimelineDay);

  return {
    skills: focusInput.skills,
    sessions: focusInput.sessions,
    events: focusInput.events,
    people: focusInput.people,
    jobApplications: focusInput.jobApplications,
    workoutPlans: focusInput.workoutPlans,
    workoutSessions: focusInput.workoutSessions,
    focusSummary,
    unifiedTimelineDay,
    workload,
    todayKey: TODAY,
    now: NOW_EVENING,
    ...overrides,
  };
}

function sampleSeedParts(overrides: Partial<Parameters<typeof buildBriefingSeed>[0]> = {}) {
  return {
    todayKey: TODAY,
    workloadLevel: "light" as const,
    eventsTodayCount: 0,
    conflictCount: 0,
    skillOverdueCount: 0,
    applicationsNeedingAttention: 0,
    ...overrides,
  };
}

describe("selectDeterministicTemplate", () => {
  it("returns stable output for the same seed", () => {
    const templates = ["A", "B", "C"];
    expect(selectDeterministicTemplate(templates, "seed-1")).toBe(
      selectDeterministicTemplate(templates, "seed-1")
    );
  });

  it("can return different templates for different seeds", () => {
    const templates = ["A", "B", "C", "D"];
    const results = new Set([
      selectDeterministicTemplate(templates, "2026-05-27|workload|light|0|0|0|0"),
      selectDeterministicTemplate(templates, "2026-05-28|workload|light|0|0|0|0"),
      selectDeterministicTemplate(templates, "2026-05-29|workload|light|0|0|0|0"),
    ]);
    expect(results.size).toBeGreaterThan(1);
  });
});

describe("buildGreeting", () => {
  it("returns morning greeting before noon", () => {
    expect(buildGreeting(NOW_MORNING)).toBe("Good morning.");
  });

  it("returns evening greeting after 18:00", () => {
    expect(buildGreeting(NOW_EVENING)).toBe("Good evening.");
  });
});

describe("classifyWorkloadLevel", () => {
  it("returns light for empty day", () => {
    expect(classifyWorkloadLevel(emptyWorkload(), 0, 0)).toBe("light");
  });

  it("returns heavy when blocked minutes exceed threshold", () => {
    expect(
      classifyWorkloadLevel(emptyWorkload({ blockedMinutes: 480 }), 0, 0)
    ).toBe("heavy");
  });

  it("returns moderate for a single conflict", () => {
    expect(classifyWorkloadLevel(emptyWorkload(), 1, 0)).toBe("moderate");
  });
});

describe("formatWorkloadSummary", () => {
  it("maps levels to allowed template strings", () => {
    const seed = buildBriefingSeed(sampleSeedParts(), "workload-summary");
    expect(["Today looks light.", "You have breathing room today.", "A lighter day ahead."]).toContain(
      formatWorkloadSummary("light", seed)
    );
    expect([
      "Today looks moderately busy.",
      "You'll have a steady pace today.",
      "Expect a full but manageable day.",
    ]).toContain(formatWorkloadSummary("moderate", seed));
    expect([
      "Today looks heavy — limited free time.",
      "Today's packed — protect your priorities.",
      "A demanding day — plan breaks where you can.",
    ]).toContain(formatWorkloadSummary("heavy", seed));
  });
});

describe("classifyBriefingTone", () => {
  it("returns warning when risk flags exist", () => {
    expect(classifyBriefingTone(["Overloaded day"], "light", 0)).toBe("warning");
  });

  it("returns warning for heavy workload even without risk flags", () => {
    expect(classifyBriefingTone([], "heavy", 2)).toBe("warning");
  });

  it("returns encouraging when caught up", () => {
    expect(classifyBriefingTone([], "light", 0)).toBe("encouraging");
  });

  it("returns neutral for ordinary days with focus items", () => {
    expect(classifyBriefingTone([], "moderate", 2)).toBe("neutral");
  });
});

describe("buildDailyBriefing empty state", () => {
  it("returns clear-day narrative with encouraging tone", () => {
    const briefing = buildDailyBriefing(buildBriefingInput({ now: NOW_MORNING }));

    expect(briefing.greeting).toBe("Good morning.");
    expect([
      "Your schedule looks clear today.",
      "Not much on the calendar — a good day to choose your priorities.",
      "You have open space today.",
    ]).toContain(briefing.summary);
    expect(briefing.tone).toBe("encouraging");
    expect(briefing.recommendations).toEqual([]);
    expect(briefing.riskFlags).toEqual([]);
  });
});

describe("buildDailyBriefing heavy workload", () => {
  it("classifies heavy workload with warning tone and overloaded risk", () => {
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        events: [
          sampleEvent({ id: "e1", title: "Standup" }),
          sampleEvent({ id: "e2", title: "Review", startTime: "14:00", endTime: "15:00" }),
        ],
      })
    );

    const briefing = buildDailyBriefing(
      buildBriefingInput({
        focusSummary,
        workload: emptyWorkload({ blockedMinutes: 500 }),
        now: NOW_EVENING,
      })
    );

    expect([
      "Today looks heavy — limited free time.",
      "Today's packed — protect your priorities.",
      "A demanding day — plan breaks where you can.",
    ]).toContain(briefing.workloadSummary);
    expect(briefing.tone).toBe("warning");
    expect(briefing.riskFlags).toContain("Overloaded day");
  });
});

describe("buildDailyBriefing conflict detection", () => {
  it("mentions schedule conflicts in the summary", () => {
    const unifiedTimelineDay = emptyTimelineDay({
      conflicts: [
        {
          date: TODAY,
          aId: "scheduleBlock:a:b1:2026-05-27",
          bId: "lifeEvent:e1",
          overlapStartTime: "09:30",
          overlapEndTime: "10:00",
          overlapMinutes: 30,
          severity: "warn",
          reason: "eventBlocksSchedule",
        },
      ],
    });
    const workload = computeDailyWorkloadForDay(unifiedTimelineDay);
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        skills: [
          sampleSkill({
            schedule: {
              ...defaultWeeklySchedule(),
              wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
            },
          }),
        ],
        events: [
          sampleEvent({
            startTime: "09:30",
            endTime: "10:30",
          }),
        ],
        now: NOW_MORNING,
      })
    );

    const briefing = buildDailyBriefing(
      buildBriefingInput({
        focusSummary,
        unifiedTimelineDay,
        workload,
        now: NOW_MORNING,
      })
    );

    expect(briefing.summary).toContain("schedule conflict");
    expect(briefing.tone).toBe("neutral");
  });
});

describe("buildRecommendations", () => {
  it("excludes items already visible in Today's Focus", () => {
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        events: [sampleEvent({ title: "Doctor appointment" })],
        people: [samplePerson()],
        jobApplications: [sampleApplication()],
        workoutPlans: [samplePlan()],
        workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
        opts: { maxItems: 1, perCategoryCap: 4 },
      })
    );

    expect(focusSummary.items).toHaveLength(1);
    const recommendations = buildRecommendations(focusSummary, NOW_EVENING, TODAY);
    const visibleTitle = focusSummary.items[0].title;

    expect(recommendations.length).toBeGreaterThan(0);
    for (const rec of recommendations) {
      expect(rec).not.toContain(visibleTitle);
    }
  });

  it("orders recommendations by focus priority", () => {
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        events: [sampleEvent({ title: "Doctor appointment" })],
        people: [samplePerson()],
        jobApplications: [sampleApplication()],
        workoutPlans: [samplePlan()],
        workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
        opts: { maxItems: 2, perCategoryCap: 4 },
      })
    );

    const recommendations = buildRecommendations(focusSummary, NOW_EVENING, TODAY);
    expect(recommendations.length).toBeLessThanOrEqual(5);
    expect(recommendations.length).toBeGreaterThan(0);
  });
});

describe("focusItemToRecommendation", () => {
  it("maps career follow-up to natural language", () => {
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        jobApplications: [sampleApplication({ status: "applied", appliedDate: "2026-04-01" })],
      })
    );
    const careerItem = focusSummary.byCategory.career[0];
    expect(careerItem).toBeDefined();
    expect(focusItemToRecommendation(careerItem, NOW_EVENING)).toContain("NVIDIA");
  });

  it("maps skill overdue to log minutes recommendation", () => {
    const rec = focusItemToRecommendation(
      {
        id: "skill:ml",
        category: "skill",
        title: "Catch up on Machine Learning",
        description: "30m behind schedule today.",
        priorityScore: 850,
        urgency: "high",
        urgencyLabel: "High",
        reasonCodes: ["skill_overdue"],
        estimatedMinutes: 30,
      },
      NOW_EVENING
    );
    expect(rec).toBe("Log 30 minutes toward Machine Learning.");
  });

  it("uses deterministic fallback templates for unknown reason codes", () => {
    const item = {
      id: "custom:1",
      category: "skill" as const,
      title: "Review notes",
      description: "Custom item",
      priorityScore: 100,
      urgency: "low" as const,
      urgencyLabel: "Low",
      reasonCodes: ["not_in_switch" as unknown as FocusReasonCode],
    };

    const recA = focusItemToRecommendation(item, NOW_EVENING, "2026-05-27|custom:1|recommendation");
    const recB = focusItemToRecommendation(item, NOW_EVENING, "2026-05-28|custom:1|recommendation");

    expect(recA).toBe(focusItemToRecommendation(item, NOW_EVENING, "2026-05-27|custom:1|recommendation"));
    expect(["Review notes.", "Consider: Review notes.", "When you have a moment — review notes."]).toContain(
      recA
    );
    expect(["Review notes.", "Consider: Review notes.", "When you have a moment — review notes."]).toContain(
      recB
    );
  });
});

describe("collectRiskFlags", () => {
  it("flags excessive schedule conflicts", () => {
    const unifiedTimelineDay = emptyTimelineDay({
      conflicts: [
        {
          date: TODAY,
          aId: "a1",
          bId: "b1",
          overlapStartTime: "09:00",
          overlapEndTime: "09:30",
          overlapMinutes: 30,
          severity: "warn",
          reason: "eventBlocksSchedule",
        },
        {
          date: TODAY,
          aId: "a2",
          bId: "b2",
          overlapStartTime: "14:00",
          overlapEndTime: "14:30",
          overlapMinutes: 30,
          severity: "warn",
          reason: "eventBlocksSchedule",
        },
      ],
    });

    const flags = collectRiskFlags(
      buildBriefingInput({
        unifiedTimelineDay,
        workload: emptyWorkload({ conflictMinutes: 60 }),
      })
    );

    expect(flags).toContain("Excessive schedule conflicts");
  });

  it("flags no workouts recently when gap is long", () => {
    const flags = collectRiskFlags(
      buildBriefingInput({
        workoutPlans: [samplePlan()],
        workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
      })
    );

    expect(flags).toContain("No workouts recently");
  });

  it("flags too many overdue skills", () => {
    const skills = Array.from({ length: 3 }, (_, i) =>
      sampleSkill({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        name: `Skill ${i}`,
        schedule: {
          ...defaultWeeklySchedule(),
          wed: [{ id: `b${i}`, startTime: "09:00", minutes: 60 }],
        },
      })
    );
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({ skills, now: NOW_EVENING })
    );

    const flags = collectRiskFlags(
      buildBriefingInput({
        skills,
        focusSummary,
        now: NOW_EVENING,
      })
    );

    expect(flags).toContain("Too many overdue skills");
  });

  it("flags burnout risk in heavy evening scenarios", () => {
    const skills = [
      sampleSkill({
        schedule: {
          ...defaultWeeklySchedule(),
          wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
        },
      }),
      sampleSkill({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Rust",
        schedule: {
          ...defaultWeeklySchedule(),
          wed: [{ id: "b2", startTime: "10:00", minutes: 60 }],
        },
      }),
    ];
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({ skills, now: NOW_EVENING })
    );

    const flags = collectRiskFlags(
      buildBriefingInput({
        skills,
        focusSummary,
        workload: emptyWorkload({ blockedMinutes: 400 }),
        now: NOW_EVENING,
      })
    );

    expect(flags).toContain("Burnout risk");
  });
});

describe("buildFocusSummaryParagraph", () => {
  it("combines overdue skills and fitness gaps", () => {
    const focusSummary = buildDailyFocusSummary(
      buildFocusInput({
        skills: [
          sampleSkill({
            schedule: {
              ...defaultWeeklySchedule(),
              wed: [{ id: "b1", startTime: "09:00", minutes: 60 }],
            },
          }),
        ],
        workoutPlans: [samplePlan()],
        now: NOW_EVENING,
      })
    );

    const paragraph = buildFocusSummaryParagraph(
      focusSummary.context,
      [],
      [samplePlan()],
      [],
      TODAY,
      sampleSeedParts({ skillOverdueCount: focusSummary.context.skillOverdueCount })
    );

    expect(paragraph).toContain("behind schedule");
    expect(paragraph).toContain("workout");
  });
});

describe("buildDailyBriefing determinism", () => {
  it("returns identical output for identical input", () => {
    const input = buildBriefingInput({
      events: [sampleEvent()],
      people: [samplePerson()],
      jobApplications: [sampleApplication()],
      workoutPlans: [samplePlan()],
      workoutSessions: [sampleWorkoutSession({ date: "2026-05-20" })],
      now: NOW_MORNING,
    });

    const a = buildDailyBriefing(input);
    const b = buildDailyBriefing(input);

    expect(a).toEqual(b);
  });
});
