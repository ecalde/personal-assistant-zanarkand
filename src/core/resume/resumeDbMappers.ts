/**
 * Resume domain ↔ Postgres/Storage mappers. Isolated from AppPayload.
 * Same-resume membership of active_version_id is enforced here (Phase 1D).
 */

import { MapperError, isUuid } from "../dbMappers";
import {
  isAtsWarningCode,
  isAtsWarningSeverity,
  isFactProvenance,
  isFactType,
  isJobSessionRetention,
  isRequirementCategory,
  isRequirementMatchStatus,
  isRequirementPriority,
  isResumeSourceKind,
  type DocumentMention,
  type MatchCoverageSummary,
  type MatchResult,
  type ParsedJobDescription,
  type Requirement,
  type RequirementMatch,
  type Resume,
  type ResumeAtsWarning,
  type ResumeBlockMapEntry,
  type ResumeExtractedStructure,
  type ResumeFact,
  type ResumeFactLedger,
  type ResumeJobSession,
  type ResumeStructureBlock,
  type ResumeStructureGraph,
  type ResumeStructureRun,
  type ResumeVersion,
} from "./resumeModel";

const RESUME_ROW_KEYS = [
  "id",
  "user_id",
  "name",
  "source_filename",
  "is_default",
  "active_version_id",
  "import_fact_ledger",
  "created_at",
  "updated_at",
] as const;

const RESUME_VERSION_ROW_KEYS = [
  "id",
  "user_id",
  "resume_id",
  "parent_version_id",
  "version_n",
  "label",
  "source_kind",
  "original_storage_path",
  "working_storage_path",
  "sha256",
  "extracted_structure",
  "page_count_estimated",
  "created_at",
] as const;

const LEDGER_KEYS = ["facts"] as const;
const FACT_KEYS = [
  "id",
  "type",
  "verbatim",
  "normalized",
  "sourceBlockIds",
  "provenance",
  "inheritedFromFactIds",
  "presentInWorkingDocument",
  "firstSeenVersionId",
  "verifiedAtIso",
] as const;
const EXTRACTED_STRUCTURE_KEYS = ["mentionIndex", "graph", "blockMap", "atsWarnings"] as const;
const MENTION_KEYS = ["normalized", "type", "blockId", "verbatim"] as const;
const GRAPH_KEYS = ["blocks"] as const;
const GRAPH_BLOCK_KEYS = ["order", "text", "blockId", "bookmarkName", "runs"] as const;
const GRAPH_RUN_KEYS = [
  "text",
  "bold",
  "italic",
  "underline",
  "font",
  "sizePt",
  "hyperlinkRelId",
] as const;
const BLOCK_MAP_KEYS = ["blockId", "bookmarkName", "order"] as const;
const ATS_WARNING_KEYS = ["code", "severity", "occurrences", "message"] as const;

/** Bookmark prefix this feature owns; duplicated here to keep mappers free of the writer. */
const BLOCK_BOOKMARK_PREFIX = "pa_";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export type ResumeRow = {
  id: string;
  user_id: string;
  name: string;
  source_filename: string;
  is_default: boolean;
  active_version_id: string | null;
  import_fact_ledger: unknown;
  created_at: string;
  updated_at: string;
};

export type ResumeVersionRow = {
  id: string;
  user_id: string;
  resume_id: string;
  parent_version_id: string | null;
  version_n: number;
  label: string | null;
  source_kind: string;
  original_storage_path: string;
  working_storage_path: string;
  sha256: string;
  extracted_structure: unknown;
  page_count_estimated: number | null;
  created_at: string;
};

/** Same order as school ingest / SQL `resume_job_sessions_jd_length_chk` (architecture §33). */
export const RESUME_JOB_DESCRIPTION_MAX_CHARS = 100_000;

export type ResumeJobSessionRow = {
  id: string;
  user_id: string;
  resume_id: string;
  resume_version_id: string;
  company: string;
  job_title: string;
  job_description_text: string;
  parsed_job: unknown;
  match_result: unknown;
  retention: string;
  application_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

const RESUME_JOB_SESSION_ROW_KEYS = [
  "id",
  "user_id",
  "resume_id",
  "resume_version_id",
  "company",
  "job_title",
  "job_description_text",
  "parsed_job",
  "match_result",
  "retention",
  "application_id",
  "archived_at",
  "created_at",
  "updated_at",
] as const;

const PARSED_JOB_KEYS = [
  "jobTitle",
  "company",
  "location",
  "seniority",
  "domainTags",
  "requirements",
  "rawText",
  "parserVersion",
] as const;

const PARSED_JOB_TAG_KEYS = ["value", "basis"] as const;
const REQUIREMENT_KEYS = [
  "id",
  "text",
  "category",
  "priority",
  "normalizedTerms",
  "aliases",
  "salience",
] as const;

const MATCH_RESULT_KEYS = ["matcherVersion", "requirements", "coverage"] as const;
const REQUIREMENT_MATCH_KEYS = [
  "requirementId",
  "status",
  "evidenceFactIds",
  "mentionBlockIds",
  "matchedTerm",
] as const;
const MATCH_COVERAGE_KEYS = [
  "requiredTotal",
  "requiredExplicitCount",
  "requiredExplicitCoverage",
  "preferredTotal",
  "preferredExplicitCount",
  "preferredExplicitCoverage",
  "semanticSupportedCount",
  "missingRequiredIds",
  "uncertainIds",
  "onPageUnverifiedIds",
  "contradictedIds",
  "responsibilityTotal",
  "responsibilityAlignedCount",
  "responsibilityAlignment",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertUuid(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new MapperError(`Invalid UUID: ${field}`, field);
  }
}

function assertIsoTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new MapperError(`Invalid ISO timestamp: ${field}`, field);
  }
}

