import { describe, expect, it } from "vitest";
import { defaultWeeklySchedule } from "./state";
import type {
  CookingSession,
  FocusFeedback,
  JobApplication,
  LifeEvent,
  Person,
  Recipe,
  Session,
  Skill,
  SupplementIntakeLog,
  SupplementProtocol,
  WorkoutSession,
} from "./model";
import {
  buildCareerWeekSection,
  buildCookingWeekSection,
  buildEventsWeekSection,
  buildFitnessWeekSection,
  buildFocusFeedbackWeekSection,
  buildPeopleWeekSection,
  buildSkillWeekSummary,
  buildWeeklyHeadline,
  buildWeeklyReview,
  classifyReviewTone,
  collectWeeklyRisks,
  collectWeeklyWins,
  formatIsoWeekKey,
  getLocalWeekRange,
  isCareerSectionVisible,
  isCookingSectionVisible,
  isEventsSectionVisible,
  isFitnessSectionVisible,
  isFocusFeedbackSectionVisible,
  isPeopleSectionVisible,
  isRisksSectionVisible,
  isSkillsSectionVisible,
  isWinsSectionVisible,
  isDateKeyInLocalWeek,
  isIsoInLocalWeek,
} from "./review";

const TODAY = "2026-05-27";
const NOW = new Date(2026, 4, 27, 14, 0, 0);
const ISO = "2026-05-26T12:00:00.000Z";
const WEEK_START = "2026-05-25";
const WEEK_END = "2026-05-31";

const SKILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SKILL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSON_ID = "88888888-8888-4888-8888-888888888888";
const APP_ID = "44444444-4444-4444-8444-444444444444";
const FEEDBACK_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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
    id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
    skillId: SKILL_A,
    minutes: 30,
    startedAtIso: "2026-05-26T10:00:00.000Z",
    createdAtIso: ISO,
    ...overrides,
  };
}

function sampleEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: EVENT_ID,
    title: "Team standup",
    date: "2026-05-26",
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
    lastContactDate: "2026-05-26",
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
    roleTitle: "Engineer",
    status: "applied",
    appliedDate: "2026-05-01",
    requiredSkillIds: [],
    interviews: [],
    createdAtIso: ISO,
    updatedAtIso: "2026-05-26T15:00:00.000Z",
    ...overrides,
  };
}

function sampleWorkout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "wwwwwwww-wwww-4www-8www-wwwwwwwwwwww",
    date: "2026-05-26",
    focus: "push",
    durationMinutes: 45,
    exercises: [],
    completedAtIso: ISO,
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleFeedback(overrides: Partial<FocusFeedback> = {}): FocusFeedback {
  return {
    id: FEEDBACK_ID,
    focusItemId: "focus:skill:overdue",
    action: "dismissed",
    sourceSnapshot: "Log TypeScript minutes",
    createdAtIso: "2026-05-26T09:00:00.000Z",
    updatedAtIso: "2026-05-26T09:00:00.000Z",
    ...overrides,
  };
}

function sampleReviewProtocol(overrides: Partial<SupplementProtocol> = {}): SupplementProtocol {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Creatine",
    unit: "g",
    active: true,
    phases: [
      {
        id: "p1",
        kind: "maintenance",
        startDate: "2026-05-01",
        dosesPerDay: 2,
        amountPerDose: 5,
      },
    ],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleReviewLog(overrides: Partial<SupplementIntakeLog> = {}): SupplementIntakeLog {
  return {
    id: "88888888-8888-4888-8888-888888888881",
    protocolId: "77777777-7777-4777-8777-777777777777",
    date: "2026-05-25",
    doses: [
      { id: "d1", slotIndex: 0, amount: 5, takenAtIso: ISO },
      { id: "d2", slotIndex: 1, amount: 5, takenAtIso: ISO },
    ],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: SKILL_A,
    title: "Weeknight carbonara",
    category: "dinner",
    difficulty: "easy",
    experienceLevel: "beginner",
    estimatedMinutes: 25,
    ingredients: [{ id: SKILL_B, rawText: "2 eggs" }],
    steps: [
      {
        id: EVENT_ID,
        order: 0,
        text: "Cook.",
        kind: "blocking",
        blocksProgress: true,
      },
    ],
    equipment: [],
    gallery: [],
    source: "manual",
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

function sampleCook(overrides: Partial<CookingSession> = {}): CookingSession {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    recipeId: SKILL_A,
    recipeTitle: "Weeknight carbonara",
    status: "completed",
    cookDate: "2026-05-26",
    durationMinutes: 30,
    timers: [],
    createdAtIso: ISO,
    updatedAtIso: ISO,
    ...overrides,
  };
}

describe("getLocalWeekRange", () => {
  it("returns Monday through Sunday for a Wednesday anchor", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    expect(week.weekStartKey).toBe(WEEK_START);
    expect(week.weekEndKey).toBe(WEEK_END);
    expect(week.weekKey).toBe("2026-W21");
  });
});

describe("formatIsoWeekKey", () => {
  it("returns a stable ISO week key for the week start", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    expect(formatIsoWeekKey(week.weekStartDate)).toBe("2026-W21");
  });
});

