import { describe, expect, it } from "vitest";
import {
  applyWorkoutFinishDefaults,
  applyWorkoutLoggerDraft,
  DEFAULT_WORKOUT_DURATION_MINUTES,
  findActiveWorkoutSession,
  firstExerciseCompletedAtIso,
  finishWorkoutSession,
  toggleExerciseCompleted,
} from "./fitness";
import { parseFocusPhaseState, withWorkoutFocusDraft, withoutFocusDraft } from "./focusPhase";
import type { WorkoutSession } from "./model";
import { daysBetweenDateKeys, groupWorkoutSessionsForHistory } from "./workoutHistory";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-08-20T18:00:00.000Z";

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "session-1",
    date: "2026-08-20",
    planId: PLAN_ID,
    exercises: [{ id: "ex-a", name: "Bench" }, { id: "ex-b", name: "OHP" }],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

describe("first exercise tap becomes the default start", () => {
  it("stamps startedAtIso on the first complete tap", () => {
    const live = session({ completedAtIso: undefined });
    const tapped = toggleExerciseCompleted(live, "ex-a", NOW);
    expect(tapped.exercises[0]?.completedAtIso).toBe(NOW);
    expect(tapped.startedAtIso).toBe(NOW);
    expect(tapped.completedAtIso).toBeUndefined();
  });

  it("does not overwrite an explicit start time", () => {
    const live = session({
      completedAtIso: undefined,
      startedAtIso: "2026-08-20T16:00:00.000Z",
    });
    const tapped = toggleExerciseCompleted(live, "ex-a", NOW);
    expect(tapped.startedAtIso).toBe("2026-08-20T16:00:00.000Z");
  });
});

describe("applyWorkoutFinishDefaults", () => {
  it("uses the first tap and 60 minutes when nothing else is set", () => {
    const live = toggleExerciseCompleted(session({ completedAtIso: undefined }), "ex-a", NOW);
    const finished = applyWorkoutFinishDefaults(live, "2026-08-20T19:00:00.000Z");
    expect(finished.startedAtIso).toBe(NOW);
    expect(finished.durationMinutes).toBe(DEFAULT_WORKOUT_DURATION_MINUTES);
    expect(finished.completedAtIso).toBe("2026-08-20T19:00:00.000Z");
  });

  it("keeps an explicit duration and computes elapsed when duration is missing and finish is later", () => {
    const started = "2026-08-20T17:00:00.000Z";
    const withDuration = applyWorkoutFinishDefaults(
      session({ startedAtIso: started, durationMinutes: 45, completedAtIso: undefined }),
      NOW
    );
    expect(withDuration.durationMinutes).toBe(45);

    const elapsed = applyWorkoutFinishDefaults(
      session({ startedAtIso: "2026-08-20T16:30:00.000Z", completedAtIso: undefined }),
      NOW
    );
    expect(elapsed.durationMinutes).toBe(90);
  });

  it("finishWorkoutSession applies the same defaults", () => {
    const finished = finishWorkoutSession(session({ completedAtIso: undefined }), NOW);
    expect(finished.completedAtIso).toBe(NOW);
    expect(finished.startedAtIso).toBe(NOW);
    expect(finished.durationMinutes).toBe(60);
  });
});

describe("applyWorkoutLoggerDraft", () => {
  it("applies complete typed fields and skips invalid numbers", () => {
    const live = session({ completedAtIso: undefined, durationMinutes: 40 });
    const next = applyWorkoutLoggerDraft(live, {
      duration: "50",
      notes: "felt strong",
      exercises: {
        "ex-a": { name: "Incline bench", sets: "4", reps: "8", weight: "135" },
        "ex-b": { weight: "12." },
      },
    });
    expect(next.durationMinutes).toBe(50);
    expect(next.notes).toBe("felt strong");
    expect(next.exercises[0]).toMatchObject({
      name: "Incline bench",
      sets: 4,
      reps: 8,
      weight: 135,
    });
    expect(next.exercises[1]?.weight).toBeUndefined();
  });
});

