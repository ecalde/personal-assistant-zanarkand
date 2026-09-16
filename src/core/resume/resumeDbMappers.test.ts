import { describe, expect, it } from "vitest";
import type { AppPayload } from "../model";
import { MapperError } from "../dbMappers";
import {
  RESUME_JOB_DESCRIPTION_MAX_CHARS,
  assertActiveVersionBelongsToResume,
  assertJobSessionBelongsToResume,
  assertResumeOwnerStoragePath,
  buildResumeOriginalStoragePath,
  buildResumeWorkingStoragePath,
  parseExtractedStructure,
  parseImportFactLedger,
  parseMatchResult,
  parseParsedJobDescription,
  parseResumeJobSessionRow,
  parseResumeRow,
  parseResumeVersionRow,
  parseResumeWithActiveVersion,
  resumeJobSessionToRow,
  resumeToRow,
  resumeVersionToRow,
} from "./resumeDbMappers";
import { RESUME_SOURCE_KINDS, type Resume, type ResumeVersion } from "./resumeModel";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "21111111-1111-4111-8111-111111111111";
const RESUME_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RESUME_ID = "32222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const APPLICATION_ID = "66666666-6666-4666-8666-666666666666";
const SHA256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CREATED = "2026-09-15T00:00:00.000Z";
const BLOCK_ID = "44444444-4444-4444-8444-444444444444";

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

  it("round-trips the graph, block map, mention index and ATS warnings", () => {
    const extractedStructure = {
      mentionIndex: [
        {
          normalized: "typescript",
          type: "technology",
          blockId: BLOCK_ID,
          verbatim: "TypeScript",
        },
      ],
      graph: {
        blocks: [
          {
            order: 0,
            text: "Built TypeScript services",
            blockId: BLOCK_ID,
            bookmarkName: `pa_${BLOCK_ID}`,
            runs: [
              {
                text: "Built ",
                bold: false,
                italic: false,
                underline: false,
                font: "Calibri",
                sizePt: 11,
                hyperlinkRelId: null,
              },
              {
                text: "TypeScript services",
                bold: true,
                italic: false,
                underline: false,
                font: null,
                sizePt: null,
                hyperlinkRelId: "rId5",
              },
            ],
          },
        ],
      },
      blockMap: [{ blockId: BLOCK_ID, bookmarkName: `pa_${BLOCK_ID}`, order: 0 }],
      atsWarnings: [
        {
          code: "table_layout",
          severity: "warning",
          occurrences: 2,
          message: "This document uses tables for layout.",
        },
      ],
    };

    expect(parseExtractedStructure(extractedStructure)).toEqual(extractedStructure);

    const version = parseResumeVersionRow(
      sampleVersionRow({ extracted_structure: extractedStructure })
    );
    const row = resumeVersionToRow(version);
    expect(row.extracted_structure).toEqual(extractedStructure);
    expect(parseResumeVersionRow(row).extractedStructure).toEqual(extractedStructure);
  });

  it("rejects a graph that is not a block graph, including encoded document bytes", () => {
    const docxBase64 = `UEsDBBQABgAIAAAAIQA${"A".repeat(200)}`;
    expect(() => parseExtractedStructure({ mentionIndex: [], graph: docxBase64 })).toThrow(
      MapperError
    );
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], graph: { blocks: [], docx: docxBase64 } })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], graph: { blocks: "not-an-array" } })
    ).toThrow(MapperError);
    // Legacy loose shapes are no longer accepted: the graph must be typed.
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], graph: { blocks: [{ id: "b1" }] } })
    ).toThrow(MapperError);
  });

  it("rejects blocks whose identity or run text does not add up", () => {
    const run = {
      text: "Alpha",
      bold: false,
      italic: false,
      underline: false,
      font: null,
      sizePt: null,
      hyperlinkRelId: null,
    };
    const block = {
      order: 0,
      text: "Alpha",
      blockId: BLOCK_ID,
      bookmarkName: `pa_${BLOCK_ID}`,
      runs: [run],
    };
    const graphWith = (overrides: Record<string, unknown>): unknown => ({
      mentionIndex: [],
      graph: { blocks: [{ ...block, ...overrides }] },
    });

    // Paragraph text must equal the concatenated run text (no flattening drift).
    expect(() => parseExtractedStructure(graphWith({ text: "Alpha Beta" }))).toThrow(MapperError);
    // Bookmark name and block id are one identity, written together.
    expect(() => parseExtractedStructure(graphWith({ bookmarkName: "pa_other" }))).toThrow(
      MapperError
    );
    expect(() => parseExtractedStructure(graphWith({ bookmarkName: null }))).toThrow(MapperError);
    expect(() => parseExtractedStructure(graphWith({ bookmarkName: BLOCK_ID }))).toThrow(
      MapperError
    );
    expect(() => parseExtractedStructure(graphWith({ order: -1 }))).toThrow(MapperError);
    expect(() => parseExtractedStructure(graphWith({ runs: [{ ...run, bold: "yes" }] }))).toThrow(
      MapperError
    );
    expect(() => parseExtractedStructure(graphWith({ runs: [{ ...run, leaked: 1 }] }))).toThrow(
      MapperError
    );

    // A block with no stable id yet (pre-injection) is still readable.
    expect(() =>
      parseExtractedStructure(graphWith({ blockId: null, bookmarkName: null }))
    ).not.toThrow();
  });

  it("rejects a block map that is not contiguous reading order", () => {
    const entry = { blockId: BLOCK_ID, bookmarkName: `pa_${BLOCK_ID}`, order: 0 };
    expect(() => parseExtractedStructure({ mentionIndex: [], blockMap: [entry] })).not.toThrow();
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], blockMap: [{ ...entry, order: 3 }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], blockMap: [{ ...entry, bookmarkName: "x_1" }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], blockMap: [{ ...entry, blockId: null }] })
    ).toThrow(MapperError);
    expect(() => parseExtractedStructure({ mentionIndex: [], blockMap: {} })).toThrow(MapperError);
  });

  it("rejects ATS warnings outside the allowlist and any aggregate score", () => {
    const warning = {
      code: "table_layout",
      severity: "warning",
      occurrences: 1,
      message: "This document uses tables for layout.",
    };
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [warning] })
    ).not.toThrow();
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [{ ...warning, code: "made_up" }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [{ ...warning, severity: "fatal" }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [{ ...warning, occurrences: 0 }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [{ ...warning, message: " " }] })
    ).toThrow(MapperError);
    // An "ATS score" has no place on the row (ADR-014 / RES-ATS-001).
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [{ ...warning, score: 72 }] })
    ).toThrow(MapperError);
    expect(() =>
      parseExtractedStructure({ mentionIndex: [], atsWarnings: [], atsScore: 72 })
    ).toThrow(MapperError);
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
  it("allows working sha256 to differ from the original object digest", () => {
    const workingSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const version = parseResumeVersionRow(sampleVersionRow({ sha256: workingSha }));
    expect(version.sha256).toBe(workingSha);
    expect(version.originalStoragePath).toBe(
      `${USER_ID}/${RESUME_ID}/original/${SHA256}.docx`
    );
    expect(version.workingStoragePath).toBe(
      `${USER_ID}/${RESUME_ID}/versions/${VERSION_ID}.docx`
    );
  });

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