describe("week filters", () => {
  const week = getLocalWeekRange(TODAY, NOW);

  it("includes date keys on week boundaries", () => {
    expect(isDateKeyInLocalWeek(WEEK_START, week.weekStartDate)).toBe(true);
    expect(isDateKeyInLocalWeek(WEEK_END, week.weekStartDate)).toBe(true);
    expect(isDateKeyInLocalWeek("2026-06-01", week.weekStartDate)).toBe(false);
  });

  it("includes ISO timestamps in the local week", () => {
    expect(isIsoInLocalWeek("2026-05-26T10:00:00.000Z", week.weekStartDate)).toBe(true);
    expect(isIsoInLocalWeek("2026-05-24T10:00:00.000Z", week.weekStartDate)).toBe(false);
  });
});

describe("buildSkillWeekSummary", () => {
  it("computes minutes, consistency, and missed areas", () => {
    const schedule = defaultWeeklySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    schedule.wed = [{ id: "b2", startTime: "09:00", minutes: 30 }];

    const skill = sampleSkill({ weeklyGoalMinutes: 120, schedule });
    const sessions = [
      sampleSession({ minutes: 40, startedAtIso: "2026-05-26T10:00:00.000Z" }),
    ];

    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skill], sessions, week, NOW);

    expect(summary.totalMinutes).toBe(40);
    expect(summary.skills[0].activeDays).toBe(1);
    expect(summary.skills[0].scheduledDays).toBe(2);
    expect(summary.skills[0].completionRate).toBe(0.5);
    expect(summary.skills[0].consistencyScore).toBe(0.5);
    expect(summary.missedOrOverdue.length).toBe(1);
  });

  it("ranks top consistent skills", () => {
    const scheduleA = defaultWeeklySchedule();
    scheduleA.mon = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    scheduleA.tue = [{ id: "b2", startTime: "09:00", minutes: 30 }];

    const scheduleB = defaultWeeklySchedule();
    scheduleB.mon = [{ id: "b3", startTime: "09:00", minutes: 30 }];

    const skillA = sampleSkill({
      id: SKILL_A,
      name: "TypeScript",
      schedule: scheduleA,
    });
    const skillB = sampleSkill({
      id: SKILL_B,
      name: "Rust",
      schedule: scheduleB,
    });

    const sessions = [
      sampleSession({ skillId: SKILL_A, startedAtIso: "2026-05-25T10:00:00.000Z" }),
      sampleSession({ skillId: SKILL_A, startedAtIso: "2026-05-27T10:00:00.000Z" }),
      sampleSession({ skillId: SKILL_B, startedAtIso: "2026-05-25T11:00:00.000Z" }),
    ];

    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skillA, skillB], sessions, week, NOW);

    expect(summary.topConsistent[0].skillName).toBe("TypeScript");
    expect(summary.topConsistent[0].consistencyScore).toBe(1);
  });

  it("gives date_range outside week scheduledDays 0 and no missed/overdue flag", () => {
    const schedule = defaultWeeklySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    schedule.wed = [{ id: "b2", startTime: "09:00", minutes: 30 }];
    const skill = sampleSkill({
      weeklyGoalMinutes: 120,
      schedule,
      scheduleSeries: {
        mode: "date_range",
        startDate: "2026-06-01",
        endDate: "2026-08-31",
      },
    });
    const sessions = [sampleSession({ minutes: 40, startedAtIso: "2026-05-26T10:00:00.000Z" })];
    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skill], sessions, week, NOW);

    expect(summary.skills[0].scheduledDays).toBe(0);
    expect(summary.skills[0].minutesLogged).toBe(40);
    expect(summary.missedOrOverdue).toHaveLength(0);
  });

  it("counts only active weekdays for partial date_range in week", () => {
    const schedule = defaultWeeklySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    schedule.wed = [{ id: "b2", startTime: "09:00", minutes: 30 }];
    schedule.fri = [{ id: "b3", startTime: "09:00", minutes: 30 }];
    const skill = sampleSkill({
      schedule,
      scheduleSeries: {
        mode: "date_range",
        startDate: "2026-05-25",
        endDate: "2026-05-27",
      },
    });
    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skill], [], week, NOW);
    expect(summary.skills[0].scheduledDays).toBe(2);
  });

  it("counts single_day skill as one scheduled day in week", () => {
    const schedule = defaultWeeklySchedule();
    schedule.thu = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    const skill = sampleSkill({
      schedule,
      scheduleSeries: { mode: "single_day", singleDate: "2026-05-28" },
    });
    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skill], [], week, NOW);
    expect(summary.skills[0].scheduledDays).toBe(1);
    expect(summary.missedOrOverdue).toHaveLength(1);
  });

  it("gives future-start indefinite skill scheduledDays 0 before startDate", () => {
    const schedule = defaultWeeklySchedule();
    schedule.mon = [{ id: "b1", startTime: "09:00", minutes: 30 }];
    schedule.wed = [{ id: "b2", startTime: "09:00", minutes: 30 }];
    const skill = sampleSkill({
      weeklyGoalMinutes: 120,
      schedule,
      scheduleSeries: { mode: "indefinite", startDate: "2027-01-01" },
    });
    const sessions = [sampleSession({ minutes: 25, startedAtIso: "2026-05-26T10:00:00.000Z" })];
    const week = getLocalWeekRange(TODAY, NOW);
    const summary = buildSkillWeekSummary([skill], sessions, week, NOW);

    expect(summary.skills[0].scheduledDays).toBe(0);
    expect(summary.skills[0].minutesLogged).toBe(25);
    expect(summary.missedOrOverdue).toHaveLength(0);
  });
});