describe("findActiveWorkoutSession", () => {
  it("returns the newest in-progress session", () => {
    const older = session({
      id: "old",
      completedAtIso: undefined,
      updatedAtIso: "2026-08-20T10:00:00.000Z",
    });
    const newer = session({
      id: "new",
      completedAtIso: undefined,
      updatedAtIso: "2026-08-20T12:00:00.000Z",
    });
    const done = session({ id: "done", completedAtIso: NOW });
    expect(findActiveWorkoutSession([done, older, newer])?.id).toBe("new");
  });
});

describe("groupWorkoutSessionsForHistory", () => {
  const today = "2026-08-20";

  it("groups recent sessions by week, older by month, then year", () => {
    const groups = groupWorkoutSessionsForHistory(
      [
        session({ id: "this-week", date: "2026-08-18", completedAtIso: NOW }),
        session({ id: "last-week", date: "2026-08-10", completedAtIso: NOW }),
        session({ id: "july", date: "2026-07-01", completedAtIso: NOW }),
        session({ id: "old", date: "2025-03-02", completedAtIso: NOW }),
        session({
          id: "live",
          date: "2026-08-19",
          completedAtIso: undefined,
          updatedAtIso: NOW,
        }),
      ],
      today
    );

    expect(groups.map((group) => group.id)).toEqual([
      "in_progress",
      "week:2026-08-17",
      "week:2026-08-10",
      "month:2026-07",
      "year:2025",
    ]);
    expect(groups[0]?.label).toBe("In progress");
    expect(groups[0]?.defaultExpanded).toBe(true);
    expect(groups[1]?.label).toBe("This week");
    expect(groups[1]?.defaultExpanded).toBe(true);
    expect(groups[2]?.label).toBe("Last week");
    expect(groups[2]?.defaultExpanded).toBe(false);
    expect(groups[3]?.label).toBe("July 2026");
    expect(groups[4]?.label).toBe("2025");
  });

  it("counts whole days between date keys", () => {
    expect(daysBetweenDateKeys("2026-08-01", "2026-08-20")).toBe(19);
    expect(daysBetweenDateKeys("2025-08-20", "2026-08-20")).toBe(365);
  });
});

describe("parseFocusPhaseState", () => {
  it("accepts a workout phase with a draft and strips unknown fields", () => {
    const parsed = parseFocusPhaseState({
      kind: "workout",
      sessionId: "s1",
      planId: "p1",
      extra: true,
      draft: {
        duration: "45",
        exercises: { "ex-a": { name: "Row", sets: "3", junk: 1 } },
      },
    });
    expect(parsed).toEqual({
      kind: "workout",
      sessionId: "s1",
      planId: "p1",
      draft: {
        duration: "45",
        exercises: { "ex-a": { name: "Row", sets: "3" } },
      },
    });
  });

  it("accepts a cooking phase and rejects invalid payloads", () => {
    expect(parseFocusPhaseState({ kind: "cooking", sessionId: "c1" })).toEqual({
      kind: "cooking",
      sessionId: "c1",
    });
    expect(parseFocusPhaseState({ kind: "workout" })).toBeUndefined();
    expect(parseFocusPhaseState(null)).toBeUndefined();
  });

  it("adds and clears a workout draft without dropping planId", () => {
    const base = parseFocusPhaseState({ kind: "workout", sessionId: "s1", planId: "p1" });
    if (!base) throw new Error("expected phase");
    const withDraft = withWorkoutFocusDraft(base, {
      duration: "30",
      exercises: { "ex-a": { name: "Curl" } },
    });
    expect(withDraft).toMatchObject({
      kind: "workout",
      planId: "p1",
      draft: { duration: "30" },
    });
    expect(withoutFocusDraft(withDraft)).toEqual({
      kind: "workout",
      sessionId: "s1",
      planId: "p1",
    });
  });
});

describe("firstExerciseCompletedAtIso", () => {
  it("returns the earliest stamp", () => {
    const live = session({
      completedAtIso: undefined,
      exercises: [
        { id: "ex-a", name: "A", completedAtIso: "2026-08-20T18:10:00.000Z" },
        { id: "ex-b", name: "B", completedAtIso: "2026-08-20T18:01:00.000Z" },
      ],
    });
    expect(firstExerciseCompletedAtIso(live)).toBe("2026-08-20T18:01:00.000Z");
  });
});