function assertNonEmptyString(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MapperError(`Invalid ${field}: expected nonempty string`, field);
  }
  return value.trim();
}

function assertAllowedKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  field: string
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      throw new MapperError(`Invalid ${field}: unknown field "${key}"`, field);
    }
  }
}

function normalizeUuid(value: string, field: string): string {
  assertUuid(value, field);
  return value.trim().toLowerCase();
}

export function assertSha256Hex(value: string, field = "sha256"): string {
  if (typeof value !== "string") {
    throw new MapperError(`Invalid ${field}: expected hex digest`, field);
  }
  const normalized = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(normalized)) {
    throw new MapperError(`Invalid ${field}: expected 64-char hex digest`, field);
  }
  return normalized;
}

/**
 * Canonical original blob path (architecture §34).
 * `{user_id}/{resume_id}/original/{sha256}.docx`
 *
 * The digest in this *path* is always the immutable original's hash. After
 * Phase 4F the version row's `sha256` column is the **working** bytes hash
 * and may differ (architecture §33).
 */
export function buildResumeOriginalStoragePath(
  userId: string,
  resumeId: string,
  sha256: string
): string {
  const owner = normalizeUuid(userId, "userId");
  const resume = normalizeUuid(resumeId, "resumeId");
  const digest = assertSha256Hex(sha256, "sha256");
  const path = `${owner}/${resume}/original/${digest}.docx`;
  assertResumeOwnerStoragePath(path, owner);
  return path;
}

/**
 * Validate an original-object path for this owner/resume without requiring
 * that `resume_versions.sha256` equal the digest in the filename.
 */
export function assertCanonicalOriginalStoragePath(
  path: string,
  userId: string,
  resumeId: string,
  field = "original_storage_path"
): string {
  if (typeof path !== "string") {
    throw new MapperError(`Invalid ${field}: expected nonempty path`, field);
  }
  assertResumeOwnerStoragePath(path, userId, field);
  const owner = normalizeUuid(userId, `${field}.userId`);
  const resume = normalizeUuid(resumeId, `${field}.resumeId`);
  const expectedPrefix = `${owner}/${resume}/original/`;
  if (!path.startsWith(expectedPrefix) || !path.endsWith(".docx")) {
    throw new MapperError(`Invalid ${field}: must match canonical owner path`, field);
  }
  const digest = path.slice(expectedPrefix.length, -".docx".length);
  assertSha256Hex(digest, `${field}.sha256`);
  return path;
}

/**
 * Canonical working-copy path (architecture §34).
 * `{user_id}/{resume_id}/versions/{version_id}.docx`
 */
export function buildResumeWorkingStoragePath(
  userId: string,
  resumeId: string,
  versionId: string
): string {
  const owner = normalizeUuid(userId, "userId");
  const resume = normalizeUuid(resumeId, "resumeId");
  const version = normalizeUuid(versionId, "versionId");
  const path = `${owner}/${resume}/versions/${version}.docx`;
  assertResumeOwnerStoragePath(path, owner);
  return path;
}

/** Rejects any storage path that is not owned by userId or is not a canonical resume object. */
export function assertResumeOwnerStoragePath(path: string, userId: string, field = "storagePath"): void {
  if (typeof path !== "string" || path.length === 0) {
    throw new MapperError(`Invalid ${field}: expected nonempty path`, field);
  }
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) {
    throw new MapperError(`Invalid ${field}: path traversal is not allowed`, field);
  }
  if (path.startsWith("/") || path.includes("//")) {
    throw new MapperError(`Invalid ${field}: malformed object path`, field);
  }

  const owner = normalizeUuid(userId, `${field}.userId`);
  if (!path.startsWith(`${owner}/`)) {
    throw new MapperError(`Invalid ${field}: path must start with {userId}/`, field);
  }

  const segments = path.split("/");
  if (segments.length !== 4) {
    throw new MapperError(`Invalid ${field}: expected four path segments`, field);
  }
  const [pathUser, pathResume, folder, filename] = segments;
  if (pathUser !== owner) {
    throw new MapperError(`Invalid ${field}: path must start with {userId}/`, field);
  }
  assertUuid(pathResume, `${field}.resumeId`);
  if (!filename.endsWith(".docx") || filename.length <= ".docx".length) {
    throw new MapperError(`Invalid ${field}: expected .docx object`, field);
  }
  const stem = filename.slice(0, -".docx".length);
  if (folder === "original") {
    assertSha256Hex(stem, `${field}.sha256`);
    return;
  }
  if (folder === "versions") {
    assertUuid(stem, `${field}.versionId`);
    return;
  }
  throw new MapperError(`Invalid ${field}: expected original/ or versions/ folder`, field);
}

export function parseImportFactLedger(
  raw: unknown,
  field = "import_fact_ledger"
): ResumeFactLedger {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, LEDGER_KEYS, field);
  if (!Array.isArray(raw.facts)) {
    throw new MapperError(`Invalid ${field}.facts: expected array`, `${field}.facts`);
  }
  return {
    facts: raw.facts.map((item, index) => parseResumeFact(item, `${field}.facts[${index}]`)),
  };
}