const SAMPLE_PARSED_JOB = {
  jobTitle: "Engineer",
  company: "Acme",
  location: "Remote",
  seniority: { value: "mid", basis: "explicit" as const },
  domainTags: [{ value: "platform", basis: "inferred" as const }],
  requirements: [
    {
      id: "req-1",
      text: "Must have Kubernetes",
      category: "skill" as const,
      priority: "required" as const,
      normalizedTerms: ["kubernetes"],
      aliases: ["k8s"],
      salience: 0.9,
    },
  ],
  rawText: "Must have Kubernetes",
  parserVersion: "unparsed",
};

const SAMPLE_MATCH_RESULT = {
  matcherVersion: "jd-match-1",
  requirements: [
    {
      requirementId: "req-1",
      status: "absent" as const,
      evidenceFactIds: [],
      mentionBlockIds: [],
      matchedTerm: null,
    },
  ],
  coverage: {
    requiredTotal: 1,
    requiredExplicitCount: 0,
    requiredExplicitCoverage: 0,
    preferredTotal: 0,
    preferredExplicitCount: 0,
    preferredExplicitCoverage: 0,
    semanticSupportedCount: 0,
    missingRequiredIds: ["req-1"],
    uncertainIds: [],
    onPageUnverifiedIds: [],
    contradictedIds: [],
    responsibilityTotal: 0,
    responsibilityAlignedCount: 0,
    responsibilityAlignment: 0,
  },
};

function sampleJobSessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    resume_id: RESUME_ID,
    resume_version_id: VERSION_ID,
    company: "Acme",
    job_title: "Engineer",
    job_description_text: "Build APIs",
    parsed_job: null,
    match_result: null,
    retention: "until_replaced",
    application_id: null,
    archived_at: null,
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  };
}

describe("parseResumeJobSessionRow", () => {
  it("accepts an active session and round-trips through resumeJobSessionToRow", () => {
    const session = parseResumeJobSessionRow(sampleJobSessionRow());
    expect(session.jobDescriptionText).toBe("Build APIs");
    expect(session.retention).toBe("until_replaced");
    expect(session.archivedAtIso).toBeNull();
    expect(session.applicationId).toBeNull();
    expect(parseResumeJobSessionRow(resumeJobSessionToRow(session))).toEqual(session);
  });

  it("round-trips parsed_job and a jsonb match_result object", () => {
    const session = parseResumeJobSessionRow(
      sampleJobSessionRow({
        parsed_job: SAMPLE_PARSED_JOB,
        match_result: SAMPLE_MATCH_RESULT,
        application_id: APPLICATION_ID,
        archived_at: CREATED,
      })
    );
    expect(session.parsedJob).toEqual(SAMPLE_PARSED_JOB);
    expect(session.matchResult).toEqual(SAMPLE_MATCH_RESULT);
    expect(session.applicationId).toBe(APPLICATION_ID);
    expect(session.archivedAtIso).toBe(CREATED);
    expect(parseResumeJobSessionRow(resumeJobSessionToRow(session))).toEqual(session);
  });

  it("rejects unknown row keys, invalid retention, oversize JD, and non-object jsonb", () => {
    expect(() => parseResumeJobSessionRow(sampleJobSessionRow({ extra: true }))).toThrow(MapperError);
    expect(() => parseResumeJobSessionRow(sampleJobSessionRow({ retention: "forever" }))).toThrow(
      MapperError
    );
    expect(() =>
      parseResumeJobSessionRow(
        sampleJobSessionRow({
          job_description_text: "x".repeat(RESUME_JOB_DESCRIPTION_MAX_CHARS + 1),
        })
      )
    ).toThrow(MapperError);
    expect(() => parseResumeJobSessionRow(sampleJobSessionRow({ parsed_job: [] }))).toThrow(
      MapperError
    );
    expect(() => parseResumeJobSessionRow(sampleJobSessionRow({ match_result: [] }))).toThrow(
      MapperError
    );
    expect(() => parseResumeJobSessionRow(sampleJobSessionRow({ id: "bad" }))).toThrow(MapperError);
  });

  it("rejects parsed_job / match_result with unknown fields or invalid allowlists", () => {
    expect(() => parseParsedJobDescription({ ...SAMPLE_PARSED_JOB, atsScore: 99 })).toThrow(
      MapperError
    );
    expect(() =>
      parseParsedJobDescription({
        ...SAMPLE_PARSED_JOB,
        requirements: [{ ...SAMPLE_PARSED_JOB.requirements[0], priority: "must" }],
      })
    ).toThrow(MapperError);
    expect(() => parseMatchResult({ ...SAMPLE_MATCH_RESULT, atsScore: 99 })).toThrow(MapperError);
    expect(() => parseMatchResult({ coverage: 0 })).toThrow(MapperError);
    expect(() =>
      parseMatchResult({
        ...SAMPLE_MATCH_RESULT,
        requirements: [{ ...SAMPLE_MATCH_RESULT.requirements[0], status: "supported" }],
      })
    ).toThrow(MapperError);
  });

  it("rejects a session that belongs to a different resume or user", () => {
    const session = parseResumeJobSessionRow(sampleJobSessionRow());
    expect(() => assertJobSessionBelongsToResume(session, OTHER_RESUME_ID, USER_ID)).toThrow(
      MapperError
    );
    expect(() => assertJobSessionBelongsToResume(session, RESUME_ID, OTHER_USER_ID)).toThrow(
      MapperError
    );
    expect(() => assertJobSessionBelongsToResume(session, RESUME_ID, USER_ID)).not.toThrow();
  });
});
