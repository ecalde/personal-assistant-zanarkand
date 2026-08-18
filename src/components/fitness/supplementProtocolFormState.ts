import type {
  SupplementForm,
  SupplementPhase,
  SupplementProtocol,
  SupplementUnit,
} from "../../core/model";
import {
  MAX_DOSES_PER_DAY,
  MIN_DOSES_PER_DAY,
  SUPPLEMENT_FORM_VALUES,
  SUPPLEMENT_UNIT_VALUES,
  durationDaysFromRange,
  resolveLoadingEndDate,
} from "../../core/supplements";
import { addDaysToDateKey } from "../../core/events";

export const MAX_LOADING_DURATION_DAYS = 90;

export type SupplementProtocolFormState = {
  name: string;
  form: SupplementForm | "";
  unit: SupplementUnit;
  notes: string;
  active: boolean;
  startDate: string;
  maintenanceAmount: string;
  maintenanceDosesPerDay: string;
  maintenancePhaseId: string;
  includeLoading: boolean;
  loadingDurationDays: string;
  loadingAmount: string;
  loadingDosesPerDay: string;
  loadingPhaseId: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptySupplementProtocolFormState(
  todayKey: string
): SupplementProtocolFormState {
  return {
    name: "",
    form: "",
    unit: "g",
    notes: "",
    active: true,
    startDate: todayKey,
    maintenanceAmount: "",
    maintenanceDosesPerDay: "1",
    maintenancePhaseId: "",
    includeLoading: false,
    loadingDurationDays: "7",
    loadingAmount: "",
    loadingDosesPerDay: "4",
    loadingPhaseId: "",
  };
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function parsePositiveAmount(raw: string, label: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return `${label} is required.`;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return `${label} must be greater than zero.`;
  }
  return parsed;
}

function parseDosesPerDay(raw: string, label: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return `${label} is required.`;
  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_DOSES_PER_DAY ||
    parsed > MAX_DOSES_PER_DAY
  ) {
    return `${label} must be a whole number from ${MIN_DOSES_PER_DAY} to ${MAX_DOSES_PER_DAY}.`;
  }
  return parsed;
}

function parseDurationDays(raw: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return "Loading duration is required.";
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return "Loading duration must be a whole number of days.";
  }
  if (parsed > MAX_LOADING_DURATION_DAYS) {
    return `Loading duration must be ${MAX_LOADING_DURATION_DAYS} days or fewer.`;
  }
  return parsed;
}

function findLoadingPhase(protocol: SupplementProtocol): SupplementPhase | undefined {
  return protocol.phases.find((phase) => phase.kind === "loading");
}

function findMaintenancePhase(protocol: SupplementProtocol): SupplementPhase | undefined {
  const loading = findLoadingPhase(protocol);
  const maintenance = [...protocol.phases]
    .reverse()
    .find((phase) => phase.kind === "maintenance");
  if (maintenance) return maintenance;
  return protocol.phases.find((phase) => phase.id !== loading?.id) ?? protocol.phases[0];
}

export function supplementProtocolFormFromProtocol(
  protocol: SupplementProtocol
): SupplementProtocolFormState {
  const loading = findLoadingPhase(protocol);
  const maintenance = findMaintenancePhase(protocol);
  const startDate = loading?.startDate ?? maintenance?.startDate ?? "";
  const duration =
    loading?.endDate !== undefined
      ? durationDaysFromRange(loading.startDate, loading.endDate)
      : undefined;

  return {
    name: protocol.name,
    form: protocol.form ?? "",
    unit: protocol.unit,
    notes: protocol.notes ?? "",
    active: protocol.active,
    startDate,
    maintenanceAmount:
      maintenance !== undefined ? String(maintenance.amountPerDose) : "",
    maintenanceDosesPerDay:
      maintenance !== undefined ? String(maintenance.dosesPerDay) : "1",
    maintenancePhaseId: maintenance?.id ?? "",
    includeLoading: Boolean(loading),
    loadingDurationDays: duration !== undefined ? String(duration) : "7",
    loadingAmount: loading !== undefined ? String(loading.amountPerDose) : "",
    loadingDosesPerDay: loading !== undefined ? String(loading.dosesPerDay) : "4",
    loadingPhaseId: loading?.id ?? "",
  };
}

export function validateSupplementProtocolForm(
  form: SupplementProtocolFormState
): string | null {
  if (!form.name.trim()) return "Protocol name is required.";
  if (!isIsoDate(form.startDate.trim())) {
    return "Start date is required (YYYY-MM-DD).";
  }
  if (!SUPPLEMENT_UNIT_VALUES.includes(form.unit)) return "Invalid unit.";
  if (form.form && !SUPPLEMENT_FORM_VALUES.includes(form.form)) {
    return "Invalid form.";
  }

  const maintenanceAmount = parsePositiveAmount(
    form.maintenanceAmount,
    "Maintenance amount"
  );
  if (typeof maintenanceAmount === "string") return maintenanceAmount;
  const maintenanceDoses = parseDosesPerDay(
    form.maintenanceDosesPerDay,
    "Maintenance doses per day"
  );
  if (typeof maintenanceDoses === "string") return maintenanceDoses;

  if (!form.includeLoading) return null;

  const duration = parseDurationDays(form.loadingDurationDays);
  if (typeof duration === "string") return duration;
  if (!resolveLoadingEndDate(form.startDate.trim(), duration)) {
    return "Could not resolve the loading end date.";
  }

  const loadingAmount = parsePositiveAmount(form.loadingAmount, "Loading amount");
  if (typeof loadingAmount === "string") return loadingAmount;
  const loadingDoses = parseDosesPerDay(
    form.loadingDosesPerDay,
    "Loading doses per day"
  );
  if (typeof loadingDoses === "string") return loadingDoses;

  return null;
}

function phaseId(existing: string): string {
  return existing.trim() || crypto.randomUUID();
}

export function supplementProtocolPayloadFromForm(
  form: SupplementProtocolFormState
): Omit<SupplementProtocol, "id" | "createdAtIso" | "updatedAtIso"> {
  const startDate = form.startDate.trim();
  const phases: SupplementPhase[] = [];

  if (form.includeLoading) {
    const duration = Number(form.loadingDurationDays.trim());
    const endDate = resolveLoadingEndDate(startDate, duration)!;
    const loading: SupplementPhase = {
      id: phaseId(form.loadingPhaseId),
      kind: "loading",
      startDate,
      endDate,
      dosesPerDay: Number(form.loadingDosesPerDay.trim()),
      amountPerDose: Number(form.loadingAmount.trim()),
    };
    phases.push(loading);

    const maintenanceStart = addDaysToDateKey(endDate, 1) ?? endDate;
    phases.push({
      id: phaseId(form.maintenancePhaseId),
      kind: "maintenance",
      startDate: maintenanceStart,
      dosesPerDay: Number(form.maintenanceDosesPerDay.trim()),
      amountPerDose: Number(form.maintenanceAmount.trim()),
    });
  } else {
    phases.push({
      id: phaseId(form.maintenancePhaseId),
      kind: "maintenance",
      startDate,
      dosesPerDay: Number(form.maintenanceDosesPerDay.trim()),
      amountPerDose: Number(form.maintenanceAmount.trim()),
    });
  }

  const payload: Omit<SupplementProtocol, "id" | "createdAtIso" | "updatedAtIso"> = {
    name: form.name.trim(),
    unit: form.unit,
    active: form.active,
    phases,
  };
  if (form.form) payload.form = form.form;
  if (form.notes.trim()) payload.notes = form.notes.trim();
  return payload;
}
