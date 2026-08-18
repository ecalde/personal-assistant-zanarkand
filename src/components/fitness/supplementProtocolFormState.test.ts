import { describe, expect, it } from "vitest";
import type { SupplementPhase, SupplementProtocol } from "../../core/model";
import {
  emptySupplementProtocolFormState,
  supplementProtocolFormFromProtocol,
  supplementProtocolPayloadFromForm,
  validateSupplementProtocolForm,
  type SupplementProtocolFormState,
} from "./supplementProtocolFormState";

const TODAY = "2026-08-18";
const LOADING_ID = "33333333-3333-4333-8333-333333333333";
const MAINT_ID = "44444444-4444-4444-8444-444444444444";
const PROTOCOL_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-08-18T12:00:00.000Z";

function creatineForm(
  overrides: Partial<SupplementProtocolFormState> = {}
): SupplementProtocolFormState {
  return {
    ...emptySupplementProtocolFormState(TODAY),
    name: "Creatine",
    unit: "g",
    form: "powder",
    includeLoading: true,
    loadingDurationDays: "7",
    loadingAmount: "5",
    loadingDosesPerDay: "4",
    loadingPhaseId: LOADING_ID,
    maintenanceAmount: "5",
    maintenanceDosesPerDay: "1",
    maintenancePhaseId: MAINT_ID,
    ...overrides,
  };
}

function creatineProtocol(): SupplementProtocol {
  const loading: SupplementPhase = {
    id: LOADING_ID,
    kind: "loading",
    startDate: TODAY,
    endDate: "2026-08-24",
    dosesPerDay: 4,
    amountPerDose: 5,
  };
  const maintenance: SupplementPhase = {
    id: MAINT_ID,
    kind: "maintenance",
    startDate: "2026-08-25",
    dosesPerDay: 1,
    amountPerDose: 5,
  };
  return {
    id: PROTOCOL_ID,
    name: "Creatine",
    form: "powder",
    unit: "g",
    active: true,
    phases: [loading, maintenance],
    createdAtIso: NOW,
    updatedAtIso: NOW,
  };
}

describe("validateSupplementProtocolForm", () => {
  it("accepts creatine loading then maintenance", () => {
    expect(validateSupplementProtocolForm(creatineForm())).toBeNull();
  });

  it("requires a name, start date, and positive amounts", () => {
    expect(validateSupplementProtocolForm(creatineForm({ name: "  " }))).toBe(
      "Protocol name is required."
    );
    expect(validateSupplementProtocolForm(creatineForm({ startDate: "" }))).toBe(
      "Start date is required (YYYY-MM-DD)."
    );
    expect(
      validateSupplementProtocolForm(creatineForm({ maintenanceAmount: "0" }))
    ).toBe("Maintenance amount must be greater than zero.");
    expect(
      validateSupplementProtocolForm(creatineForm({ loadingDosesPerDay: "8" }))
    ).toBe("Loading doses per day must be a whole number from 1 to 6.");
  });

  it("skips loading fields when the loading block is off", () => {
    expect(
      validateSupplementProtocolForm(
        creatineForm({
          includeLoading: false,
          loadingAmount: "",
          loadingDosesPerDay: "",
          maintenanceAmount: "5",
        })
      )
    ).toBeNull();
  });
});

describe("supplementProtocolPayloadFromForm", () => {
  it("resolves a 7-day loading window and open-ended maintenance", () => {
    const payload = supplementProtocolPayloadFromForm(creatineForm());
    expect(payload.name).toBe("Creatine");
    expect(payload.form).toBe("powder");
    expect(payload.phases).toHaveLength(2);
    expect(payload.phases[0]).toMatchObject({
      id: LOADING_ID,
      kind: "loading",
      startDate: TODAY,
      endDate: "2026-08-24",
      dosesPerDay: 4,
      amountPerDose: 5,
    });
    expect(payload.phases[1]).toMatchObject({
      id: MAINT_ID,
      kind: "maintenance",
      startDate: "2026-08-25",
      dosesPerDay: 1,
      amountPerDose: 5,
    });
    expect(payload.phases[1]?.endDate).toBeUndefined();
  });

  it("saves a maintenance-only protocol from the start date", () => {
    const payload = supplementProtocolPayloadFromForm(
      creatineForm({ includeLoading: false })
    );
    expect(payload.phases).toHaveLength(1);
    expect(payload.phases[0]).toMatchObject({
      kind: "maintenance",
      startDate: TODAY,
      dosesPerDay: 1,
      amountPerDose: 5,
    });
  });
});

describe("supplementProtocolFormFromProtocol", () => {
  it("round-trips creatine loading duration as 7 days", () => {
    const form = supplementProtocolFormFromProtocol(creatineProtocol());
    expect(form).toMatchObject({
      name: "Creatine",
      form: "powder",
      unit: "g",
      includeLoading: true,
      startDate: TODAY,
      loadingDurationDays: "7",
      loadingAmount: "5",
      loadingDosesPerDay: "4",
      loadingPhaseId: LOADING_ID,
      maintenanceAmount: "5",
      maintenanceDosesPerDay: "1",
      maintenancePhaseId: MAINT_ID,
    });
    expect(validateSupplementProtocolForm(form)).toBeNull();
    expect(supplementProtocolPayloadFromForm(form).phases).toEqual(
      creatineProtocol().phases
    );
  });

  it("maps a single maintenance phase without loading", () => {
    const protocol = creatineProtocol();
    protocol.phases = [
      {
        id: MAINT_ID,
        kind: "maintenance",
        startDate: TODAY,
        dosesPerDay: 1,
        amountPerDose: 5,
      },
    ];
    const form = supplementProtocolFormFromProtocol(protocol);
    expect(form.includeLoading).toBe(false);
    expect(form.startDate).toBe(TODAY);
    expect(form.maintenanceDosesPerDay).toBe("1");
  });
});
