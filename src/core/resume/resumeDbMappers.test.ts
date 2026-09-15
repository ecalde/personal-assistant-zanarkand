import { describe, expect, it } from "vitest";
import type { AppPayload } from "../model";
import { MapperError } from "../dbMappers";
import {
  assertActiveVersionBelongsToResume,
  assertResumeOwnerStoragePath,
  buildResumeOriginalStoragePath,
  buildResumeWorkingStoragePath,
  parseExtractedStructure,
  parseImportFactLedger,
  parseResumeRow,
  parseResumeVersionRow,
  parseResumeWithActiveVersion,
  resumeToRow,
  resumeVersionToRow,
} from "./resumeDbMappers";
import { RESUME_SOURCE_KINDS, type Resume, type ResumeVersion } from "./resumeModel";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "21111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RESUME_ID = "32222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const SHA256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CREATED = "2026-09-15T00:00:00.000Z";

type AppPayloadHasResumeKey = "resumes" extends keyof AppPayload ? true : false;
const _appPayloadHasNoResumeKey: AppPayloadHasResumeKey extends true ? never : true = true;
void _appPayloadHasNoResumeKey;

function sampleResumeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RESUME_ID,
    user_id: USER_ID,
    name: "Base",
    source_filename: "resume.docx",
    is_default: false,
    active_version_id: VERSION_ID,
    import_fact_ledger: { facts: [] },
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  };
}

function sampleVersionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VERSION_ID,
    user_id: USER_ID,
    resume_id: RESUME_ID,
    parent_version_id: null,
    version_n: 1,
    label: "Base",
    source_kind: "upload",
    original_storage_path: `${USER_ID}/${RESUME_ID}/original/${SHA256}.docx`,
    working_storage_path: `${USER_ID}/${RESUME_ID}/versions/${VERSION_ID}.docx`,
    sha256: SHA256,
    extracted_structure: { mentionIndex: [] },
    page_count_estimated: null,
    created_at: CREATED,
    ...overrides,
  };
}

describe("resume storage path builder", () => {
  it("emits canonical owner-prefixed paths and never includes ..", () => {
    const original = buildResumeOriginalStoragePath(USER_ID, RESUME_ID, SHA256);
    const working = buildResumeWorkingStoragePath(USER_ID, RESUME_ID, VERSION_ID);

    expect(original).toBe(`${USER_ID}/${RESUME_ID}/original/${SHA256}.docx`);
    expect(working).toBe(`${USER_ID}/${RESUME_ID}/versions/${VERSION_ID}.docx`);
    expect(original.startsWith(`${USER_ID}/`)).toBe(true);
    expect(working.startsWith(`${USER_ID}/`)).toBe(true);
    expect(original.includes("..")).toBe(false);
    expect(working.includes("..")).toBe(false);
    expect(original.includes("\\")).toBe(false);
  });

  it("rejects traversal and non-owner inputs before joining", () => {
    const traversalAttempts: Array<Parameters<typeof buildResumeOriginalStoragePath>> = [
      [`../${USER_ID}`, RESUME_ID, SHA256],
      [USER_ID, `../${RESUME_ID}`, SHA256],
      [USER_ID, RESUME_ID, `../${SHA256}`],
      [USER_ID, RESUME_ID, `aa/../${"b".repeat(58)}`],
      [`${USER_ID}/../${USER_ID}`, RESUME_ID, SHA256],
      ["", RESUME_ID, SHA256],
      [USER_ID, "", SHA256],
      [USER_ID, RESUME_ID, ""],
      [USER_ID, RESUME_ID, "../etc/passwd"],
      [USER_ID, RESUME_ID, "..\\".padEnd(64, "a")],
    ];

    for (const args of traversalAttempts) {
      expect(() => buildResumeOriginalStoragePath(...args)).toThrow(MapperError);
    }

    expect(() => buildResumeWorkingStoragePath(`../${USER_ID}`, RESUME_ID, VERSION_ID)).toThrow(
      MapperError
    );
    expect(() => buildResumeWorkingStoragePath(USER_ID, RESUME_ID, `../${VERSION_ID}`)).toThrow(
      MapperError
    );
    expect(() =>
      assertResumeOwnerStoragePath(`${OTHER_USER_ID}/${RESUME_ID}/original/${SHA256}.docx`, USER_ID)
    ).toThrow(MapperError);
    expect(() =>
      assertResumeOwnerStoragePath(`${USER_ID}/../${RESUME_ID}/original/${SHA256}.docx`, USER_ID)
    ).toThrow(MapperError);
  });
});