describe("buildFitnessWeekSection", () => {
  it("wraps workout week summary with a summary line", () => {
    const section = buildFitnessWeekSection(
      [],
      [sampleWorkout(), sampleWorkout({ id: "w2", date: "2026-05-27", focus: "pull" })],
      TODAY,
      WEEK_START
    );

    expect(section.count).toBe(2);
    expect(section.totalDurationMinutes).toBe(90);
    expect(section.summaryLine).toContain("2");
  });

  it("adds weekly supplement adherence under the fitness section", () => {
    const protocol = sampleReviewProtocol();
    const completeMon = sampleReviewLog({ date: "2026-05-25" });
    const partialTue = sampleReviewLog({
      id: "log-tue",
      date: "2026-05-26",
      doses: [
        { id: "d1", slotIndex: 0, amount: 5, takenAtIso: ISO },
        { id: "d2", slotIndex: 1, amount: 5 },
      ],
    });
    const section = buildFitnessWeekSection(
      [],
      [],
      TODAY,
      WEEK_START,
      [protocol],
      [completeMon, partialTue]
    );

    expect(section.supplementDueDays).toBe(3);
    expect(section.supplementCompleteDays).toBe(1);
    expect(section.supplementIncompleteDays).toBe(2);
    expect(section.supplementAdherenceRate).toBeCloseTo(1 / 3);
    expect(section.supplementSummaryLine).toContain("33%");
    expect(section.supplementSummaryLine).toContain("2 incomplete");
    expect(isFitnessSectionVisible(section)).toBe(true);
  });
});

describe("buildCookingWeekSection", () => {
  it("summarizes completed cooks, first cooks, and missed plans", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    const section = buildCookingWeekSection(
      [
        sampleCook(),
        sampleCook({ id: "c2", cookDate: "2026-05-27", recipeId: SKILL_B, recipeTitle: "Tacos" }),
        sampleCook({ id: "c3", status: "planned", cookDate: "2026-05-25" }),
      ],
      [sampleRecipe(), sampleRecipe({ id: SKILL_B, title: "Tacos" })],
      week,
      TODAY
    );

    expect(section.completedCount).toBe(2);
    expect(section.distinctRecipes).toBe(2);
    expect(section.cookDays).toBe(2);
    expect(section.firstCooks).toBe(2);
    expect(section.missedPlanned).toBe(1);
    expect(section.summaryLine).toContain("2");
    expect(isCookingSectionVisible(section)).toBe(true);
  });
});

