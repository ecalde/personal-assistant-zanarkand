/**
 * Pure helpers for the Fitness supplement tracker (protocol templates + daily intake).
 *
 * Current phase is derived from dates — protocols never store a loading/maintenance status.
 */

import { addDaysToDateKey, daysBetweenDateKeys } from "./events";
import type {
  SupplementDoseSlot,
  SupplementForm,
  SupplementIntakeLog,
  SupplementPhase,
  SupplementPhaseKind,
  SupplementProtocol,
  SupplementUnit,
} from "./model";
import { iterateDateRange, weekdayFromDateString } from "./timeline";

export const MIN_DOSES_PER_DAY = 1;
export const MAX_DOSES_PER_DAY = 6;

export const SUPPLEMENT_FORM_LABELS: Record<SupplementForm, string> = {
  powder: "Powder",
  capsule: "Capsule",
  liquid: "Liquid",
  other: "Other",
};

export const SUPPLEMENT_UNIT_LABELS: Record<SupplementUnit, string> = {
  g: "g",
  mg: "mg",
  mcg: "mcg",
  iu: "IU",
  scoop: "scoop",
  capsule: "capsule",
  drop: "drop",
};

export const SUPPLEMENT_PHASE_KIND_LABELS: Record<SupplementPhaseKind, string> = {
  loading: "Loading",
  maintenance: "Maintenance",
  custom: "Custom",
};

export const SUPPLEMENT_FORM_VALUES: SupplementForm[] = ["powder", "capsule", "liquid", "other"];
export const SUPPLEMENT_UNIT_VALUES: SupplementUnit[] = [
  "g",
  "mg",
  "mcg",
  "iu",
  "scoop",
  "capsule",
  "drop",
];

export type IntakeProgress = {
  taken: number;
  planned: number;
  complete: boolean;
};

export type AdherenceSummary = {
  dueDays: number;
  completeDays: number;
  partialDays: number;
  missedDays: number;
  rate: number | null;
};

export type ProtocolDoseProgress = {
  protocol: SupplementProtocol;
  taken: number;
  planned: number;
  remaining: number;
};

export type CompleteAdherenceDay = {
  protocolId: string;
  dateKey: string;
};

export type AdherenceStreak = {
  current: number;
  activeToday: boolean;
};

export function intakeDayKey(protocolId: string, dateKey: string): string {
  return `${protocolId}:${dateKey}`;
}

export function findIntakeForProtocolDate(
  logs: readonly SupplementIntakeLog[],
  protocolId: string,
  dateKey: string
): SupplementIntakeLog | undefined {
  return logs.find((log) => log.protocolId === protocolId && log.date === dateKey);
}

export function isDateInPhase(phase: SupplementPhase, dateKey: string): boolean {
  if (dateKey < phase.startDate) return false;
  if (phase.endDate !== undefined && dateKey > phase.endDate) return false;
  return true;
}

/**
 * The phase in effect on `dateKey`. When phases overlap, the latest `startDate`
 * wins (then the last listed phase). Gaps and dates before the first phase
 * return undefined.
 */
export function resolvePhaseForDate(
  protocol: SupplementProtocol,
  dateKey: string
): SupplementPhase | undefined {
  const matches = protocol.phases.filter((phase) => isDateInPhase(phase, dateKey));
  if (matches.length === 0) return undefined;

  let best = matches[0]!;
  for (const phase of matches.slice(1)) {
    if (phase.startDate > best.startDate) {
      best = phase;
      continue;
    }
    if (phase.startDate === best.startDate) {
      best = phase;
    }
  }
  return best;
}

export function isProtocolDueOnDate(protocol: SupplementProtocol, dateKey: string): boolean {
  if (!protocol.active) return false;
  const phase = resolvePhaseForDate(protocol, dateKey);
  if (!phase) return false;
  if (phase.weekdays === undefined) return true;
  const weekday = weekdayFromDateString(dateKey);
  return phase.weekdays.includes(weekday);
}

