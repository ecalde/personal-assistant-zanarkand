import { describe, expect, it } from "vitest";
import type { Resume } from "./resumeModel";
import {
  applyDefaultResumeSelection,
  duplicateResumeName,
  normalizeResumeName,
  removeResumeById,
  renameResumeInList,
  RESUME_COPY_SUFFIX,
  RESUME_NAME_MAX_LENGTH,
  validateResumeName,
} from "./resumeLibrary";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function sampleResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: USER_ID,
    name: "Base",
    sourceFilename: "resume.docx",
    isDefault: false,
    activeVersionId: null,
    importFactLedger: { facts: [] },
    createdAtIso: "2026-09-15T00:00:00.000Z",
    updatedAtIso: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeResumeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeResumeName("  Senior   Engineer  ")).toBe("Senior Engineer");
  });

  it("normalizes newlines and tabs", () => {
    expect(normalizeResumeName("Front\tEnd\nDev")).toBe("Front End Dev");
  });
});

describe("validateResumeName", () => {
  it("accepts a normal name", () => {
    expect(validateResumeName("Backend Resume")).toBeNull();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateResumeName("")).not.toBeNull();
    expect(validateResumeName("   ")).not.toBeNull();
  });

  it("rejects a name longer than the cap after normalization", () => {
    const tooLong = "a".repeat(RESUME_NAME_MAX_LENGTH + 1);
    expect(validateResumeName(tooLong)).not.toBeNull();
  });

  it("accepts a name at exactly the cap", () => {
    const atCap = "a".repeat(RESUME_NAME_MAX_LENGTH);
    expect(validateResumeName(atCap)).toBeNull();
  });
});

describe("applyDefaultResumeSelection", () => {
  const a = sampleResume({ id: "a1111111-1111-4111-8111-111111111111", isDefault: true });
  const b = sampleResume({ id: "b1111111-1111-4111-8111-111111111111", isDefault: false });
  const c = sampleResume({ id: "c1111111-1111-4111-8111-111111111111", isDefault: false });

  it("sets exactly one default and unsets the previous one", () => {
    const next = applyDefaultResumeSelection([a, b, c], b.id);
    expect(next.filter((r) => r.isDefault).map((r) => r.id)).toEqual([b.id]);
  });

  it("never leaves more than one default", () => {
    const twoDefaults = [
      sampleResume({ id: "d1111111-1111-4111-8111-111111111111", isDefault: true }),
      sampleResume({ id: "e1111111-1111-4111-8111-111111111111", isDefault: true }),
    ];
    const next = applyDefaultResumeSelection(twoDefaults, twoDefaults[1].id);
    expect(next.filter((r) => r.isDefault)).toHaveLength(1);
    expect(next[1].isDefault).toBe(true);
  });

  it("clears all defaults when the target id is absent", () => {
    const next = applyDefaultResumeSelection([a, b], "f1111111-1111-4111-8111-111111111111");
    expect(next.some((r) => r.isDefault)).toBe(false);
  });

  it("returns the same object reference for unchanged rows", () => {
    const next = applyDefaultResumeSelection([a, b], a.id);
    // a was already default and stays default; b was already non-default and stays.
    expect(next[0]).toBe(a);
    expect(next[1]).toBe(b);
  });
});

describe("removeResumeById", () => {
  it("removes only the matching resume", () => {
    const a = sampleResume({ id: "a1111111-1111-4111-8111-111111111111" });
    const b = sampleResume({ id: "b1111111-1111-4111-8111-111111111111" });
    expect(removeResumeById([a, b], a.id)).toEqual([b]);
  });
});

describe("renameResumeInList", () => {
  it("renames only the matching resume", () => {
    const a = sampleResume({ id: "a1111111-1111-4111-8111-111111111111", name: "Old" });
    const b = sampleResume({ id: "b1111111-1111-4111-8111-111111111111", name: "Keep" });
    const next = renameResumeInList([a, b], a.id, "New");
    expect(next.map((r) => r.name)).toEqual(["New", "Keep"]);
    expect(next[1]).toBe(b);
  });
});

describe("duplicateResumeName", () => {
  it("appends the copy suffix to a normalized name", () => {
    expect(duplicateResumeName("Backend Resume")).toBe(`Backend Resume${RESUME_COPY_SUFFIX}`);
  });

  it("normalizes whitespace before appending", () => {
    expect(duplicateResumeName("  Senior   Engineer  ")).toBe(
      `Senior Engineer${RESUME_COPY_SUFFIX}`
    );
  });

  it("truncates the base so the result stays within the length cap", () => {
    const source = "a".repeat(RESUME_NAME_MAX_LENGTH);
    const result = duplicateResumeName(source);
    expect(result.length).toBeLessThanOrEqual(RESUME_NAME_MAX_LENGTH);
    expect(result.endsWith(RESUME_COPY_SUFFIX)).toBe(true);
  });

  it("always returns a name that passes validation", () => {
    const source = "b".repeat(RESUME_NAME_MAX_LENGTH + 50);
    expect(validateResumeName(duplicateResumeName(source))).toBeNull();
  });
});