describe("buildCareerWeekSection", () => {
  it("lists updated apps and attention items", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    const section = buildCareerWeekSection(
      [
        sampleApplication(),
        sampleApplication({
          id: "app2",
          company: "Saved Co",
          status: "saved",
          updatedAtIso: "2026-04-01T00:00:00.000Z",
        }),
      ],
      week,
      TODAY
    );

    expect(section.updatedThisWeek).toHaveLength(1);
    expect(section.updatedThisWeek[0].company).toBe("NVIDIA");
    expect(section.stillNeedingAttention.some((item) => item.company === "Saved Co")).toBe(true);
  });
});

describe("buildPeopleWeekSection", () => {
  it("separates follow-ups this week from overdue contacts", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    const section = buildPeopleWeekSection(
      [
        samplePerson(),
        samplePerson({
          id: "p2",
          name: "Jordan",
          lastContactDate: "2026-04-01",
          contactCadenceDays: 7,
        }),
      ],
      week,
      TODAY
    );

    expect(section.followedUpThisWeek).toHaveLength(1);
    expect(section.followedUpThisWeek[0].person.name).toBe("Alex");
    expect(section.stillNeedingFollowUp.some((item) => item.person.name === "Jordan")).toBe(true);
  });
});

describe("buildEventsWeekSection", () => {
  it("partitions completed and next-week events", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    const section = buildEventsWeekSection(
      [
        sampleEvent({ date: "2026-05-26", title: "Done event" }),
        sampleEvent({ id: "e2", date: "2026-06-02", title: "Next week" }),
      ],
      week,
      TODAY
    );

    expect(section.completedThisWeek).toHaveLength(1);
    expect(section.completedThisWeek[0].event.title).toBe("Done event");
    expect(section.upcomingNextWeek).toHaveLength(1);
    expect(section.upcomingNextWeek[0].event.title).toBe("Next week");
  });
});

describe("buildFocusFeedbackWeekSection", () => {
  it("groups dismiss and snooze counts by focus item", () => {
    const week = getLocalWeekRange(TODAY, NOW);
    const section = buildFocusFeedbackWeekSection(
      [
        sampleFeedback(),
        sampleFeedback({
          id: "f2",
          action: "snoozed",
          untilIso: "2026-05-26T18:00:00.000Z",
        }),
        sampleFeedback({
          id: "f3",
          focusItemId: "focus:other",
          sourceSnapshot: "Other item",
        }),
      ],
      week
    );

    expect(section.totalDismissed).toBe(2);
    expect(section.totalSnoozed).toBe(1);
    expect(section.mostHidden[0].totalCount).toBe(2);
    expect(section.mostHidden[0].displayLabel).toBe("Log TypeScript minutes");
  });
});

describe("wins and risks", () => {
  it("collects wins for fitness and people activity", () => {
    const review = buildWeeklyReview({
      skills: [sampleSkill({ weeklyGoalMinutes: 30 })],
      sessions: [sampleSession({ minutes: 30 })],
      events: [sampleEvent()],
      people: [samplePerson()],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [sampleWorkout(), sampleWorkout({ id: "w2", date: "2026-05-27" })],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    const wins = collectWeeklyWins(review);
    expect(wins.some((w) => w.includes("Followed up with Alex"))).toBe(true);
    expect(wins.some((w) => w.includes("workout"))).toBe(true);
  });

  it("collects cooking wins for several home meals and a first cook", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      recipes: [sampleRecipe()],
      cookingSessions: [
        sampleCook({ id: "c1", cookDate: "2026-05-25" }),
        sampleCook({ id: "c2", cookDate: "2026-05-26" }),
        sampleCook({ id: "c3", cookDate: "2026-05-27" }),
      ],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    const wins = collectWeeklyWins(review);
    expect(wins.some((w) => w.toLowerCase().includes("meal"))).toBe(true);
    expect(wins.some((w) => w.includes("new recipe"))).toBe(true);
  });

  it("collects risks for overdue follow-ups and repeated focus hiding", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [
        samplePerson({
          lastContactDate: "2026-04-01",
          contactCadenceDays: 7,
        }),
      ],
      jobApplications: [sampleApplication({ status: "saved", updatedAtIso: "2026-04-01T00:00:00.000Z" })],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [
        sampleFeedback(),
        sampleFeedback({ id: "f2" }),
        sampleFeedback({ id: "f3" }),
      ],
      todayKey: TODAY,
      now: NOW,
    });

    const risks = collectWeeklyRisks(review, TODAY);
    expect(risks.some((r) => r.includes("follow-up"))).toBe(true);
    expect(risks.some((r) => r.includes("application"))).toBe(true);
    expect(risks.some((r) => r.includes("hidden repeatedly"))).toBe(true);
  });

  it("flags a quiet cooking week when the recipe library is in use", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      recipes: [sampleRecipe()],
      cookingSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });
    expect(collectWeeklyRisks(review, TODAY).some((r) => r.includes("home cooking"))).toBe(true);
  });
});