describe("parseResumeRow", () => {
  it("accepts a valid resume row with an empty frozen ledger", () => {
    const resume = parseResumeRow(sampleResumeRow());
    expect(resume.id).toBe(RESUME_ID);
    expect(resume.userId).toBe(USER_ID);
    expect(resume.importFactLedger).toEqual({ facts: [] });
    expect(resume.activeVersionId).toBe(VERSION_ID);
  });

  it("rejects unknown keys and invalid uuids", () => {
    expect(() => parseResumeRow(sampleResumeRow({ extra: true }))).toThrow(MapperError);
    expect(() => parseResumeRow(sampleResumeRow({ id: "not-a-uuid" }))).toThrow(MapperError);
    expect(() => parseResumeRow(sampleResumeRow({ user_id: "bad" }))).toThrow(MapperError);
    expect(() => parseResumeRow(sampleResumeRow({ active_version_id: "nope" }))).toThrow(
      MapperError
    );
    expect(() => parseResumeRow(null)).toThrow(MapperError);
    expect(() => parseResumeRow(sampleResumeRow({ name: "  " }))).toThrow(MapperError);
    expect(() =>
      parseResumeRow(sampleResumeRow({ import_fact_ledger: { facts: [], leaked: 1 } }))
    ).toThrow(MapperError);
  });

  it("round-trips through resumeToRow without adding AppPayload keys", () => {
    const resume = parseResumeRow(sampleResumeRow({ active_version_id: null }));
    const row = resumeToRow(resume);
    expect(parseResumeRow(row)).toEqual(resume);
  });
});

describe("parseExtractedStructure", () => {
  it("round-trips the minimal extracted_structure fixture (empty mention index)", () => {
    const minimal = { mentionIndex: [] as const };
    expect(parseExtractedStructure(minimal)).toEqual({ mentionIndex: [] });

    const version = parseResumeVersionRow(sampleVersionRow({ extracted_structure: minimal }));
    const row = resumeVersionToRow(version);
    expect(row.extracted_structure).toEqual(minimal);
    expect(parseResumeVersionRow(row).extractedStructure).toEqual({ mentionIndex: [] });
  });

  it("round-trips mention index entries and an optional graph snapshot", () => {
    const extractedStructure = {
      mentionIndex: [
        {
          normalized: "typescript",
          type: "technology",
          blockId: "pa_block_1",
          verbatim: "TypeScript",
        },
      ],
      graph: { blocks: [{ id: "pa_block_1", type: "paragraph" }] },
    };

    expect(parseExtractedStructure(extractedStructure)).toEqual(extractedStructure);

    const version = parseResumeVersionRow(
      sampleVersionRow({ extracted_structure: extractedStructure })
    );
    const row = resumeVersionToRow(version);
    expect(row.extracted_structure).toEqual(extractedStructure);
    expect(parseResumeVersionRow(row).extractedStructure).toEqual(extractedStructure);
  });

  it("rejects unknown keys and invalid mention index entries", () => {
    expect(() => parseExtractedStructure(null)).toThrow(MapperError);
    expect(() => parseExtractedStructure({ mentionIndex: [], extra: true })).toThrow(MapperError);
    expect(() => parseExtractedStructure({ mentionIndex: "not-array" })).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({
        mentionIndex: [{ normalized: "", type: "technology", blockId: "b1", verbatim: "x" }],
      })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({
        mentionIndex: [{ normalized: "x", type: "not_a_fact", blockId: "b1", verbatim: "x" }],
      })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({
        mentionIndex: [{ normalized: "x", type: "technology", blockId: "../b1", verbatim: "x" }],
      })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({
        mentionIndex: [{ normalized: "x", type: "technology", blockId: "b1", leaked: true }],
      })
    ).toThrow(MapperError);
  });
});

