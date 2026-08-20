import { describe, expect, it } from "vitest";
import type { CookingSession, CookingTimer } from "./model";
import {
  buildCookingNotificationSchedule,
  canUseWebNotifications,
  cookingNotificationId,
  cookingNotificationScheduleSignature,
  cookingNotificationShownKey,
  dueCookingNotifications,
  nextCookingNotificationDelayMs,
  pendingCookingNotifications,
  pruneShownNotificationRecords,
  resolveCookingNotificationPermission,
  shouldPromptForCookingNotifications,
  shouldShowWebNotification,
  shownNotificationKeySet,
  usesInAppNotificationFallback,
} from "./cookingNotifications";

const NOW = "2026-08-19T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TIMER_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TIMER_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PLANNED_ID = "22222222-2222-4222-8222-222222222222";

function sampleTimer(overrides: Partial<CookingTimer> = {}): CookingTimer {
  return {
    id: TIMER_A,
    stepId: "step-a",
    label: "Pasta",
    durationSeconds: 600,
    status: "idle",
    ...overrides,
  };
}

function sampleSession(overrides: Partial<CookingSession> = {}): CookingSession {
  return {
    id: SESSION_ID,
    recipeId: "recipe-1",
    recipeTitle: "Weeknight carbonara",
    status: "in_progress",
    cookDate: "2026-08-19",
    startedAtIso: NOW,
    currentStepIndex: 0,
    timers: [sampleTimer()],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("permission-state handling", () => {
  it("maps missing Notification API to unsupported", () => {
    expect(resolveCookingNotificationPermission(false, undefined)).toBe("unsupported");
    expect(resolveCookingNotificationPermission(false, "granted")).toBe("unsupported");
  });

  it("maps browser permission strings, defaulting unknown values to default", () => {
    expect(resolveCookingNotificationPermission(true, "granted")).toBe("granted");
    expect(resolveCookingNotificationPermission(true, "denied")).toBe("denied");
    expect(resolveCookingNotificationPermission(true, "default")).toBe("default");
    expect(resolveCookingNotificationPermission(true, undefined)).toBe("default");
    expect(resolveCookingNotificationPermission(true, "prompt")).toBe("default");
  });

  it("only granted permission may use Web Notifications; everything else falls back in-app", () => {
    expect(canUseWebNotifications("granted")).toBe(true);
    expect(canUseWebNotifications("default")).toBe(false);
    expect(canUseWebNotifications("denied")).toBe(false);
    expect(canUseWebNotifications("unsupported")).toBe(false);
    expect(usesInAppNotificationFallback("granted")).toBe(false);
    expect(usesInAppNotificationFallback("denied")).toBe(true);
    expect(usesInAppNotificationFallback("unsupported")).toBe(true);
    expect(usesInAppNotificationFallback("default")).toBe(true);
  });

  it("prompts only while permission is default and the user has not dismissed", () => {
    expect(shouldPromptForCookingNotifications("default", false)).toBe(true);
    expect(shouldPromptForCookingNotifications("default", true)).toBe(false);
    expect(shouldPromptForCookingNotifications("granted", false)).toBe(false);
    expect(shouldPromptForCookingNotifications("denied", false)).toBe(false);
    expect(shouldPromptForCookingNotifications("unsupported", false)).toBe(false);
  });

  it("shows an OS notification only when granted, hidden, and not already shown", () => {
    expect(
      shouldShowWebNotification({
        permission: "granted",
        documentHidden: true,
        alreadyShown: false,
      })
    ).toBe(true);
    expect(
      shouldShowWebNotification({
        permission: "granted",
        documentHidden: false,
        alreadyShown: false,
      })
    ).toBe(false);
    expect(
      shouldShowWebNotification({
        permission: "granted",
        documentHidden: true,
        alreadyShown: true,
      })
    ).toBe(false);
    expect(
      shouldShowWebNotification({
        permission: "denied",
        documentHidden: true,
        alreadyShown: false,
      })
    ).toBe(false);
    expect(
      shouldShowWebNotification({
        permission: "unsupported",
        documentHidden: true,
        alreadyShown: false,
      })
    ).toBe(false);
  });
});

describe("scheduling logic", () => {
  it("schedules running timers at endsAtIso and ignores idle, paused, and done", () => {
    const session = sampleSession({
      timers: [
        sampleTimer({
          status: "running",
          endsAtIso: "2026-08-19T18:10:00.000Z",
        }),
        sampleTimer({
          id: TIMER_B,
          label: "Sauce",
          status: "paused",
          remainingSecondsAtPause: 120,
        }),
        sampleTimer({ id: "idle-timer", label: "Rest", status: "idle" }),
        sampleTimer({ id: "done-timer", label: "Boil", status: "done" }),
      ],
    });

    const schedule = buildCookingNotificationSchedule([session]);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      kind: "timer_done",
      title: "Pasta is done",
      body: "Timer finished while cooking Weeknight carbonara.",
      fireAtIso: "2026-08-19T18:10:00.000Z",
      sessionId: SESSION_ID,
      timerId: TIMER_A,
    });
    expect(schedule[0]?.id).toBe(cookingNotificationId("timer_done", SESSION_ID, TIMER_A));
  });

  it("schedules timed planned cooks and skips all-day planned cooks", () => {
    const timed: CookingSession = {
      ...sampleSession({
        id: PLANNED_ID,
        status: "planned",
        startedAtIso: "2026-08-19T23:30:00.000Z",
        timers: [],
      }),
    };
    const allDay: CookingSession = {
      ...sampleSession({
        id: "all-day",
        status: "planned",
        recipeTitle: "Overnight oats",
        timers: [],
      }),
    };
    delete allDay.startedAtIso;

    const schedule = buildCookingNotificationSchedule([timed, allDay]);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      kind: "start_cooking",
      title: "Time to cook Weeknight carbonara",
      body: "Your planned cook is ready to start.",
      fireAtIso: "2026-08-19T23:30:00.000Z",
      sessionId: PLANNED_ID,
    });
  });

  it("ignores completed and abandoned sessions", () => {
    const schedule = buildCookingNotificationSchedule([
      sampleSession({
        status: "completed",
        timers: [sampleTimer({ status: "running", endsAtIso: "2026-08-19T18:10:00.000Z" })],
      }),
      sampleSession({
        id: "abandoned",
        status: "abandoned",
        startedAtIso: "2026-08-19T18:05:00.000Z",
      }),
    ]);
    expect(schedule).toEqual([]);
  });

  it("sorts soonest-first and keeps a stable signature across identical schedules", () => {
    const laterTimer = sampleTimer({
      id: TIMER_B,
      label: "Sauce",
      status: "running",
      endsAtIso: "2026-08-19T18:20:00.000Z",
    });
    const soonerTimer = sampleTimer({
      status: "running",
      endsAtIso: "2026-08-19T18:05:00.000Z",
    });
    const sessions = [
      sampleSession({ timers: [laterTimer, soonerTimer] }),
      sampleSession({
        id: PLANNED_ID,
        status: "planned",
        startedAtIso: "2026-08-19T18:30:00.000Z",
        timers: [],
      }),
    ];
    const schedule = buildCookingNotificationSchedule(sessions);
    expect(schedule.map((item) => item.fireAtIso)).toEqual([
      "2026-08-19T18:05:00.000Z",
      "2026-08-19T18:20:00.000Z",
      "2026-08-19T18:30:00.000Z",
    ]);
    expect(cookingNotificationScheduleSignature(sessions)).toBe(
      cookingNotificationScheduleSignature([...sessions].reverse())
    );
  });

  it("splits due vs pending and skips already-shown keys, including after a restart", () => {
    const running = sampleTimer({
      status: "running",
      endsAtIso: "2026-08-19T18:10:00.000Z",
    });
    const planned = sampleSession({
      id: PLANNED_ID,
      status: "planned",
      startedAtIso: "2026-08-19T17:55:00.000Z",
      timers: [],
    });
    const schedule = buildCookingNotificationSchedule([
      sampleSession({ timers: [running] }),
      planned,
    ]);

    expect(pendingCookingNotifications(schedule, NOW).map((item) => item.kind)).toEqual([
      "timer_done",
    ]);
    const dueNow = dueCookingNotifications(schedule, NOW, new Set());
    expect(dueNow.map((item) => item.kind)).toEqual(["start_cooking"]);

    const dueLater = dueCookingNotifications(schedule, NOW_MS + 10 * 60_000, new Set());
    expect(dueLater.map((item) => item.kind)).toEqual(["start_cooking", "timer_done"]);

    const shownKey = cookingNotificationShownKey(dueLater[1]!);
    const afterShown = dueCookingNotifications(
      schedule,
      NOW_MS + 10 * 60_000,
      new Set([shownKey])
    );
    expect(afterShown.map((item) => item.kind)).toEqual(["start_cooking"]);

    const restarted = {
      ...running,
      endsAtIso: "2026-08-19T18:25:00.000Z",
    };
    const restartedSchedule = buildCookingNotificationSchedule([
      sampleSession({ timers: [restarted] }),
    ]);
    expect(
      dueCookingNotifications(restartedSchedule, "2026-08-19T18:25:00.000Z", new Set([shownKey]))
    ).toHaveLength(1);
  });

  it("clamps the next delay and returns undefined when nothing is pending", () => {
    const schedule = buildCookingNotificationSchedule([
      sampleSession({
        timers: [
          sampleTimer({
            status: "running",
            endsAtIso: "2026-08-19T20:00:00.000Z",
          }),
        ],
      }),
    ]);
    const pending = pendingCookingNotifications(schedule, NOW);
    expect(nextCookingNotificationDelayMs(pending, NOW, 60_000)).toBe(60_000);
    expect(nextCookingNotificationDelayMs(pending, NOW, 10 * 60 * 60_000)).toBe(2 * 60 * 60_000);
    expect(nextCookingNotificationDelayMs([], NOW, 60_000)).toBeUndefined();
  });
});

describe("shown-record pruning", () => {
  it("drops stale, invalid, and duplicate records", () => {
    const records = pruneShownNotificationRecords(
      [
        { key: "keep", fireAtIso: NOW },
        { key: "keep", fireAtIso: NOW },
        { key: "old", fireAtIso: "2026-08-01T18:00:00.000Z" },
        { key: "bad", fireAtIso: "not-a-date" },
      ],
      NOW
    );
    expect(records).toEqual([{ key: "keep", fireAtIso: NOW }]);
    expect(shownNotificationKeySet(records).has("keep")).toBe(true);
  });
});