function parseResumeFact(raw: unknown, field: string): ResumeFact {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, FACT_KEYS, field);

  const id = typeof raw.id === "string" ? normalizeUuid(raw.id, `${field}.id`) : "";
  if (!id) {
    throw new MapperError(`Invalid UUID: ${field}.id`, `${field}.id`);
  }
  if (!isFactType(raw.type)) {
    throw new MapperError(`Invalid ${field}.type`, `${field}.type`);
  }
  if (typeof raw.verbatim !== "string" || raw.verbatim.length === 0) {
    throw new MapperError(`Invalid ${field}.verbatim`, `${field}.verbatim`);
  }
  if (typeof raw.normalized !== "string" || raw.normalized.length === 0) {
    throw new MapperError(`Invalid ${field}.normalized`, `${field}.normalized`);
  }
  if (!Array.isArray(raw.sourceBlockIds) || raw.sourceBlockIds.some((id) => typeof id !== "string")) {
    throw new MapperError(`Invalid ${field}.sourceBlockIds: expected string array`, `${field}.sourceBlockIds`);
  }
  if (raw.sourceBlockIds.some((blockId) => blockId.length === 0 || blockId.includes(".."))) {
    throw new MapperError(`Invalid ${field}.sourceBlockIds`, `${field}.sourceBlockIds`);
  }
  if (!isFactProvenance(raw.provenance)) {
    throw new MapperError(`Invalid ${field}.provenance`, `${field}.provenance`);
  }
  if (
    !Array.isArray(raw.inheritedFromFactIds) ||
    raw.inheritedFromFactIds.some((id) => typeof id !== "string" || !isUuid(id))
  ) {
    throw new MapperError(
      `Invalid ${field}.inheritedFromFactIds: expected UUID array`,
      `${field}.inheritedFromFactIds`
    );
  }
  if (typeof raw.presentInWorkingDocument !== "boolean") {
    throw new MapperError(
      `Invalid ${field}.presentInWorkingDocument`,
      `${field}.presentInWorkingDocument`
    );
  }
  if (typeof raw.firstSeenVersionId !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.firstSeenVersionId`, `${field}.firstSeenVersionId`);
  }
  const firstSeenVersionId = normalizeUuid(raw.firstSeenVersionId, `${field}.firstSeenVersionId`);

  if (raw.provenance === "grounded_ai_transformation" && raw.inheritedFromFactIds.length === 0) {
    throw new MapperError(
      `Invalid ${field}.inheritedFromFactIds: required for grounded_ai_transformation`,
      `${field}.inheritedFromFactIds`
    );
  }

  const fact: ResumeFact = {
    id,
    type: raw.type,
    verbatim: raw.verbatim,
    normalized: raw.normalized,
    sourceBlockIds: raw.sourceBlockIds,
    provenance: raw.provenance,
    inheritedFromFactIds: raw.inheritedFromFactIds.map((inheritedId) =>
      inheritedId.trim().toLowerCase()
    ),
    presentInWorkingDocument: raw.presentInWorkingDocument,
    firstSeenVersionId,
  };

  if (raw.verifiedAtIso !== undefined) {
    if (typeof raw.verifiedAtIso !== "string") {
      throw new MapperError(`Invalid ${field}.verifiedAtIso`, `${field}.verifiedAtIso`);
    }
    assertIsoTimestamp(raw.verifiedAtIso, `${field}.verifiedAtIso`);
    fact.verifiedAtIso = raw.verifiedAtIso;
  }

  return fact;
}

export function parseExtractedStructure(
  raw: unknown,
  field = "extracted_structure"
): ResumeExtractedStructure {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, EXTRACTED_STRUCTURE_KEYS, field);
  if (!Array.isArray(raw.mentionIndex)) {
    throw new MapperError(`Invalid ${field}.mentionIndex: expected array`, `${field}.mentionIndex`);
  }

  const structure: ResumeExtractedStructure = {
    mentionIndex: raw.mentionIndex.map((item, index) =>
      parseDocumentMention(item, `${field}.mentionIndex[${index}]`)
    ),
  };
  if (raw.graph !== undefined) {
    structure.graph = parseStructureGraph(raw.graph, `${field}.graph`);
  }
  if (raw.blockMap !== undefined) {
    structure.blockMap = parseBlockMap(raw.blockMap, `${field}.blockMap`);
  }
  if (raw.atsWarnings !== undefined) {
    structure.atsWarnings = parseAtsWarnings(raw.atsWarnings, `${field}.atsWarnings`);
  }
  return structure;
}

/**
 * Strict so the jsonb column can only ever hold document *structure*. An
 * encoded DOCX (base64 blob, any unlisted key) is rejected here rather than
 * persisted — the bytes belong in the `resume-docs` bucket (3F failure mode).
 */
function parseStructureGraph(raw: unknown, field: string): ResumeStructureGraph {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, GRAPH_KEYS, field);
  if (!Array.isArray(raw.blocks)) {
    throw new MapperError(`Invalid ${field}.blocks: expected array`, `${field}.blocks`);
  }
  return {
    blocks: raw.blocks.map((item, index) => parseStructureBlock(item, `${field}.blocks[${index}]`)),
  };
}

function parseStructureBlock(raw: unknown, field: string): ResumeStructureBlock {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, GRAPH_BLOCK_KEYS, field);
  if (typeof raw.order !== "number" || !Number.isInteger(raw.order) || raw.order < 0) {
    throw new MapperError(`Invalid ${field}.order`, `${field}.order`);
  }
  if (typeof raw.text !== "string") {
    throw new MapperError(`Invalid ${field}.text: expected string`, `${field}.text`);
  }
  const bookmarkName = parseOptionalBookmarkName(raw.bookmarkName, `${field}.bookmarkName`);
  const blockId = parseOptionalBlockId(raw.blockId, `${field}.blockId`);
  if ((bookmarkName === null) !== (blockId === null)) {
    throw new MapperError(
      `Invalid ${field}.blockId: block id and bookmark name must be set together`,
      `${field}.blockId`
    );
  }
  if (bookmarkName !== null && bookmarkName !== `${BLOCK_BOOKMARK_PREFIX}${blockId}`) {
    throw new MapperError(
      `Invalid ${field}.bookmarkName: must be pa_ + block id`,
      `${field}.bookmarkName`
    );
  }
  if (!Array.isArray(raw.runs)) {
    throw new MapperError(`Invalid ${field}.runs: expected array`, `${field}.runs`);
  }
  const runs = raw.runs.map((item, index) => parseStructureRun(item, `${field}.runs[${index}]`));
  if (runs.map((run) => run.text).join("") !== raw.text) {
    throw new MapperError(
      `Invalid ${field}.text: must equal the concatenated run text`,
      `${field}.text`
    );
  }
  return { order: raw.order, text: raw.text, blockId, bookmarkName, runs };
}

function parseStructureRun(raw: unknown, field: string): ResumeStructureRun {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, GRAPH_RUN_KEYS, field);
  if (typeof raw.text !== "string") {
    throw new MapperError(`Invalid ${field}.text: expected string`, `${field}.text`);
  }
  for (const flag of ["bold", "italic", "underline"] as const) {
    if (typeof raw[flag] !== "boolean") {
      throw new MapperError(`Invalid ${field}.${flag}`, `${field}.${flag}`);
    }
  }
  if (raw.font !== null && typeof raw.font !== "string") {
    throw new MapperError(`Invalid ${field}.font`, `${field}.font`);
  }
  if (raw.sizePt !== null && (typeof raw.sizePt !== "number" || !Number.isFinite(raw.sizePt))) {
    throw new MapperError(`Invalid ${field}.sizePt`, `${field}.sizePt`);
  }
  if (raw.hyperlinkRelId !== null && typeof raw.hyperlinkRelId !== "string") {
    throw new MapperError(`Invalid ${field}.hyperlinkRelId`, `${field}.hyperlinkRelId`);
  }
  return {
    text: raw.text,
    bold: raw.bold as boolean,
    italic: raw.italic as boolean,
    underline: raw.underline as boolean,
    font: raw.font as string | null,
    sizePt: raw.sizePt as number | null,
    hyperlinkRelId: raw.hyperlinkRelId as string | null,
  };
}

function parseOptionalBlockId(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length === 0 || value.includes("..")) {
    throw new MapperError(`Invalid ${field}`, field);
  }
  return value;
}

function parseOptionalBookmarkName(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.startsWith(BLOCK_BOOKMARK_PREFIX)) {
    throw new MapperError(`Invalid ${field}: expected a pa_ bookmark name`, field);
  }
  return value;
}

/** Secondary block map (architecture §19.2): contiguous reading order, pa_ names. */
function parseBlockMap(raw: unknown, field: string): ResumeBlockMapEntry[] {
  if (!Array.isArray(raw)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  return raw.map((item, index) => {
    const entryField = `${field}[${index}]`;
    if (!isPlainObject(item)) {
      throw new MapperError(`Invalid ${entryField}: expected object`, entryField);
    }
    assertAllowedKeys(item, BLOCK_MAP_KEYS, entryField);
    const blockId = parseOptionalBlockId(item.blockId, `${entryField}.blockId`);
    const bookmarkName = parseOptionalBookmarkName(item.bookmarkName, `${entryField}.bookmarkName`);
    if (blockId === null || bookmarkName === null) {
      throw new MapperError(`Invalid ${entryField}.blockId`, `${entryField}.blockId`);
    }
    if (bookmarkName !== `${BLOCK_BOOKMARK_PREFIX}${blockId}`) {
      throw new MapperError(
        `Invalid ${entryField}.bookmarkName: must be pa_ + block id`,
        `${entryField}.bookmarkName`
      );
    }
    if (item.order !== index) {
      throw new MapperError(
        `Invalid ${entryField}.order: expected contiguous reading order`,
        `${entryField}.order`
      );
    }
    return { blockId, bookmarkName, order: index };
  });
}

/** Warnings only: an aggregate ATS score is forbidden (ADR-014 / RES-ATS-001). */
function parseAtsWarnings(raw: unknown, field: string): ResumeAtsWarning[] {
  if (!Array.isArray(raw)) {
    throw new MapperError(`Invalid ${field}: expected array`, field);
  }
  return raw.map((item, index) => {
    const entryField = `${field}[${index}]`;
    if (!isPlainObject(item)) {
      throw new MapperError(`Invalid ${entryField}: expected object`, entryField);
    }
    assertAllowedKeys(item, ATS_WARNING_KEYS, entryField);
    if (!isAtsWarningCode(item.code)) {
      throw new MapperError(`Invalid ${entryField}.code`, `${entryField}.code`);
    }
    if (!isAtsWarningSeverity(item.severity)) {
      throw new MapperError(`Invalid ${entryField}.severity`, `${entryField}.severity`);
    }
    if (
      typeof item.occurrences !== "number" ||
      !Number.isInteger(item.occurrences) ||
      item.occurrences < 1
    ) {
      throw new MapperError(`Invalid ${entryField}.occurrences`, `${entryField}.occurrences`);
    }
    if (typeof item.message !== "string" || item.message.trim().length === 0) {
      throw new MapperError(`Invalid ${entryField}.message`, `${entryField}.message`);
    }
    return {
      code: item.code,
      severity: item.severity,
      occurrences: item.occurrences,
      message: item.message,
    };
  });
}

function parseDocumentMention(raw: unknown, field: string): DocumentMention {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, MENTION_KEYS, field);
  if (typeof raw.normalized !== "string" || raw.normalized.length === 0) {
    throw new MapperError(`Invalid ${field}.normalized`, `${field}.normalized`);
  }
  if (!isFactType(raw.type)) {
    throw new MapperError(`Invalid ${field}.type`, `${field}.type`);
  }
  if (typeof raw.blockId !== "string" || raw.blockId.length === 0 || raw.blockId.includes("..")) {
    throw new MapperError(`Invalid ${field}.blockId`, `${field}.blockId`);
  }
  if (typeof raw.verbatim !== "string" || raw.verbatim.length === 0) {
    throw new MapperError(`Invalid ${field}.verbatim`, `${field}.verbatim`);
  }
  return {
    normalized: raw.normalized,
    type: raw.type,
    blockId: raw.blockId,
    verbatim: raw.verbatim,
  };
}

export function parseResumeRow(raw: unknown, field = "resumes"): Resume {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, RESUME_ROW_KEYS, field);

  if (typeof raw.id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.id`, `${field}.id`);
  }
  if (typeof raw.user_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.user_id`, `${field}.user_id`);
  }
  const id = normalizeUuid(raw.id, `${field}.id`);
  const userId = normalizeUuid(raw.user_id, `${field}.user_id`);
  if (typeof raw.name !== "string") {
    throw new MapperError(`Invalid ${field}.name`, `${field}.name`);
  }
  if (typeof raw.source_filename !== "string") {
    throw new MapperError(`Invalid ${field}.source_filename`, `${field}.source_filename`);
  }
  const name = assertNonEmptyString(raw.name, `${field}.name`);
  const sourceFilename = assertNonEmptyString(raw.source_filename, `${field}.source_filename`);
  if (typeof raw.is_default !== "boolean") {
    throw new MapperError(`Invalid ${field}.is_default`, `${field}.is_default`);
  }
  if (raw.active_version_id !== null && typeof raw.active_version_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.active_version_id`, `${field}.active_version_id`);
  }
  const activeVersionId =
    raw.active_version_id === null
      ? null
      : normalizeUuid(raw.active_version_id, `${field}.active_version_id`);
  if (typeof raw.created_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.created_at`, `${field}.created_at`);
  }
  if (typeof raw.updated_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.updated_at`, `${field}.updated_at`);
  }
  assertIsoTimestamp(raw.created_at, `${field}.created_at`);
  assertIsoTimestamp(raw.updated_at, `${field}.updated_at`);

  return {
    id,
    userId,
    name,
    sourceFilename,
    isDefault: raw.is_default,
    activeVersionId,
    importFactLedger: parseImportFactLedger(raw.import_fact_ledger, `${field}.import_fact_ledger`),
    createdAtIso: raw.created_at,
    updatedAtIso: raw.updated_at,
  };
}