describe("parseImportFactLedger", () => {
  it("round-trips a frozen import ledger through resumeToRow", () => {
    const ledger = {
      facts: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          type: "technology",
          verbatim: "TypeScript",
          normalized: "typescript",
          sourceBlockIds: ["pa_block_1"],
          provenance: "imported_source",
          inheritedFromFactIds: [],
          presentInWorkingDocument: true,
          firstSeenVersionId: VERSION_ID,
        },
      ],
    };

    expect(parseImportFactLedger(ledger)).toEqual(ledger);

    const resume = parseResumeRow(sampleResumeRow({ import_fact_ledger: ledger }));
    const row = resumeToRow(resume);
    expect(row.import_fact_ledger).toEqual(ledger);
    expect(parseResumeRow(row).importFactLedger).toEqual(ledger);
  });
});

describe("parseResumeVersionRow", () => {
  it("accepts a canonical version row and rejects a non-owner path", () => {
    const version = parseResumeVersionRow(sampleVersionRow());
    expect(version.originalStoragePath.startsWith(`${USER_ID}/`)).toBe(true);
    expect(version.workingStoragePath.includes("..")).toBe(false);

    expect(() =>
      parseResumeVersionRow(
        sampleVersionRow({
          original_storage_path: `${OTHER_USER_ID}/${RESUME_ID}/original/${SHA256}.docx`,
        })
      )
    ).toThrow(MapperError);
    expect(() => parseResumeVersionRow(sampleVersionRow({ extra: 1 }))).toThrow(MapperError);
    expect(() => parseResumeVersionRow(sampleVersionRow({ id: "bad" }))).toThrow(MapperError);
  });

  it("accepts each allowlisted source_kind and round-trips through resumeVersionToRow", () => {
    for (const sourceKind of RESUME_SOURCE_KINDS) {
      const version = parseResumeVersionRow(sampleVersionRow({ source_kind: sourceKind }));
      expect(version.sourceKind).toBe(sourceKind);
      expect(parseResumeVersionRow(resumeVersionToRow(version))).toEqual(version);
    }
  });

  it("throws MapperError for invalid source_kind values", () => {
    for (const sourceKind of ["clone", "Upload", "", "import", null, 1]) {
      expect(() => parseResumeVersionRow(sampleVersionRow({ source_kind: sourceKind }))).toThrow(
        MapperError
      );
    }
  });
});

describe("active version membership", () => {
  it("rejects an active_version_id that belongs to a different resume", () => {
    const resume: Resume = parseResumeRow(sampleResumeRow());
    const version: ResumeVersion = parseResumeVersionRow(
      sampleVersionRow({
        resume_id: OTHER_RESUME_ID,
        original_storage_path: `${USER_ID}/${OTHER_RESUME_ID}/original/${SHA256}.docx`,
        working_storage_path: `${USER_ID}/${OTHER_RESUME_ID}/versions/${VERSION_ID}.docx`,
      })
    );

    expect(() => assertActiveVersionBelongsToResume(resume, version)).toThrow(MapperError);
    expect(() => parseResumeWithActiveVersion(sampleResumeRow(), sampleVersionRow({
      resume_id: OTHER_RESUME_ID,
      original_storage_path: `${USER_ID}/${OTHER_RESUME_ID}/original/${SHA256}.docx`,
      working_storage_path: `${USER_ID}/${OTHER_RESUME_ID}/versions/${VERSION_ID}.docx`,
    }))).toThrow(MapperError);
  });

  it("accepts matching resume and version rows", () => {
    const parsed = parseResumeWithActiveVersion(sampleResumeRow(), sampleVersionRow());
    expect(parsed.resume.activeVersionId).toBe(parsed.activeVersion.id);
    expect(parsed.activeVersion.resumeId).toBe(parsed.resume.id);
  });
});