export function buildDoseSlotsFromPhase(
  phase: SupplementPhase,
  doseIds?: string[]
): SupplementDoseSlot[] {
  const slots: SupplementDoseSlot[] = [];
  for (let index = 0; index < phase.dosesPerDay; index += 1) {
    const id = doseIds?.[index] ?? crypto.randomUUID();
    const slot: SupplementDoseSlot = {
      id,
      slotIndex: index,
      amount: phase.amountPerDose,
    };
    const plannedTime = phase.times?.[index];
    if (plannedTime) slot.plannedTime = plannedTime;
    slots.push(slot);
  }
  return slots;
}

export function createIntakeDraft(
  protocol: SupplementProtocol,
  dateKey: string,
  options: { id: string; nowIso: string; doseIds?: string[] }
): SupplementIntakeLog | undefined {
  if (!isProtocolDueOnDate(protocol, dateKey)) return undefined;
  const phase = resolvePhaseForDate(protocol, dateKey);
  if (!phase) return undefined;

  return {
    id: options.id,
    protocolId: protocol.id,
    date: dateKey,
    doses: buildDoseSlotsFromPhase(phase, options.doseIds),
    createdAtIso: options.nowIso,
    updatedAtIso: options.nowIso,
  };
}

/**
 * Sets or clears `takenAtIso` on a dose slot. `null` untakes the dose; a
 * timestamp stamps it taken. Unknown slot ids leave the log unchanged.
 */
export function upsertToggleDose(
  log: SupplementIntakeLog,
  slotId: string,
  takenAtIso: string | null
): SupplementIntakeLog {
  let changed = false;
  const doses = log.doses.map((slot) => {
    if (slot.id !== slotId) return slot;
    changed = true;
    const next = { ...slot };
    if (takenAtIso === null) {
      delete next.takenAtIso;
    } else {
      next.takenAtIso = takenAtIso;
    }
    return next;
  });
  if (!changed) return log;
  return { ...log, doses };
}

export function intakeProgress(log: SupplementIntakeLog): IntakeProgress {
  const planned = log.doses.length;
  const taken = log.doses.filter((slot) => slot.takenAtIso !== undefined).length;
  return {
    taken,
    planned,
    complete: planned > 0 && taken === planned,
  };
}

export function formatDoseSummary(phase: SupplementPhase, unit: SupplementUnit): string {
  return `${phase.amountPerDose} ${SUPPLEMENT_UNIT_LABELS[unit]} × ${phase.dosesPerDay}`;
}