export function resumeToRow(resume: Resume): ResumeRow {
  const parsed = parseResumeRow(
    {
      id: resume.id,
      user_id: resume.userId,
      name: resume.name,
      source_filename: resume.sourceFilename,
      is_default: resume.isDefault,
      active_version_id: resume.activeVersionId,
      import_fact_ledger: resume.importFactLedger,
      created_at: resume.createdAtIso,
      updated_at: resume.updatedAtIso,
    },
    "resume"
  );

  return {
    id: parsed.id,
    user_id: parsed.userId,
    name: parsed.name,
    source_filename: parsed.sourceFilename,
    is_default: parsed.isDefault,
    active_version_id: parsed.activeVersionId,
    import_fact_ledger: parsed.importFactLedger,
    created_at: parsed.createdAtIso,
    updated_at: parsed.updatedAtIso,
  };
}

export function parseResumeVersionRow(raw: unknown, field = "resume_versions"): ResumeVersion {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, RESUME_VERSION_ROW_KEYS, field);

  if (typeof raw.id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.id`, `${field}.id`);
  }
  if (typeof raw.user_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.user_id`, `${field}.user_id`);
  }
  if (typeof raw.resume_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.resume_id`, `${field}.resume_id`);
  }
  const id = normalizeUuid(raw.id, `${field}.id`);
  const userId = normalizeUuid(raw.user_id, `${field}.user_id`);
  const resumeId = normalizeUuid(raw.resume_id, `${field}.resume_id`);

  if (raw.parent_version_id !== null && typeof raw.parent_version_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.parent_version_id`, `${field}.parent_version_id`);
  }
  const parentVersionId =
    raw.parent_version_id === null
      ? null
      : normalizeUuid(raw.parent_version_id, `${field}.parent_version_id`);

  if (typeof raw.version_n !== "number" || !Number.isInteger(raw.version_n) || raw.version_n < 1) {
    throw new MapperError(`Invalid ${field}.version_n`, `${field}.version_n`);
  }
  if (raw.label !== null && typeof raw.label !== "string") {
    throw new MapperError(`Invalid ${field}.label`, `${field}.label`);
  }
  const label = raw.label === null ? null : raw.label.trim() === "" ? null : raw.label.trim();
  if (!isResumeSourceKind(raw.source_kind)) {
    throw new MapperError(`Invalid ${field}.source_kind`, `${field}.source_kind`);
  }
  if (typeof raw.original_storage_path !== "string") {
    throw new MapperError(`Invalid ${field}.original_storage_path`, `${field}.original_storage_path`);
  }
  if (typeof raw.working_storage_path !== "string") {
    throw new MapperError(`Invalid ${field}.working_storage_path`, `${field}.working_storage_path`);
  }
  if (typeof raw.sha256 !== "string") {
    throw new MapperError(`Invalid ${field}.sha256`, `${field}.sha256`);
  }
  const sha256 = assertSha256Hex(raw.sha256, `${field}.sha256`);
  const originalStoragePath = assertCanonicalOriginalStoragePath(
    raw.original_storage_path,
    userId,
    resumeId,
    `${field}.original_storage_path`
  );
  const workingStoragePath = buildResumeWorkingStoragePath(userId, resumeId, id);
  if (raw.original_storage_path !== originalStoragePath) {
    throw new MapperError(
      `Invalid ${field}.original_storage_path: must match canonical owner path`,
      `${field}.original_storage_path`
    );
  }
  if (raw.working_storage_path !== workingStoragePath) {
    throw new MapperError(
      `Invalid ${field}.working_storage_path: must match canonical owner path`,
      `${field}.working_storage_path`
    );
  }
  if (raw.page_count_estimated !== null) {
    if (
      typeof raw.page_count_estimated !== "number" ||
      !Number.isInteger(raw.page_count_estimated) ||
      raw.page_count_estimated < 1
    ) {
      throw new MapperError(`Invalid ${field}.page_count_estimated`, `${field}.page_count_estimated`);
    }
  }
  if (typeof raw.created_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.created_at`, `${field}.created_at`);
  }
  assertIsoTimestamp(raw.created_at, `${field}.created_at`);

  return {
    id,
    userId,
    resumeId,
    parentVersionId,
    versionN: raw.version_n,
    label,
    sourceKind: raw.source_kind,
    originalStoragePath,
    workingStoragePath,
    sha256,
    extractedStructure: parseExtractedStructure(
      raw.extracted_structure,
      `${field}.extracted_structure`
    ),
    pageCountEstimated: raw.page_count_estimated,
    createdAtIso: raw.created_at,
  };
}

export function resumeVersionToRow(version: ResumeVersion): ResumeVersionRow {
  const parsed = parseResumeVersionRow(
    {
      id: version.id,
      user_id: version.userId,
      resume_id: version.resumeId,
      parent_version_id: version.parentVersionId,
      version_n: version.versionN,
      label: version.label,
      source_kind: version.sourceKind,
      original_storage_path: version.originalStoragePath,
      working_storage_path: version.workingStoragePath,
      sha256: version.sha256,
      extracted_structure: version.extractedStructure,
      page_count_estimated: version.pageCountEstimated,
      created_at: version.createdAtIso,
    },
    "resumeVersion"
  );

  return {
    id: parsed.id,
    user_id: parsed.userId,
    resume_id: parsed.resumeId,
    parent_version_id: parsed.parentVersionId,
    version_n: parsed.versionN,
    label: parsed.label,
    source_kind: parsed.sourceKind,
    original_storage_path: parsed.originalStoragePath,
    working_storage_path: parsed.workingStoragePath,
    sha256: parsed.sha256,
    extracted_structure: parsed.extractedStructure,
    page_count_estimated: parsed.pageCountEstimated,
    created_at: parsed.createdAtIso,
  };
}

/** SQL cannot cheaply enforce active_version_id ∈ this resume; mappers do. */
export function assertActiveVersionBelongsToResume(resume: Resume, version: ResumeVersion): void {
  if (resume.activeVersionId === null) {
    throw new MapperError(
      "Invalid resumes.active_version_id: expected version membership check",
      "resumes.active_version_id"
    );
  }
  if (version.id !== resume.activeVersionId) {
    throw new MapperError(
      "Invalid resumes.active_version_id: version id does not match",
      "resumes.active_version_id"
    );
  }
  if (version.resumeId !== resume.id) {
    throw new MapperError(
      "Invalid resumes.active_version_id: version belongs to a different resume",
      "resumes.active_version_id"
    );
  }
  if (version.userId !== resume.userId) {
    throw new MapperError(
      "Invalid resumes.active_version_id: version belongs to a different user",
      "resumes.active_version_id"
    );
  }
}

export function parseResumeWithActiveVersion(
  resumeRaw: unknown,
  versionRaw: unknown
): { resume: Resume; activeVersion: ResumeVersion } {
  const resume = parseResumeRow(resumeRaw);
  const activeVersion = parseResumeVersionRow(versionRaw);
  assertActiveVersionBelongsToResume(resume, activeVersion);
  return { resume, activeVersion };
}

function assertJobDescriptionText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new MapperError(`Invalid ${field}`, field);
  }
  if (value.length > RESUME_JOB_DESCRIPTION_MAX_CHARS) {
    throw new MapperError(
      `Invalid ${field}: exceeds ${RESUME_JOB_DESCRIPTION_MAX_CHARS} characters`,
      field
    );
  }
  return value;
}

function parseInferenceTag(raw: unknown, field: string): { value: string; basis: "explicit" | "inferred" } {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, PARSED_JOB_TAG_KEYS, field);
  if (typeof raw.value !== "string" || raw.value.trim().length === 0) {
    throw new MapperError(`Invalid ${field}.value`, `${field}.value`);
  }
  if (raw.basis !== "explicit" && raw.basis !== "inferred") {
    throw new MapperError(`Invalid ${field}.basis`, `${field}.basis`);
  }
  return { value: raw.value, basis: raw.basis };
}

function parseStringList(raw: unknown, field: string): string[] {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
    throw new MapperError(`Invalid ${field}: expected string array`, field);
  }
  return raw;
}

function parseRequirement(raw: unknown, field: string): Requirement {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, REQUIREMENT_KEYS, field);
  if (typeof raw.id !== "string" || raw.id.trim().length === 0 || raw.id.includes("..")) {
    throw new MapperError(`Invalid ${field}.id`, `${field}.id`);
  }
  if (typeof raw.text !== "string" || raw.text.length === 0) {
    throw new MapperError(`Invalid ${field}.text`, `${field}.text`);
  }
  if (!isRequirementCategory(raw.category)) {
    throw new MapperError(`Invalid ${field}.category`, `${field}.category`);
  }
  if (!isRequirementPriority(raw.priority)) {
    throw new MapperError(`Invalid ${field}.priority`, `${field}.priority`);
  }
  if (typeof raw.salience !== "number" || !Number.isFinite(raw.salience) || raw.salience < 0 || raw.salience > 1) {
    throw new MapperError(`Invalid ${field}.salience`, `${field}.salience`);
  }
  return {
    id: raw.id,
    text: raw.text,
    category: raw.category,
    priority: raw.priority,
    normalizedTerms: parseStringList(raw.normalizedTerms, `${field}.normalizedTerms`),
    aliases: parseStringList(raw.aliases, `${field}.aliases`),
    salience: raw.salience,
  };
}

export function parseParsedJobDescription(
  raw: unknown,
  field = "parsed_job"
): ParsedJobDescription {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, PARSED_JOB_KEYS, field);
  if (typeof raw.rawText !== "string") {
    throw new MapperError(`Invalid ${field}.rawText`, `${field}.rawText`);
  }
  if (typeof raw.parserVersion !== "string" || raw.parserVersion.trim().length === 0) {
    throw new MapperError(`Invalid ${field}.parserVersion`, `${field}.parserVersion`);
  }
  if (!Array.isArray(raw.domainTags)) {
    throw new MapperError(`Invalid ${field}.domainTags: expected array`, `${field}.domainTags`);
  }
  if (!Array.isArray(raw.requirements)) {
    throw new MapperError(`Invalid ${field}.requirements: expected array`, `${field}.requirements`);
  }

  const parsed: ParsedJobDescription = {
    domainTags: raw.domainTags.map((tag, index) => parseInferenceTag(tag, `${field}.domainTags[${index}]`)),
    requirements: raw.requirements.map((item, index) =>
      parseRequirement(item, `${field}.requirements[${index}]`)
    ),
    rawText: raw.rawText,
    parserVersion: raw.parserVersion.trim(),
  };

  if (raw.jobTitle !== undefined) {
    if (typeof raw.jobTitle !== "string") {
      throw new MapperError(`Invalid ${field}.jobTitle`, `${field}.jobTitle`);
    }
    parsed.jobTitle = raw.jobTitle;
  }
  if (raw.company !== undefined) {
    if (typeof raw.company !== "string") {
      throw new MapperError(`Invalid ${field}.company`, `${field}.company`);
    }
    parsed.company = raw.company;
  }
  if (raw.location !== undefined) {
    if (typeof raw.location !== "string") {
      throw new MapperError(`Invalid ${field}.location`, `${field}.location`);
    }
    parsed.location = raw.location;
  }
  if (raw.seniority !== undefined) {
    parsed.seniority = parseInferenceTag(raw.seniority, `${field}.seniority`);
  }
  return parsed;
}

function parseNullableParsedJob(raw: unknown, field: string): ParsedJobDescription | null {
  if (raw === null) return null;
  return parseParsedJobDescription(raw, field);
}

function parseUnitInterval(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new MapperError(`Invalid ${field}`, field);
  }
  return raw;
}

function parseNonNegativeInt(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new MapperError(`Invalid ${field}`, field);
  }
  return raw;
}

function parseRequirementMatch(raw: unknown, field: string): RequirementMatch {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, REQUIREMENT_MATCH_KEYS, field);
  if (
    typeof raw.requirementId !== "string" ||
    raw.requirementId.trim().length === 0 ||
    raw.requirementId.includes("..")
  ) {
    throw new MapperError(`Invalid ${field}.requirementId`, `${field}.requirementId`);
  }
  if (!isRequirementMatchStatus(raw.status)) {
    throw new MapperError(`Invalid ${field}.status`, `${field}.status`);
  }
  if (raw.matchedTerm !== null && typeof raw.matchedTerm !== "string") {
    throw new MapperError(`Invalid ${field}.matchedTerm`, `${field}.matchedTerm`);
  }
  return {
    requirementId: raw.requirementId,
    status: raw.status,
    evidenceFactIds: parseStringList(raw.evidenceFactIds, `${field}.evidenceFactIds`),
    mentionBlockIds: parseStringList(raw.mentionBlockIds, `${field}.mentionBlockIds`),
    matchedTerm: raw.matchedTerm,
  };
}

function parseMatchCoverageSummary(raw: unknown, field: string): MatchCoverageSummary {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, MATCH_COVERAGE_KEYS, field);
  return {
    requiredTotal: parseNonNegativeInt(raw.requiredTotal, `${field}.requiredTotal`),
    requiredExplicitCount: parseNonNegativeInt(
      raw.requiredExplicitCount,
      `${field}.requiredExplicitCount`
    ),
    requiredExplicitCoverage: parseUnitInterval(
      raw.requiredExplicitCoverage,
      `${field}.requiredExplicitCoverage`
    ),
    preferredTotal: parseNonNegativeInt(raw.preferredTotal, `${field}.preferredTotal`),
    preferredExplicitCount: parseNonNegativeInt(
      raw.preferredExplicitCount,
      `${field}.preferredExplicitCount`
    ),
    preferredExplicitCoverage: parseUnitInterval(
      raw.preferredExplicitCoverage,
      `${field}.preferredExplicitCoverage`
    ),
    semanticSupportedCount: parseNonNegativeInt(
      raw.semanticSupportedCount,
      `${field}.semanticSupportedCount`
    ),
    missingRequiredIds: parseStringList(raw.missingRequiredIds, `${field}.missingRequiredIds`),
    uncertainIds: parseStringList(raw.uncertainIds, `${field}.uncertainIds`),
    onPageUnverifiedIds: parseStringList(raw.onPageUnverifiedIds, `${field}.onPageUnverifiedIds`),
    contradictedIds: parseStringList(raw.contradictedIds, `${field}.contradictedIds`),
    responsibilityTotal: parseNonNegativeInt(
      raw.responsibilityTotal,
      `${field}.responsibilityTotal`
    ),
    responsibilityAlignedCount: parseNonNegativeInt(
      raw.responsibilityAlignedCount,
      `${field}.responsibilityAlignedCount`
    ),
    responsibilityAlignment: parseUnitInterval(
      raw.responsibilityAlignment,
      `${field}.responsibilityAlignment`
    ),
  };
}

export function parseMatchResult(raw: unknown, field = "match_result"): MatchResult {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, MATCH_RESULT_KEYS, field);
  if (typeof raw.matcherVersion !== "string" || raw.matcherVersion.trim().length === 0) {
    throw new MapperError(`Invalid ${field}.matcherVersion`, `${field}.matcherVersion`);
  }
  if (!Array.isArray(raw.requirements)) {
    throw new MapperError(`Invalid ${field}.requirements: expected array`, `${field}.requirements`);
  }
  return {
    matcherVersion: raw.matcherVersion.trim(),
    requirements: raw.requirements.map((item, index) =>
      parseRequirementMatch(item, `${field}.requirements[${index}]`)
    ),
    coverage: parseMatchCoverageSummary(raw.coverage, `${field}.coverage`),
  };
}

function parseNullableMatchResult(raw: unknown, field: string): MatchResult | null {
  if (raw === null) return null;
  return parseMatchResult(raw, field);
}

export function parseResumeJobSessionRow(
  raw: unknown,
  field = "resume_job_sessions"
): ResumeJobSession {
  if (!isPlainObject(raw)) {
    throw new MapperError(`Invalid ${field}: expected object`, field);
  }
  assertAllowedKeys(raw, RESUME_JOB_SESSION_ROW_KEYS, field);

  if (typeof raw.id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.id`, `${field}.id`);
  }
  if (typeof raw.user_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.user_id`, `${field}.user_id`);
  }
  if (typeof raw.resume_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.resume_id`, `${field}.resume_id`);
  }
  if (typeof raw.resume_version_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.resume_version_id`, `${field}.resume_version_id`);
  }
  const id = normalizeUuid(raw.id, `${field}.id`);
  const userId = normalizeUuid(raw.user_id, `${field}.user_id`);
  const resumeId = normalizeUuid(raw.resume_id, `${field}.resume_id`);
  const resumeVersionId = normalizeUuid(raw.resume_version_id, `${field}.resume_version_id`);

  if (typeof raw.company !== "string") {
    throw new MapperError(`Invalid ${field}.company`, `${field}.company`);
  }
  if (typeof raw.job_title !== "string") {
    throw new MapperError(`Invalid ${field}.job_title`, `${field}.job_title`);
  }
  const jobDescriptionText = assertJobDescriptionText(
    raw.job_description_text,
    `${field}.job_description_text`
  );
  if (!isJobSessionRetention(raw.retention)) {
    throw new MapperError(`Invalid ${field}.retention`, `${field}.retention`);
  }
  if (raw.application_id !== null && typeof raw.application_id !== "string") {
    throw new MapperError(`Invalid UUID: ${field}.application_id`, `${field}.application_id`);
  }
  const applicationId =
    raw.application_id === null
      ? null
      : normalizeUuid(raw.application_id, `${field}.application_id`);
  if (raw.archived_at !== null && typeof raw.archived_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.archived_at`, `${field}.archived_at`);
  }
  if (raw.archived_at !== null) {
    assertIsoTimestamp(raw.archived_at, `${field}.archived_at`);
  }
  if (typeof raw.created_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.created_at`, `${field}.created_at`);
  }
  if (typeof raw.updated_at !== "string") {
    throw new MapperError(`Invalid ISO timestamp: ${field}.updated_at`, `${field}.updated_at`);
  }
  assertIsoTimestamp(raw.created_at, `${field}.created_at`);
  assertIsoTimestamp(raw.updated_at, `${field}.updated_at`);

  return {
    id,
    userId,
    resumeId,
    resumeVersionId,
    company: raw.company,
    jobTitle: raw.job_title,
    jobDescriptionText,
    parsedJob: parseNullableParsedJob(raw.parsed_job, `${field}.parsed_job`),
    matchResult: parseNullableMatchResult(raw.match_result, `${field}.match_result`),
    retention: raw.retention,
    applicationId,
    archivedAtIso: raw.archived_at,
    createdAtIso: raw.created_at,
    updatedAtIso: raw.updated_at,
  };
}

export function resumeJobSessionToRow(session: ResumeJobSession): ResumeJobSessionRow {
  const parsed = parseResumeJobSessionRow(
    {
      id: session.id,
      user_id: session.userId,
      resume_id: session.resumeId,
      resume_version_id: session.resumeVersionId,
      company: session.company,
      job_title: session.jobTitle,
      job_description_text: session.jobDescriptionText,
      parsed_job: session.parsedJob,
      match_result: session.matchResult,
      retention: session.retention,
      application_id: session.applicationId,
      archived_at: session.archivedAtIso,
      created_at: session.createdAtIso,
      updated_at: session.updatedAtIso,
    },
    "resumeJobSession"
  );

  return {
    id: parsed.id,
    user_id: parsed.userId,
    resume_id: parsed.resumeId,
    resume_version_id: parsed.resumeVersionId,
    company: parsed.company,
    job_title: parsed.jobTitle,
    job_description_text: parsed.jobDescriptionText,
    parsed_job: parsed.parsedJob,
    match_result: parsed.matchResult,
    retention: parsed.retention,
    application_id: parsed.applicationId,
    archived_at: parsed.archivedAtIso,
    created_at: parsed.createdAtIso,
    updated_at: parsed.updatedAtIso,
  };
}

/** Session rows must belong to the same owner/resume as the open document. */
export function assertJobSessionBelongsToResume(
  session: ResumeJobSession,
  resumeId: string,
  userId: string
): void {
  const resume = normalizeUuid(resumeId, "resumeId");
  const owner = normalizeUuid(userId, "userId");
  if (session.resumeId !== resume) {
    throw new MapperError(
      "Invalid resume_job_sessions.resume_id: session belongs to a different resume",
      "resume_job_sessions.resume_id"
    );
  }
  if (session.userId !== owner) {
    throw new MapperError(
      "Invalid resume_job_sessions.user_id: session belongs to a different user",
      "resume_job_sessions.user_id"
    );
  }
}
