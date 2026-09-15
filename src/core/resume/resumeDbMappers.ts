/**
 * Resume domain ↔ Postgres/Storage mappers. Isolated from AppPayload.
 * Same-resume membership of active_version_id is enforced here (Phase 1D).
 */

import { MapperError, isUuid } from "../dbMappers";
import {
  isFactProvenance,
  isFactType,
  isResumeSourceKind,
  type DocumentMention,
  type Resume,
  type ResumeExtractedStructure,
  type ResumeFact,
  type ResumeFactLedger,
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
const EXTRACTED_STRUCTURE_KEYS = ["mentionIndex", "graph"] as const;
const MENTION_KEYS = ["normalized", "type", "blockId", "verbatim"] as const;

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
    structure.graph = raw.graph;
  }
  return structure;
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
  const originalStoragePath = buildResumeOriginalStoragePath(userId, resumeId, sha256);
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