export function dueProtocolsForDate(
  protocols: readonly SupplementProtocol[],
  dateKey: string
): SupplementProtocol[] {
  return protocols
    .filter((protocol) => isProtocolDueOnDate(protocol, dateKey))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Loading windows with an endDate become `Loading · day 3/7`. Open-ended
 * phases (typical maintenance) are the kind label only.
 */
export function formatPhaseChip(phase: SupplementPhase, dateKey: string): string {
  const kindLabel = SUPPLEMENT_PHASE_KIND_LABELS[phase.kind];
  if (!phase.endDate) return kindLabel;
  const total = daysBetweenDateKeys(phase.startDate, phase.endDate);
  const current = daysBetweenDateKeys(phase.startDate, dateKey);
  if (total === null || current === null) return kindLabel;
  const dayNumber = current + 1;
  const dayCount = total + 1;
  if (dayNumber < 1 || dayNumber > dayCount) return kindLabel;
  return `${kindLabel} · day ${dayNumber}/${dayCount}`;
}

export function resolveLoadingEndDate(
  startDate: string,
  durationDays: number
): string | undefined {
  if (!Number.isInteger(durationDays) || durationDays < 1) return undefined;
  return addDaysToDateKey(startDate, durationDays - 1) ?? undefined;
}

export function durationDaysFromRange(startDate: string, endDate: string): number | undefined {
  const span = daysBetweenDateKeys(startDate, endDate);
  if (span === null || span < 0) return undefined;
  return span + 1;
}

export function ensureIntakeForProtocolDate(
  protocol: SupplementProtocol,
  logs: readonly SupplementIntakeLog[],
  dateKey: string,
  options: { id: string; nowIso: string; doseIds?: string[] }
): SupplementIntakeLog | undefined {
  const existing = findIntakeForProtocolDate(logs, protocol.id, dateKey);
  if (existing) return existing;
  return createIntakeDraft(protocol, dateKey, options);
}

/**
 * First tap upserts a day log; later taps toggle `takenAtIso` on that slot.
 * Slot identity is `slotIndex` so dashboard buttons work before persist.
 */
export function dashboardToggleDose(
  protocol: SupplementProtocol,
  logs: readonly SupplementIntakeLog[],
  slotIndex: number,
  dateKey: string,
  nowIso: string,
  newLogId: string
): SupplementIntakeLog | undefined {
  const log = ensureIntakeForProtocolDate(protocol, logs, dateKey, {
    id: newLogId,
    nowIso,
  });
  if (!log) return undefined;
  const slot = log.doses.find((dose) => dose.slotIndex === slotIndex);
  if (!slot) return undefined;
  const nextTaken = slot.takenAtIso ? null : nowIso;
  const next = upsertToggleDose(log, slot.id, nextTaken);
  return { ...next, updatedAtIso: nowIso };
}

function classifyDueDay(
  log: SupplementIntakeLog | undefined
): "complete" | "partial" | "missed" {
  if (!log) return "missed";
  const progress = intakeProgress(log);
  if (progress.complete) return "complete";
  if (progress.taken > 0) return "partial";
  return "missed";
}

export function adherenceForRange(
  protocol: SupplementProtocol,
  logs: readonly SupplementIntakeLog[],
  startDate: string,
  endDate: string
): AdherenceSummary {
  const logsByDay = new Map<string, SupplementIntakeLog>();
  for (const log of logs) {
    if (log.protocolId !== protocol.id) continue;
    logsByDay.set(log.date, log);
  }

  let dueDays = 0;
  let completeDays = 0;
  let partialDays = 0;
  let missedDays = 0;

  for (const dateKey of iterateDateRange(startDate, endDate)) {
    if (!isProtocolDueOnDate(protocol, dateKey)) continue;
    dueDays += 1;
    const kind = classifyDueDay(logsByDay.get(dateKey));
    if (kind === "complete") completeDays += 1;
    else if (kind === "partial") partialDays += 1;
    else missedDays += 1;
  }

  return {
    dueDays,
    completeDays,
    partialDays,
    missedDays,
    rate: dueDays === 0 ? null : completeDays / dueDays,
  };
}

export function emptyAdherenceSummary(): AdherenceSummary {
  return {
    dueDays: 0,
    completeDays: 0,
    partialDays: 0,
    missedDays: 0,
    rate: null,
  };
}

/** Combined protocol-days across every protocol in the range. */
export function adherenceForProtocols(
  protocols: readonly SupplementProtocol[],
  logs: readonly SupplementIntakeLog[],
  startDate: string,
  endDate: string
): AdherenceSummary {
  const totals = emptyAdherenceSummary();
  for (const protocol of protocols) {
    const summary = adherenceForRange(protocol, logs, startDate, endDate);
    totals.dueDays += summary.dueDays;
    totals.completeDays += summary.completeDays;
    totals.partialDays += summary.partialDays;
    totals.missedDays += summary.missedDays;
  }
  totals.rate = totals.dueDays === 0 ? null : totals.completeDays / totals.dueDays;
  return totals;
}

export function incompleteAdherenceDays(summary: AdherenceSummary): number {
  return summary.partialDays + summary.missedDays;
}

/**
 * Planned vs taken for a due protocol on `dateKey`. No log means every
 * phase slot is still remaining.
 */
export function doseProgressOnDate(
  protocol: SupplementProtocol,
  logs: readonly SupplementIntakeLog[],
  dateKey: string
): ProtocolDoseProgress | undefined {
  if (!isProtocolDueOnDate(protocol, dateKey)) return undefined;
  const phase = resolvePhaseForDate(protocol, dateKey);
  if (!phase) return undefined;
  const log = findIntakeForProtocolDate(logs, protocol.id, dateKey);
  const planned = log ? log.doses.length : phase.dosesPerDay;
  const taken = log ? intakeProgress(log).taken : 0;
  return {
    protocol,
    taken,
    planned,
    remaining: Math.max(planned - taken, 0),
  };
}

export function dueProtocolsWithRemainingDoses(
  protocols: readonly SupplementProtocol[],
  logs: readonly SupplementIntakeLog[],
  dateKey: string
): ProtocolDoseProgress[] {
  const remaining: ProtocolDoseProgress[] = [];
  for (const protocol of dueProtocolsForDate(protocols, dateKey)) {
    const progress = doseProgressOnDate(protocol, logs, dateKey);
    if (progress && progress.remaining > 0) remaining.push(progress);
  }
  return remaining;
}

/**
 * Full adherence days used for body XP. Partial / empty logs are omitted so a
 * 4-dose loading day cannot out-grind a workout.
 */
export function listCompleteAdherenceDays(
  logs: readonly SupplementIntakeLog[]
): CompleteAdherenceDay[] {
  const days: CompleteAdherenceDay[] = [];
  for (const log of logs) {
    if (!intakeProgress(log).complete) continue;
    days.push({ protocolId: log.protocolId, dateKey: log.date });
  }
  days.sort((a, b) => {
    const byDate = a.dateKey.localeCompare(b.dateKey);
    if (byDate !== 0) return byDate;
    return a.protocolId.localeCompare(b.protocolId);
  });
  return days;
}

export function earliestPhaseStartDate(protocol: SupplementProtocol): string | undefined {
  let earliest: string | undefined;
  for (const phase of protocol.phases) {
    if (!earliest || phase.startDate < earliest) earliest = phase.startDate;
  }
  return earliest;
}

function logsByDateForProtocol(
  logs: readonly SupplementIntakeLog[],
  protocolId: string
): Map<string, SupplementIntakeLog> {
  const byDate = new Map<string, SupplementIntakeLog>();
  for (const log of logs) {
    if (log.protocolId !== protocolId) continue;
    byDate.set(log.date, log);
  }
  return byDate;
}

/**
 * Consecutive complete due days ending at `todayKey`. Non-due weekdays are
 * skipped so Mon/Wed/Fri protocols do not break over Tuesday. If today is due
 * and still incomplete, the streak anchors on yesterday (today can still extend it).
 */
export function currentAdherenceStreak(
  protocol: SupplementProtocol,
  logs: readonly SupplementIntakeLog[],
  todayKey: string
): AdherenceStreak {
  const empty: AdherenceStreak = { current: 0, activeToday: false };
  if (!protocol.active || protocol.phases.length === 0) return empty;

  const startBound = earliestPhaseStartDate(protocol);
  if (!startBound) return empty;

  const byDate = logsByDateForProtocol(logs, protocol.id);
  const todayDue = isProtocolDueOnDate(protocol, todayKey);
  const todayComplete = classifyDueDay(byDate.get(todayKey)) === "complete";
  const activeToday = todayDue && todayComplete;

  let cursor = todayKey;
  if (todayDue && !todayComplete) {
    const yesterday = addDaysToDateKey(todayKey, -1);
    if (!yesterday) return empty;
    cursor = yesterday;
  }

  let current = 0;
  while (cursor >= startBound) {
    if (!isProtocolDueOnDate(protocol, cursor)) {
      const prev = addDaysToDateKey(cursor, -1);
      if (!prev || prev >= cursor) break;
      cursor = prev;
      continue;
    }
    if (classifyDueDay(byDate.get(cursor)) !== "complete") break;
    current += 1;
    const prev = addDaysToDateKey(cursor, -1);
    if (!prev || prev >= cursor) break;
    cursor = prev;
  }

  return { current, activeToday };
}