describe("buildWeeklyReview", () => {
  it("is deterministic for the same input", () => {
    const input = {
      skills: [sampleSkill({ weeklyGoalMinutes: 60 })],
      sessions: [sampleSession({ minutes: 20 })],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    };

    const first = buildWeeklyReview(input);
    const second = buildWeeklyReview(input);

    expect(first).toEqual(second);
  });

  it("uses warning tone when risks are present", () => {
    const review = buildWeeklyReview({
      skills: [sampleSkill({ weeklyGoalMinutes: 300 })],
      sessions: [],
      events: [],
      people: [
        samplePerson({
          lastContactDate: "2026-04-01",
          contactCadenceDays: 7,
        }),
      ],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(review.risks.length).toBeGreaterThan(0);
    expect(classifyReviewTone(review)).toBe("warning");
  });

  it("renders neutral copy for an empty week", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(review.summary.length).toBeGreaterThan(0);
    expect(review.headline.length).toBeGreaterThan(0);
    expect(review.tone).toBe("neutral");
  });

  it("includes weekKey and headline on the review", () => {
    const review = buildWeeklyReview({
      skills: [sampleSkill({ weeklyGoalMinutes: 30 })],
      sessions: [sampleSession({ minutes: 30 })],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(review.week.weekKey).toBe("2026-W21");
    expect(review.headline).toBe("1 win this week");
  });
});

describe("section visibility helpers", () => {
  it("reflect review section emptiness", () => {
    const empty = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(isWinsSectionVisible(empty)).toBe(false);
    expect(isRisksSectionVisible(empty)).toBe(false);
    expect(isSkillsSectionVisible(empty.skills)).toBe(false);
    expect(isFitnessSectionVisible(empty.fitness)).toBe(false);
    expect(isCareerSectionVisible(empty.career)).toBe(false);
    expect(isPeopleSectionVisible(empty.people)).toBe(false);
    expect(isEventsSectionVisible(empty.events)).toBe(false);
    expect(isFocusFeedbackSectionVisible(empty.focusFeedback)).toBe(false);
    expect(isCookingSectionVisible(empty.cooking)).toBe(false);
  });

  it("returns true when section data exists", () => {
    const review = buildWeeklyReview({
      skills: [sampleSkill()],
      sessions: [sampleSession()],
      events: [sampleEvent()],
      people: [samplePerson()],
      jobApplications: [sampleApplication()],
      workoutPlans: [],
      workoutSessions: [sampleWorkout()],
      focusFeedback: [sampleFeedback()],
      todayKey: TODAY,
      now: NOW,
    });

    expect(isWinsSectionVisible(review)).toBe(true);
    expect(isSkillsSectionVisible(review.skills)).toBe(true);
    expect(isFitnessSectionVisible(review.fitness)).toBe(true);
    expect(isCareerSectionVisible(review.career)).toBe(true);
    expect(isPeopleSectionVisible(review.people)).toBe(true);
    expect(isEventsSectionVisible(review.events)).toBe(true);
    expect(isFocusFeedbackSectionVisible(review.focusFeedback)).toBe(true);
  });

  it("shows the fitness section when only supplements had due days", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      supplementProtocols: [sampleReviewProtocol()],
      supplementIntakeLogs: [sampleReviewLog()],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(isFitnessSectionVisible(review.fitness)).toBe(true);
    expect(review.fitness.supplementSummaryLine).toBeDefined();
    expect(review.summary).toContain("Supplement adherence");
  });
});

describe("buildWeeklyHeadline", () => {
  it("prioritizes risks over wins", () => {
    const review = buildWeeklyReview({
      skills: [],
      sessions: [],
      events: [],
      people: [
        samplePerson({
          lastContactDate: "2026-04-01",
          contactCadenceDays: 7,
        }),
      ],
      jobApplications: [],
      workoutPlans: [],
      workoutSessions: [],
      focusFeedback: [],
      todayKey: TODAY,
      now: NOW,
    });

    expect(buildWeeklyHeadline(review)).toContain("risk");
  });
});
