import { describe, expect, it } from "vitest";
import type { SupplementIntakeLog, SupplementPhase, SupplementProtocol } from "./model";
import {
  adherenceForProtocols,
  adherenceForRange,
  buildDoseSlotsFromPhase,
  createIntakeDraft,
  dashboardToggleDose,
  doseProgressOnDate,
  dueProtocolsForDate,
  currentAdherenceStreak,
  dueProtocolsWithRemainingDoses,
  durationDaysFromRange,
  findIntakeForProtocolDate,
  formatDoseSummary,
  formatPhaseChip,
  incompleteAdherenceDays,
  intakeDayKey,
  intakeProgress,
  isProtocolDueOnDate,
  listCompleteAdherenceDays,
  resolveLoadingEndDate,
  resolvePhaseForDate,
  upsertToggleDose,
} from "./supplements";

const PROTOCOL_ID = "11111111-1111-4111-8111-111111111111";
const LOG_ID = "22222222-2222-4222-8222-222222222222";
const PHASE_LOADING_ID = "33333333-3333-4333-8333-333333333333";
const PHASE_MAINT_ID = "44444444-4444-4444-8444-444444444444";
const DOSE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOSE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOSE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOSE_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOW = "2026-08-18T12:00:00.000Z";

const LOADING_START = "2026-08-18";
const LOADING_END = "2026-08-24";
const MAINT_START = "2026-08-25";

function loadingPhase(overrides: Partial<SupplementPhase> = {}): SupplementPhase {
  return {
    id: PHASE_LOADING_ID,
    kind: "loading",
    startDate: LOADING_START,
    endDate: LOADING_END,
    dosesPerDay: 4,
    amountPerDose: 5,
    ...overrides,
  };
}

function maintenancePhase(overrides: Partial<SupplementPhase> = {}): SupplementPhase {
  return {
    id: PHASE_MAINT_ID,
    kind: "maintenance",
    startDate: MAINT_START,
    dosesPerDay: 1,
    amountPerDose: 5,
    ...overrides,
  };
}

function sampleProtocol(overrides: Partial<SupplementProtocol> = {}): SupplementProtocol {
  return {
    id: PROTOCOL_ID,
    name: "Creatine",
    unit: "g",
    active: true,
    phases: [loadingPhase(), maintenancePhase()],
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function sampleLog(overrides: Partial<SupplementIntakeLog> = {}): SupplementIntakeLog {
  return {
    id: LOG_ID,
    protocolId: PROTOCOL_ID,
    date: LOADING_START,
    doses: buildDoseSlotsFromPhase(loadingPhase(), [DOSE_A, DOSE_B, DOSE_C, DOSE_D]),
    createdAtIso: NOW,
    updatedAtIso: NOW,
    ...overrides,
  };
}

function takeAll(log: SupplementIntakeLog, takenAtIso = NOW): SupplementIntakeLog {
  return log.doses.reduce(
    (current, slot) => upsertToggleDose(current, slot.id, takenAtIso),
    log
  );
}

describe("resolvePhaseForDate", () => {
  it("returns loading through its inclusive endDate", () => {
    const protocol = sampleProtocol();
    expect(resolvePhaseForDate(protocol, LOADING_START)?.kind).toBe("loading");
    expect(resolvePhaseForDate(protocol, LOADING_END)?.kind).toBe("loading");
  });

  it("flips to maintenance on the day after loading ends", () => {
    const protocol = sampleProtocol();
    expect(resolvePhaseForDate(protocol, MAINT_START)?.kind).toBe("maintenance");
    expect(resolvePhaseForDate(protocol, "2026-09-01")?.kind).toBe("maintenance");
  });

  it("returns undefined before the first phase and in a gap", () => {
    const protocol = sampleProtocol({
      phases: [
        loadingPhase(),
        maintenancePhase({ startDate: "2026-09-01" }),
      ],
    });
    expect(resolvePhaseForDate(protocol, "2026-08-17")).toBeUndefined();
    expect(resolvePhaseForDate(protocol, "2026-08-25")).toBeUndefined();
  });

  it("prefers the later startDate when phases overlap", () => {
    const protocol = sampleProtocol({
      phases: [
        loadingPhase({ endDate: "2026-08-31" }),
        maintenancePhase({ startDate: "2026-08-25" }),
      ],
    });
    expect(resolvePhaseForDate(protocol, "2026-08-25")?.kind).toBe("maintenance");
  });
});

describe("isProtocolDueOnDate", () => {
  it("is false when the protocol is paused", () => {
    expect(isProtocolDueOnDate(sampleProtocol({ active: false }), LOADING_START)).toBe(false);
  });

  it("is false when no phase covers the date", () => {
    expect(isProtocolDueOnDate(sampleProtocol(), "2026-08-17")).toBe(false);
  });

  it("honors an optional weekday filter", () => {
    // Loading is 2026-08-18 (Tue) through 2026-08-24 (Mon).
    const protocol = sampleProtocol({
      phases: [loadingPhase({ weekdays: ["mon"] }), maintenancePhase()],
    });
    expect(isProtocolDueOnDate(protocol, "2026-08-24")).toBe(true);
    expect(isProtocolDueOnDate(protocol, "2026-08-18")).toBe(false);
  });
});

describe("buildDoseSlotsFromPhase / createIntakeDraft", () => {
  it("copies amount, slot indexes, and optional times", () => {
    const slots = buildDoseSlotsFromPhase(
      loadingPhase({ times: ["08:00", "12:00", "16:00", "20:00"] }),
      [DOSE_A, DOSE_B, DOSE_C, DOSE_D]
    );
    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.slotIndex)).toEqual([0, 1, 2, 3]);
    expect(slots[0]).toMatchObject({ id: DOSE_A, amount: 5, plannedTime: "08:00" });
    expect(slots[3]).toMatchObject({ id: DOSE_D, plannedTime: "20:00" });
  });

  it("drafts a loading-day log and a one-dose maintenance log", () => {
    const protocol = sampleProtocol();
    const loading = createIntakeDraft(protocol, LOADING_START, {
      id: LOG_ID,
      nowIso: NOW,
      doseIds: [DOSE_A, DOSE_B, DOSE_C, DOSE_D],
    });
    expect(loading?.doses).toHaveLength(4);

    const maintenance = createIntakeDraft(protocol, MAINT_START, {
      id: LOG_ID,
      nowIso: NOW,
      doseIds: [DOSE_A],
    });
    expect(maintenance?.doses).toHaveLength(1);
    expect(maintenance?.doses[0]?.amount).toBe(5);
  });

  it("returns undefined when the protocol is not due", () => {
    expect(
      createIntakeDraft(sampleProtocol({ active: false }), LOADING_START, {
        id: LOG_ID,
        nowIso: NOW,
      })
    ).toBeUndefined();
  });
});

