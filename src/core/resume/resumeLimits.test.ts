import { describe, expect, it } from "vitest";
import { MapperError } from "../dbMappers";
import {
  RESUME_JOB_DESCRIPTION_MAX_CHARS,
  assertResumeOwnerStoragePath,
  buildResumeOriginalStoragePath,
  buildResumeWorkingStoragePath,
  parseResumeJobSessionRow,
  resumeJobSessionToRow,
} from "./resumeDbMappers";
import { RESUME_UPLOAD_ERRORS, RESUME_UPLOAD_MAX_BYTES } from "./resumeFileValidation";
import { planJobSessionPersist } from "./resumeJobSessionPersist";
import { parseJobDescription } from "./resumeJobParse";
import {
  ResumeJobDescriptionTooLongError,
  assertResumeJobDescriptionWithinCap,
  isCanonicalResumeDocsObjectName,
  mayStartResumeSuggestionGenerate,
  resumeJobDescriptionExceedsCap,
  resumeUploadExceedsCompressedCap,
  resumeUploadTooLargeMessage,
} from "./resumeLimits";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const SHA256 = "a".repeat(64);
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const CREATED = "2026-09-17T00:00:00.000Z";

describe("JD 100k cap (Phase 10A)", () => {
  it("treats the school-ingest-sized cap as exclusive of the extra character", () => {
    expect(RESUME_JOB_DESCRIPTION_MAX_CHARS).toBe(100_000);
    expect(resumeJobDescriptionExceedsCap("x".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS))).toBe(
      false
    );
    expect(resumeJobDescriptionExceedsCap("x".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS + 1))).toBe(
      true
    );
  });

  it("rejects oversized JD at the persist planner, mapper, and parser", () => {
    const oversize = "x".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS + 1);
    expect(
      planJobSessionPersist({
        draft: {
          company: "",
          jobTitle: "",
          jobDescriptionText: oversize,
          applicationId: null,
        },
        lastPersisted: null,
        activeSessionId: null,
      })
    ).toEqual({ action: "too_long" });

    expect(() =>
      parseResumeJobSessionRow({
        id: SESSION_ID,
        user_id: USER_ID,
        resume_id: RESUME_ID,
        resume_version_id: VERSION_ID,
        company: "",
        job_title: "",
        job_description_text: oversize,
        parsed_job: null,
        match_result: null,
        retention: "until_replaced",
        application_id: null,
        archived_at: null,
        created_at: CREATED,
        updated_at: CREATED,
      })
    ).toThrow(MapperError);

    expect(() => parseJobDescription(oversize)).toThrow(ResumeJobDescriptionTooLongError);
    expect(() => assertResumeJobDescriptionWithinCap(oversize)).toThrow(
      ResumeJobDescriptionTooLongError
    );
  });

  it("accepts a JD at the cap and round-trips it through the session mapper", () => {
    const atCap = "y".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS);
    expect(() => assertResumeJobDescriptionWithinCap(atCap)).not.toThrow();
    const session = parseResumeJobSessionRow({
      id: SESSION_ID,
      user_id: USER_ID,
      resume_id: RESUME_ID,
      resume_version_id: VERSION_ID,
      company: "",
      job_title: "",
      job_description_text: atCap,
      parsed_job: null,
      match_result: null,
      retention: "until_replaced",
      application_id: null,
      archived_at: null,
      created_at: CREATED,
      updated_at: CREATED,
    });
    expect(session.jobDescriptionText.length).toBe(RESUME_JOB_DESCRIPTION_MAX_CHARS);
    expect(parseResumeJobSessionRow(resumeJobSessionToRow(session)).jobDescriptionText).toBe(atCap);
  });
});

describe("upload compressed cap (Phase 10A)", () => {
  it("rejects buffers larger than the 8 MB Storage limit", () => {
    expect(resumeUploadExceedsCompressedCap(RESUME_UPLOAD_MAX_BYTES)).toBe(false);
    expect(resumeUploadExceedsCompressedCap(RESUME_UPLOAD_MAX_BYTES + 1)).toBe(true);
    expect(resumeUploadTooLargeMessage(RESUME_UPLOAD_MAX_BYTES + 1)).toBe(
      RESUME_UPLOAD_ERRORS.tooLarge
    );
    expect(resumeUploadTooLargeMessage(1024)).toBeNull();
  });
});

describe("canonical resume-docs object names (Phase 10A SQL dual-check)", () => {
  it("accepts builder paths that the Storage policy regex allows", () => {
    const original = buildResumeOriginalStoragePath(USER_ID, RESUME_ID, SHA256);
    const working = buildResumeWorkingStoragePath(USER_ID, RESUME_ID, VERSION_ID);
    expect(isCanonicalResumeDocsObjectName(original)).toBe(true);
    expect(isCanonicalResumeDocsObjectName(working)).toBe(true);
    expect(() => assertResumeOwnerStoragePath(original, USER_ID)).not.toThrow();
    expect(() => assertResumeOwnerStoragePath(working, USER_ID)).not.toThrow();
  });

  it("rejects traversal and extra segments even when the first folder is the uid", () => {
    const traversal = `${USER_ID}/../${RESUME_ID}/original/${SHA256}.docx`;
    expect(isCanonicalResumeDocsObjectName(traversal)).toBe(false);
    expect(() => assertResumeOwnerStoragePath(traversal, USER_ID)).toThrow(MapperError);

    const extra = `${USER_ID}/${RESUME_ID}/original/extra/${SHA256}.docx`;
    expect(isCanonicalResumeDocsObjectName(extra)).toBe(false);

    const otherUser = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${RESUME_ID}/original/${SHA256}.docx`;
    expect(isCanonicalResumeDocsObjectName(otherUser)).toBe(true);
    expect(() => assertResumeOwnerStoragePath(otherUser, USER_ID)).toThrow(MapperError);
  });
});

describe("suggestion generate spam guard (Phase 10A)", () => {
  it("refuses a second Generate while one run is already in flight", () => {
    expect(mayStartResumeSuggestionGenerate(false)).toBe(true);
    expect(mayStartResumeSuggestionGenerate(true)).toBe(false);
  });
});
