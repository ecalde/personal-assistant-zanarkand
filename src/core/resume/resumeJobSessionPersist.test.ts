import { describe, expect, it } from "vitest";
import { RESUME_JOB_DESCRIPTION_MAX_CHARS } from "./resumeDbMappers";
import type { ResumeJobSession } from "./resumeModel";
import {
  EMPTY_JOB_SESSION_DRAFT,
  RESUME_JD_AUTOSAVE_DEBOUNCE_MS,
  draftFromJobSession,
  draftsEqual,
  isJobSessionDraftEmpty,
  jobSessionWriteFields,
  planJobSessionPersist,
  planJobSessionReplace,
  planJobSessionReset,
} from "./resumeJobSessionPersist";

const SESSION_ID = "55555555-5555-4555-8555-555555555555";

const SAMPLE_SESSION: ResumeJobSession = {
  id: SESSION_ID,
  userId: "11111111-1111-4111-8111-111111111111",
  resumeId: "22222222-2222-4222-8222-222222222222",
  resumeVersionId: "33333333-3333-4333-8333-333333333333",
  company: "Acme",
  jobTitle: "Engineer",
  jobDescriptionText: "Must have Kubernetes.",
  parsedJob: null,
  matchResult: null,
  retention: "until_replaced",
  applicationId: null,
  archivedAtIso: null,
  createdAtIso: "2026-09-15T00:00:00.000Z",
  updatedAtIso: "2026-09-15T00:00:00.000Z",
};

describe("RESUME_JD_AUTOSAVE_DEBOUNCE_MS", () => {
  it("matches architecture §36 (500 ms)", () => {
    expect(RESUME_JD_AUTOSAVE_DEBOUNCE_MS).toBe(500);
  });
});

describe("jobSessionWriteFields", () => {
  it("emits only company, title, and raw text — never parsedJob or matchResult", () => {
    const fields = jobSessionWriteFields({
      company: "Acme",
      jobTitle: "Engineer",
      jobDescriptionText: "Must have Kubernetes.",
    });
    expect(Object.keys(fields).sort()).toEqual(["company", "jobDescriptionText", "jobTitle"]);
    expect(fields).not.toHaveProperty("parsedJob");
    expect(fields).not.toHaveProperty("matchResult");
  });
});

describe("draftFromJobSession / draftsEqual / isJobSessionDraftEmpty", () => {
  it("copies text fields from a session and treats whitespace-only as empty", () => {
    expect(draftFromJobSession(SAMPLE_SESSION)).toEqual({
      company: "Acme",
      jobTitle: "Engineer",
      jobDescriptionText: "Must have Kubernetes.",
    });
    expect(draftsEqual(EMPTY_JOB_SESSION_DRAFT, EMPTY_JOB_SESSION_DRAFT)).toBe(true);
    expect(isJobSessionDraftEmpty(EMPTY_JOB_SESSION_DRAFT)).toBe(true);
    expect(isJobSessionDraftEmpty({ company: "  ", jobTitle: "\n", jobDescriptionText: "" })).toBe(
      true
    );
    expect(
      isJobSessionDraftEmpty({ company: "", jobTitle: "", jobDescriptionText: "Hello" })
    ).toBe(false);
  });
});

describe("planJobSessionPersist", () => {
  it("inserts a non-empty draft when there is no active session", () => {
    const draft = { company: "Acme", jobTitle: "", jobDescriptionText: "Paste me" };
    expect(
      planJobSessionPersist({ draft, lastPersisted: null, activeSessionId: null })
    ).toEqual({ action: "insert", draft });
  });

  it("does not insert an empty draft (no idle empty rows)", () => {
    expect(
      planJobSessionPersist({
        draft: EMPTY_JOB_SESSION_DRAFT,
        lastPersisted: null,
        activeSessionId: null,
      })
    ).toEqual({ action: "skip" });
  });

  it("updates the active session, including a user-cleared draft", () => {
    expect(
      planJobSessionPersist({
        draft: EMPTY_JOB_SESSION_DRAFT,
        lastPersisted: { company: "Acme", jobTitle: "Eng", jobDescriptionText: "Old" },
        activeSessionId: SESSION_ID,
      })
    ).toEqual({
      action: "update",
      sessionId: SESSION_ID,
      draft: EMPTY_JOB_SESSION_DRAFT,
    });
  });

  it("skips when the draft already matches the last persisted snapshot", () => {
    const draft = draftFromJobSession(SAMPLE_SESSION);
    expect(
      planJobSessionPersist({
        draft,
        lastPersisted: draft,
        activeSessionId: SESSION_ID,
      })
    ).toEqual({ action: "skip" });
  });

  it("rejects JD text over the school-ingest cap", () => {
    const draft = {
      company: "",
      jobTitle: "",
      jobDescriptionText: "x".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS + 1),
    };
    expect(
      planJobSessionPersist({ draft, lastPersisted: null, activeSessionId: null })
    ).toEqual({ action: "too_long" });
  });
});

describe("planJobSessionReset / planJobSessionReplace", () => {
  it("reset archives an active session and otherwise only clears local state", () => {
    expect(planJobSessionReset(SESSION_ID)).toEqual({ action: "archive", sessionId: SESSION_ID });
    expect(planJobSessionReset(null)).toEqual({ action: "clear_local" });
  });

  it("replace archives then inserts an empty session; noop with no active row", () => {
    expect(planJobSessionReplace(SESSION_ID)).toEqual({
      action: "archive_then_insert_empty",
      sessionId: SESSION_ID,
    });
    expect(planJobSessionReplace(null)).toEqual({ action: "noop" });
  });
});

describe("replace does not parse or rewrite the document (5F)", () => {
  it("replace plan never includes parsedJob, matchResult, or document bytes", () => {
    const plan = planJobSessionReplace(SESSION_ID);
    expect(plan).toEqual({
      action: "archive_then_insert_empty",
      sessionId: SESSION_ID,
    });
    expect(plan).not.toHaveProperty("parsedJob");
    expect(plan).not.toHaveProperty("documentBytes");
  });
});