describe("upsertToggleDose / intakeProgress", () => {
  it("stamps and clears a dose without mutating the original log", () => {
    const log = sampleLog();
    const taken = upsertToggleDose(log, DOSE_A, NOW);
    expect(log.doses[0]?.takenAtIso).toBeUndefined();
    expect(taken.doses[0]?.takenAtIso).toBe(NOW);
    expect(intakeProgress(taken)).toEqual({ taken: 1, planned: 4, complete: false });

    const cleared = upsertToggleDose(taken, DOSE_A, null);
    expect(cleared.doses[0]?.takenAtIso).toBeUndefined();
    expect(intakeProgress(cleared).taken).toBe(0);
  });

  it("marks the day complete when every slot is taken", () => {
    let log = sampleLog();
    for (const id of [DOSE_A, DOSE_B, DOSE_C, DOSE_D]) {
      log = upsertToggleDose(log, id, NOW);
    }
    expect(intakeProgress(log)).toEqual({ taken: 4, planned: 4, complete: true });
  });

  it("leaves the log unchanged for an unknown slot id", () => {
    const log = sampleLog();
    expect(upsertToggleDose(log, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", NOW)).toBe(log);
  });
});

describe("findIntakeForProtocolDate / intakeDayKey", () => {
  it("identifies the unique protocol+date log", () => {
    const logs = [
      sampleLog(),
      sampleLog({
        id: "99999999-9999-4999-8999-999999999999",
        date: "2026-08-19",
      }),
    ];
    expect(findIntakeForProtocolDate(logs, PROTOCOL_ID, LOADING_START)?.id).toBe(LOG_ID);
    expect(findIntakeForProtocolDate(logs, PROTOCOL_ID, "2026-08-20")).toBeUndefined();
    expect(intakeDayKey(PROTOCOL_ID, LOADING_START)).toBe(`${PROTOCOL_ID}:${LOADING_START}`);
  });
});

describe("adherenceForRange", () => {
  it("counts due days only and ignores weekday-off loading days", () => {
    const protocol = sampleProtocol({
      phases: [loadingPhase({ weekdays: ["tue"] }), maintenancePhase()],
    });
    let loadingComplete = sampleLog({ date: "2026-08-18" });
    for (const id of [DOSE_A, DOSE_B, DOSE_C, DOSE_D]) {
      loadingComplete = upsertToggleDose(loadingComplete, id, NOW);
    }
    const maintComplete = upsertToggleDose(
      sampleLog({
        id: "55555555-5555-4555-8555-555555555555",
        date: "2026-08-25",
        doses: buildDoseSlotsFromPhase(maintenancePhase(), [DOSE_A]),
      }),
      DOSE_A,
      NOW
    );

    const summary = adherenceForRange(
      protocol,
      [loadingComplete, maintComplete],
      "2026-08-18",
      "2026-08-25"
    );

    expect(summary.dueDays).toBe(2);
    expect(summary.completeDays).toBe(2);
    expect(summary.partialDays).toBe(0);
    expect(summary.missedDays).toBe(0);
    expect(summary.rate).toBe(1);
  });

  it("treats a partial loading day as partial and a missing due day as missed", () => {
    const protocol = sampleProtocol();
    const partial = upsertToggleDose(sampleLog(), DOSE_A, NOW);
    const summary = adherenceForRange(protocol, [partial], LOADING_START, LOADING_START);
    expect(summary).toEqual({
      dueDays: 1,
      completeDays: 0,
      partialDays: 1,
      missedDays: 0,
      rate: 0,
    });

    const missed = adherenceForRange(protocol, [], LOADING_START, LOADING_START);
    expect(missed.missedDays).toBe(1);
    expect(missed.rate).toBe(0);
  });

  it("returns a null rate when nothing is due in the range", () => {
    const summary = adherenceForRange(sampleProtocol(), [], "2026-08-10", "2026-08-17");
    expect(summary.dueDays).toBe(0);
    expect(summary.rate).toBeNull();
  });

  it("aggregates protocol-days across protocols", () => {
    const creatine = sampleProtocol();
    const zinc = sampleProtocol({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Zinc",
    });
    const creatinePartial = upsertToggleDose(sampleLog(), DOSE_A, NOW);
    const summary = adherenceForProtocols(
      [creatine, zinc],
      [creatinePartial],
      LOADING_START,
      LOADING_START
    );
    expect(summary.dueDays).toBe(2);
    expect(summary.completeDays).toBe(0);
    expect(summary.partialDays).toBe(1);
    expect(summary.missedDays).toBe(1);
    expect(summary.rate).toBe(0);
    expect(incompleteAdherenceDays(summary)).toBe(2);
  });
});

describe("doseProgressOnDate / remaining doses", () => {
  it("treats a missing log as all doses remaining", () => {
    const protocol = sampleProtocol();
    expect(doseProgressOnDate(protocol, [], LOADING_START)).toEqual({
      protocol,
      taken: 0,
      planned: 4,
      remaining: 4,
    });
  });

  it("counts untaken slots after a partial log", () => {
    const protocol = sampleProtocol();
    const partial = upsertToggleDose(sampleLog(), DOSE_A, NOW);
    expect(doseProgressOnDate(protocol, [partial], LOADING_START)?.remaining).toBe(3);
  });

  it("omits paused protocols and complete days", () => {
    const paused = sampleProtocol({ active: false });
    expect(doseProgressOnDate(paused, [], LOADING_START)).toBeUndefined();

    const protocol = sampleProtocol();
    let complete = sampleLog();
    for (const id of [DOSE_A, DOSE_B, DOSE_C, DOSE_D]) {
      complete = upsertToggleDose(complete, id, NOW);
    }
    expect(dueProtocolsWithRemainingDoses([protocol], [complete], LOADING_START)).toEqual([]);
  });

  it("returns due incomplete protocols sorted by name", () => {
    const zinc = sampleProtocol({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Zinc",
    });
    const creatine = sampleProtocol({ name: "Creatine" });
    const remaining = dueProtocolsWithRemainingDoses([zinc, creatine], [], LOADING_START);
    expect(remaining.map((item) => item.protocol.name)).toEqual(["Creatine", "Zinc"]);
  });
});

describe("formatDoseSummary", () => {
  it("formats amount, unit, and doses per day", () => {
    expect(formatDoseSummary(loadingPhase(), "g")).toBe("5 g × 4");
    expect(formatDoseSummary(maintenancePhase(), "g")).toBe("5 g × 1");
  });
});

describe("formatPhaseChip / loading window", () => {
  it("labels loading as day N of duration and maintenance without a day count", () => {
    expect(formatPhaseChip(loadingPhase(), LOADING_START)).toBe("Loading · day 1/7");
    expect(formatPhaseChip(loadingPhase(), "2026-08-20")).toBe("Loading · day 3/7");
    expect(formatPhaseChip(loadingPhase(), LOADING_END)).toBe("Loading · day 7/7");
    expect(formatPhaseChip(maintenancePhase(), MAINT_START)).toBe("Maintenance");
  });

  it("resolves a 7-day loading window to an inclusive endDate", () => {
    expect(resolveLoadingEndDate(LOADING_START, 7)).toBe(LOADING_END);
    expect(durationDaysFromRange(LOADING_START, LOADING_END)).toBe(7);
    expect(resolveLoadingEndDate(LOADING_START, 0)).toBeUndefined();
  });
});

describe("dueProtocolsForDate", () => {
  it("returns active due protocols sorted by name and omits paused ones", () => {
    const creatine = sampleProtocol({ name: "Creatine" });
    const zinc = sampleProtocol({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Zinc",
    });
    const paused = sampleProtocol({
      id: "66666666-6666-4666-8666-666666666666",
      name: "Paused",
      active: false,
    });
    expect(dueProtocolsForDate([zinc, paused, creatine], LOADING_START).map((p) => p.name)).toEqual(
      ["Creatine", "Zinc"]
    );
  });
});

describe("dashboardToggleDose", () => {
  it("creates a day log on the first tap and toggles the slot", () => {
    const protocol = sampleProtocol();
    const first = dashboardToggleDose(protocol, [], 0, LOADING_START, NOW, LOG_ID);
    expect(first?.id).toBe(LOG_ID);
    expect(first?.doses).toHaveLength(4);
    expect(first?.doses[0]?.takenAtIso).toBe(NOW);
    expect(intakeProgress(first!).taken).toBe(1);

    const cleared = dashboardToggleDose(protocol, [first!], 0, LOADING_START, NOW, "new-id");
    expect(cleared?.id).toBe(LOG_ID);
    expect(cleared?.doses[0]?.takenAtIso).toBeUndefined();
  });

  it("uses the maintenance slot count after the loading window", () => {
    const protocol = sampleProtocol();
    const log = dashboardToggleDose(protocol, [], 0, MAINT_START, NOW, LOG_ID);
    expect(log?.doses).toHaveLength(1);
    expect(log?.doses[0]?.takenAtIso).toBe(NOW);
  });
});

describe("listCompleteAdherenceDays", () => {
  it("emits one day per complete log and skips partials", () => {
    const complete = takeAll(sampleLog());
    const partial = upsertToggleDose(sampleLog({ id: "partial", date: "2026-08-19" }), DOSE_A, NOW);
    expect(listCompleteAdherenceDays([partial, complete])).toEqual([
      { protocolId: PROTOCOL_ID, dateKey: LOADING_START },
    ]);
  });

  it("does not multiply grants by dose count", () => {
    const fourDoseDay = takeAll(sampleLog());
    expect(listCompleteAdherenceDays([fourDoseDay])).toHaveLength(1);
  });
});

describe("currentAdherenceStreak", () => {
  it("counts consecutive complete due days ending today", () => {
    const protocol = sampleProtocol();
    const logs = [
      takeAll(sampleLog({ id: "d1", date: "2026-08-18" })),
      takeAll(sampleLog({ id: "d2", date: "2026-08-19" })),
      takeAll(sampleLog({ id: "d3", date: "2026-08-20" })),
    ];
    expect(currentAdherenceStreak(protocol, logs, "2026-08-20")).toEqual({
      current: 3,
      activeToday: true,
    });
  });

  it("anchors on yesterday when today is due and still incomplete", () => {
    const protocol = sampleProtocol();
    const logs = [
      takeAll(sampleLog({ id: "d1", date: "2026-08-18" })),
      takeAll(sampleLog({ id: "d2", date: "2026-08-19" })),
    ];
    expect(currentAdherenceStreak(protocol, logs, "2026-08-20")).toEqual({
      current: 2,
      activeToday: false,
    });
  });

  it("skips non-due weekdays instead of breaking the streak", () => {
    const protocol = sampleProtocol({
      phases: [
        loadingPhase({ weekdays: ["mon", "wed", "fri"] }),
        maintenancePhase({ weekdays: ["mon", "wed", "fri"] }),
      ],
    });
    const logs = [
      takeAll(sampleLog({ id: "wed", date: "2026-08-19" })),
      takeAll(sampleLog({ id: "fri", date: "2026-08-21" })),
    ];
    expect(currentAdherenceStreak(protocol, logs, "2026-08-21")).toEqual({
      current: 2,
      activeToday: true,
    });
  });

  it("breaks on a missed due day and returns 0 when paused", () => {
    const protocol = sampleProtocol();
    const logs = [
      takeAll(sampleLog({ id: "d1", date: "2026-08-18" })),
      takeAll(sampleLog({ id: "d3", date: "2026-08-20" })),
    ];
    expect(currentAdherenceStreak(protocol, logs, "2026-08-20").current).toBe(1);

    const paused = sampleProtocol({ active: false });
    expect(currentAdherenceStreak(paused, logs, "2026-08-20")).toEqual({
      current: 0,
      activeToday: false,
    });
  });
});
