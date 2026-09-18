/**
 * Isolated Resume persistence. Must not go through replaceRemotePayload / payloadFromRows.
 * DOCX bytes live in the private resume-docs bucket; rows live in dedicated RLS tables.
 */

import { supabase } from "./supabaseClient";
import { MapperError, isUuid } from "../core/dbMappers";
import {
  RESUME_DOCX_CONTENT_TYPE,
  validateResumeDocxBytes,
} from "../core/resume/resumeFileValidation";
import { resumeUploadTooLargeMessage } from "../core/resume/resumeLimits";
import {
  duplicateResumeName,
  normalizeResumeName,
  saveAsNewResumeName,
  validateResumeName,
} from "../core/resume/resumeLibrary";
import {
  RESUME_JOB_DESCRIPTION_MAX_CHARS,
  assertActiveVersionBelongsToResume,
  assertCanonicalOriginalStoragePath,
  assertJobSessionBelongsToResume,
  assertResumeOwnerStoragePath,
  buildResumeOriginalStoragePath,
  buildResumeWorkingStoragePath,
  assertSuggestionBelongsToSession,
  parseResumeJobSessionRow,
  parseResumeRow,
  parseResumeSuggestionRow,
  parseResumeVersionRow,
  resumeJobSessionToRow,
  resumeSuggestionToRow,
  resumeToRow,
  resumeVersionToRow,
} from "../core/resume/resumeDbMappers";
import {
  assertWorkingCopyUploadPath,
  extractedStructureAfterWorkingEdit,
  sha256HexOfBytes,
  workingVersionRowPatch,
} from "../core/resume/resumeAutosave";
import { ingestResumeOriginal } from "../core/resume/resumeIngest";
import type {
  Resume,
  ResumeExtractedStructure,
  ResumeJobSession,
  ResumeSourceKind,
  ResumeStructureGraph,
  ResumeSuggestion,
  ResumeSuggestionRecord,
  ResumeVersion,
} from "../core/resume/resumeModel";

export const RESUME_DOCS_BUCKET = "resume-docs";
export { RESUME_DOCX_CONTENT_TYPE };

export class ResumeRemoteError extends Error {
  readonly code?: string;

  constructor(message: string, options?: { code?: string }) {
    super(message);
    this.name = "ResumeRemoteError";
    this.code = options?.code;
  }
}

export type InsertResumeWithOriginalInput = {
  userId: string;
  name: string;
  sourceFilename: string;
  bytes: Uint8Array | ArrayBuffer | Blob;
  isDefault?: boolean;
};

export type InsertResumeWithOriginalResult = {
  resume: Resume;
  version: ResumeVersion;
};

function assertUserId(userId: string): string {
  if (!isUuid(userId)) {
    throw new ResumeRemoteError("Invalid user id.");
  }
  return userId.trim().toLowerCase();
}

function toResumeRemoteError(err: unknown, fallback: string): ResumeRemoteError {
  if (err instanceof ResumeRemoteError) return err;
  if (err instanceof MapperError) {
    return new ResumeRemoteError(fallback);
  }
  if (err && typeof err === "object" && "code" in err) {
    const supaErr = err as { code?: string };
    return new ResumeRemoteError(fallback, { code: supaErr.code });
  }
  return new ResumeRemoteError(fallback);
}

function throwOnError(
  error: { code?: string; message?: string } | null,
  fallback: string
): void {
  if (!error) return;
  throw new ResumeRemoteError(fallback, { code: error.code });
}

async function toUint8Array(bytes: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(await bytes.arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return sha256HexOfBytes(bytes);
}

async function removeResumeDocxPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(RESUME_DOCS_BUCKET).remove(paths);
  throwOnError(error, "Could not remove resume file.");
}

async function listResumePrefixPaths(userId: string, resumeId: string): Promise<string[]> {
  const originalFolder = `${userId}/${resumeId}/original`;
  const versionsFolder = `${userId}/${resumeId}/versions`;
  const paths: string[] = [];

  for (const folder of [originalFolder, versionsFolder]) {
    const { data, error } = await supabase.storage.from(RESUME_DOCS_BUCKET).list(folder, {
      limit: 100,
    });
    if (error) {
      continue;
    }
    for (const item of data ?? []) {
      if (!item.name) continue;
      const path = `${folder}/${item.name}`;
      try {
        assertResumeOwnerStoragePath(path, userId);
        paths.push(path);
      } catch {
        continue;
      }
    }
  }

  return paths;
}

/** Upload helper. Content-Type is the WordprocessingML document MIME type. */
export async function uploadResumeDocx(args: {
  userId: string;
  path: string;
  bytes: Uint8Array;
}): Promise<void> {
  const userId = assertUserId(args.userId);
  try {
    assertResumeOwnerStoragePath(args.path, userId);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not upload resume file.");
  }
  const tooLarge = resumeUploadTooLargeMessage(args.bytes.byteLength);
  if (tooLarge) {
    throw new ResumeRemoteError(tooLarge);
  }

  const { error } = await supabase.storage.from(RESUME_DOCS_BUCKET).upload(args.path, args.bytes, {
    contentType: RESUME_DOCX_CONTENT_TYPE,
    upsert: false,
  });
  throwOnError(error, "Could not upload resume file.");
}

export async function listResumes(userId: string): Promise<Resume[]> {
  const owner = assertUserId(userId);
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", owner)
    .order("updated_at", { ascending: false });
  throwOnError(error, "Could not load resumes.");

  try {
    return (data ?? []).map((row) => parseResumeRow(row));
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load resumes.");
  }
}

/**
 * Shared create path for a brand-new resume lineage: store the immutable
 * original bytes, store the bookmarked **working** copy, insert the resume row
 * (with its frozen import ledger) + version 1 (with `extracted_structure`),
 * then point `active_version_id` at that version. Fully rolls back storage +
 * rows on error. Used by upload (`upload`), duplicate (`duplicate`), and
 * Save as new (`tailor`).
 *
 * `original_storage_path` uses the digest of those original bytes (§34). The
 * version row's `sha256` starts as that same original digest and is updated in
 * Phase 4F to the **working** bytes hash (§33). The working copy already
 * differs from the original by the 3B bookmarks.
 */
async function createResumeLineage(args: {
  userId: string;
  name: string;
  sourceFilename: string;
  sourceKind: ResumeSourceKind;
  bytes: Uint8Array;
}): Promise<InsertResumeWithOriginalResult> {
  const { userId, name, sourceFilename, sourceKind, bytes } = args;
  const tooLarge = resumeUploadTooLargeMessage(bytes.byteLength);
  if (tooLarge) {
    throw new ResumeRemoteError(tooLarge);
  }
  const resumeId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sha256 = await sha256Hex(bytes);

  let originalPath: string;
  let workingPath: string;
  try {
    originalPath = buildResumeOriginalStoragePath(userId, resumeId, sha256);
    workingPath = buildResumeWorkingStoragePath(userId, resumeId, versionId);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save resume.");
  }

  // §23: parse the package once, before anything is written. Fail closed — a
  // lineage whose block identity is unknown must not reach storage.
  let ingest: Awaited<ReturnType<typeof ingestResumeOriginal>>;
  try {
    ingest = await ingestResumeOriginal(bytes, { versionId });
  } catch {
    throw new ResumeRemoteError("Could not read this resume's structure.");
  }
  const workingTooLarge = resumeUploadTooLargeMessage(ingest.workingBytes.byteLength);
  if (workingTooLarge) {
    throw new ResumeRemoteError(workingTooLarge);
  }

  const uploadedPaths: string[] = [];
  let insertedResumeId: string | null = null;

  try {
    await uploadResumeDocx({ userId, path: originalPath, bytes });
    uploadedPaths.push(originalPath);
    await uploadResumeDocx({ userId, path: workingPath, bytes: ingest.workingBytes });
    uploadedPaths.push(workingPath);

    const resumeDraft: Resume = {
      id: resumeId,
      userId,
      name,
      sourceFilename,
      isDefault: false,
      activeVersionId: null,
      importFactLedger: ingest.importFactLedger,
      createdAtIso: now,
      updatedAtIso: now,
    };
    const versionDraft: ResumeVersion = {
      id: versionId,
      userId,
      resumeId,
      parentVersionId: null,
      versionN: 1,
      label: "Base",
      sourceKind,
      originalStoragePath: originalPath,
      workingStoragePath: workingPath,
      sha256,
      extractedStructure: ingest.extractedStructure,
      pageCountEstimated: null,
      createdAtIso: now,
    };

    const resumeInsert = resumeToRow(resumeDraft);
    const { error: resumeError } = await supabase.from("resumes").insert(resumeInsert);
    throwOnError(resumeError, "Could not save resume.");
    insertedResumeId = resumeId;

    const versionInsert = resumeVersionToRow(versionDraft);
    const { data: versionRow, error: versionError } = await supabase
      .from("resume_versions")
      .insert(versionInsert)
      .select("*")
      .single();
    throwOnError(versionError, "Could not save resume.");

    const { data: updated, error: updateError } = await supabase
      .from("resumes")
      .update({ active_version_id: versionId })
      .eq("id", resumeId)
      .eq("user_id", userId)
      .select("*")
      .single();
    throwOnError(updateError, "Could not save resume.");

    const resume = parseResumeRow(updated);
    const version = parseResumeVersionRow(versionRow);
    assertActiveVersionBelongsToResume(resume, version);
    return { resume, version };
  } catch (err) {
    if (insertedResumeId) {
      await supabase.from("resumes").delete().eq("id", insertedResumeId).eq("user_id", userId);
    }
    await removeResumeDocxPaths(uploadedPaths).catch(() => undefined);
    throw toResumeRemoteError(err, "Could not save resume.");
  }
}

export async function insertResumeWithOriginal(
  input: InsertResumeWithOriginalInput
): Promise<InsertResumeWithOriginalResult> {
  const userId = assertUserId(input.userId);
  const bytes = await toUint8Array(input.bytes);
  const packageError = await validateResumeDocxBytes(bytes);
  if (packageError) {
    throw new ResumeRemoteError(packageError);
  }

  const result = await createResumeLineage({
    userId,
    name: input.name,
    sourceFilename: input.sourceFilename,
    sourceKind: "upload",
    bytes,
  });

  if (input.isDefault) {
    await setDefaultResume(userId, result.resume.id);
    result.resume.isDefault = true;
  }

  return result;
}

/**
 * Duplicate an existing resume into a brand-new lineage (Phase 2D).
 *
 * The copy's original **and** working bytes are the source resume's **current
 * working** bytes (architecture §35: "new original = current working bytes").
 * The new resume is never the default and shares no storage objects with the
 * source, so later edits to either resume cannot affect the other.
 */
export async function duplicateResume(
  userId: string,
  resumeId: string
): Promise<InsertResumeWithOriginalResult> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }
  const sourceResumeId = resumeId.trim().toLowerCase();

  const { data: sourceRow, error: sourceError } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", sourceResumeId)
    .eq("user_id", owner)
    .maybeSingle();
  throwOnError(sourceError, "Could not duplicate resume.");
  if (!sourceRow) {
    throw new ResumeRemoteError("Could not duplicate resume.");
  }

  let source: Resume;
  try {
    source = parseResumeRow(sourceRow);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not duplicate resume.");
  }
  if (!source.activeVersionId) {
    throw new ResumeRemoteError("Could not duplicate resume.");
  }

  let workingPath: string;
  try {
    workingPath = buildResumeWorkingStoragePath(owner, sourceResumeId, source.activeVersionId);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not duplicate resume.");
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(RESUME_DOCS_BUCKET)
    .download(workingPath);
  throwOnError(downloadError, "Could not duplicate resume.");
  if (!blob) {
    throw new ResumeRemoteError("Could not duplicate resume.");
  }
  const bytes = await toUint8Array(blob);

  return createResumeLineage({
    userId: owner,
    name: duplicateResumeName(source.name),
    sourceFilename: source.sourceFilename,
    sourceKind: "duplicate",
    bytes,
  });
}

export type SaveResumeAsNewInput = {
  userId: string;
  sourceResumeId: string;
  /** Flushed working OOXML (0D patcher). Becomes the new lineage's original. */
  bytes: Uint8Array;
  jobTitle?: string;
};

/**
 * Save as new resume (Phase 9B). New `resume_id`; new original = current
 * working bytes. The source row, original object, working object, and
 * `active_version_id` are not written. Never the default. `source_kind` is
 * `tailor`. Caller should keep the source resume open (keep editing current).
 */
export async function saveResumeAsNew(
  input: SaveResumeAsNewInput
): Promise<InsertResumeWithOriginalResult> {
  const owner = assertUserId(input.userId);
  if (!isUuid(input.sourceResumeId)) {
    throw new ResumeRemoteError("Could not save as a new resume.");
  }
  const sourceResumeId = input.sourceResumeId.trim().toLowerCase();
  if (input.bytes.byteLength === 0) {
    throw new ResumeRemoteError("Could not save as a new resume.");
  }

  const { data: sourceRow, error: sourceError } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", sourceResumeId)
    .eq("user_id", owner)
    .maybeSingle();
  throwOnError(sourceError, "Could not save as a new resume.");
  if (!sourceRow) {
    throw new ResumeRemoteError("Could not save as a new resume.");
  }

  let source: Resume;
  try {
    source = parseResumeRow(sourceRow);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save as a new resume.");
  }

  return createResumeLineage({
    userId: owner,
    name: saveAsNewResumeName(source.name, input.jobTitle),
    sourceFilename: source.sourceFilename,
    sourceKind: "tailor",
    bytes: input.bytes,
  });
}

/**
 * Load a single version row (with its `extracted_structure`) for the read-only
 * preview (Phase 4A). Scoped to the owner + resume; returns null when the
 * version is missing (e.g. the resume was deleted under us).
 */
export async function getResumeVersionById(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<ResumeVersion | null> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId) || !isUuid(versionId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }

  const { data, error } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("id", versionId.trim().toLowerCase())
    .eq("resume_id", resumeId.trim().toLowerCase())
    .eq("user_id", owner)
    .maybeSingle();
  throwOnError(error, "Could not load resume preview.");
  if (!data) return null;

  try {
    return parseResumeVersionRow(data);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load resume preview.");
  }
}

/**
 * Download the **immutable original** DOCX for version-1 plaintext (Phase 9C).
 * Never the working `versions/` object.
 */
export async function downloadResumeOriginalDocx(
  userId: string,
  resumeId: string,
  originalStoragePath: string
): Promise<Uint8Array> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Could not load resume document.");
  }
  let path: string;
  try {
    path = assertCanonicalOriginalStoragePath(
      originalStoragePath,
      owner,
      resumeId.trim().toLowerCase()
    );
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load resume document.");
  }

  const { data: blob, error } = await supabase.storage.from(RESUME_DOCS_BUCKET).download(path);
  throwOnError(error, "Could not load resume document.");
  if (!blob) {
    throw new ResumeRemoteError("Could not load resume document.");
  }
  return toUint8Array(blob);
}

/**
 * Download the **working** DOCX for in-memory fail-closed patching (Phase 4D).
 * Does not download the immutable original.
 */
export async function downloadResumeWorkingDocx(
  userId: string,
  workingStoragePath: string
): Promise<Uint8Array> {
  const owner = assertUserId(userId);
  try {
    assertWorkingCopyUploadPath(workingStoragePath, owner);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load resume document.");
  }

  const { data: blob, error } = await supabase.storage
    .from(RESUME_DOCS_BUCKET)
    .download(workingStoragePath);
  throwOnError(error, "Could not load resume document.");
  if (!blob) {
    throw new ResumeRemoteError("Could not load resume document.");
  }
  return toUint8Array(blob);
}

export type UpdateWorkingVersionInput = {
  userId: string;
  resumeId: string;
  versionId: string;
  workingStoragePath: string;
  bytes: Uint8Array;
  graph: ResumeStructureGraph;
  previousStructure: ResumeExtractedStructure;
  expectedUpdatedAtIso?: string;
};

export type UpdateWorkingVersionResult = {
  version: ResumeVersion;
  resumeUpdatedAtIso: string;
  conflict: boolean;
};

/**
 * Overwrite the current working DOCX and persist graph + working hash (Phase 4F).
 * Never writes `original/`. Never goes through `replaceRemotePayload`.
 */
export async function updateWorkingVersion(
  input: UpdateWorkingVersionInput
): Promise<UpdateWorkingVersionResult> {
  const owner = assertUserId(input.userId);
  if (!isUuid(input.resumeId) || !isUuid(input.versionId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }
  const resumeId = input.resumeId.trim().toLowerCase();
  const versionId = input.versionId.trim().toLowerCase();

  try {
    assertWorkingCopyUploadPath(input.workingStoragePath, owner);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save resume.");
  }

  const expectedWorkingPath = buildResumeWorkingStoragePath(owner, resumeId, versionId);
  if (input.workingStoragePath !== expectedWorkingPath) {
    throw new ResumeRemoteError("Could not save resume.");
  }

  const { data: resumeRow, error: resumeError } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", resumeId)
    .eq("user_id", owner)
    .maybeSingle();
  throwOnError(resumeError, "Could not save resume.");
  if (!resumeRow) {
    throw new ResumeRemoteError("Could not save resume.");
  }

  const { data: versionRow, error: versionError } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("id", versionId)
    .eq("resume_id", resumeId)
    .eq("user_id", owner)
    .maybeSingle();
  throwOnError(versionError, "Could not save resume.");
  if (!versionRow) {
    throw new ResumeRemoteError("Could not save resume.");
  }

  let resume: Resume;
  let currentVersion: ResumeVersion;
  try {
    resume = parseResumeRow(resumeRow);
    currentVersion = parseResumeVersionRow(versionRow);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save resume.");
  }

  if (resume.activeVersionId !== currentVersion.id) {
    throw new ResumeRemoteError("Could not save resume.");
  }
  if (currentVersion.workingStoragePath !== expectedWorkingPath) {
    throw new ResumeRemoteError("Could not save resume.");
  }

  const tooLarge = resumeUploadTooLargeMessage(input.bytes.byteLength);
  if (tooLarge) {
    throw new ResumeRemoteError(tooLarge);
  }

  const conflict = Boolean(
    input.expectedUpdatedAtIso && resume.updatedAtIso !== input.expectedUpdatedAtIso
  );

  let extractedStructure: ResumeExtractedStructure;
  let workingSha256: string;
  try {
    extractedStructure = extractedStructureAfterWorkingEdit(input.previousStructure, input.graph);
    workingSha256 = await sha256Hex(input.bytes);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save resume.");
  }

  const rowPatch = workingVersionRowPatch({
    workingSha256,
    extractedStructure,
  });

  const { error: uploadError } = await supabase.storage
    .from(RESUME_DOCS_BUCKET)
    .upload(expectedWorkingPath, input.bytes, {
      contentType: RESUME_DOCX_CONTENT_TYPE,
      upsert: true,
    });
  throwOnError(uploadError, "Could not save resume.");

  const { data: updatedVersionRow, error: updateVersionError } = await supabase
    .from("resume_versions")
    .update({
      sha256: rowPatch.sha256,
      extracted_structure: rowPatch.extracted_structure,
    })
    .eq("id", versionId)
    .eq("resume_id", resumeId)
    .eq("user_id", owner)
    .select("*")
    .single();
  throwOnError(updateVersionError, "Could not save resume.");

  const { data: bumpedResumeRow, error: bumpError } = await supabase
    .from("resumes")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", resumeId)
    .eq("user_id", owner)
    .select("updated_at")
    .single();
  throwOnError(bumpError, "Could not save resume.");

  try {
    const version = parseResumeVersionRow(updatedVersionRow);
    if (version.originalStoragePath !== currentVersion.originalStoragePath) {
      throw new ResumeRemoteError("Could not save resume.");
    }
    const resumeUpdatedAtIso =
      bumpedResumeRow && typeof bumpedResumeRow.updated_at === "string"
        ? bumpedResumeRow.updated_at
        : new Date().toISOString();
    return { version, resumeUpdatedAtIso, conflict };
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save resume.");
  }
}

export async function renameResume(
  userId: string,
  resumeId: string,
  name: string
): Promise<void> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }

  const validationError = validateResumeName(name);
  if (validationError) {
    throw new ResumeRemoteError(validationError);
  }
  const normalized = normalizeResumeName(name);

  const { data, error } = await supabase
    .from("resumes")
    .update({ name: normalized })
    .eq("id", resumeId)
    .eq("user_id", owner)
    .select("id")
    .maybeSingle();
  throwOnError(error, "Could not rename resume.");
  if (!data) {
    throw new ResumeRemoteError("Could not rename resume.");
  }
}

export async function setDefaultResume(userId: string, resumeId: string): Promise<void> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }

  const { error: unsetError } = await supabase
    .from("resumes")
    .update({ is_default: false })
    .eq("user_id", owner)
    .eq("is_default", true);
  throwOnError(unsetError, "Could not update default resume.");

  const { data, error } = await supabase
    .from("resumes")
    .update({ is_default: true })
    .eq("id", resumeId)
    .eq("user_id", owner)
    .select("id")
    .maybeSingle();
  throwOnError(error, "Could not update default resume.");
  if (!data) {
    throw new ResumeRemoteError("Could not update default resume.");
  }
}

export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }

  const storagePaths = await listResumePrefixPaths(owner, resumeId.trim().toLowerCase());

  const { data, error } = await supabase
    .from("resumes")
    .delete()
    .eq("id", resumeId)
    .eq("user_id", owner)
    .select("id");
  throwOnError(error, "Could not delete resume.");
  if (!data || data.length === 0) {
    throw new ResumeRemoteError("Could not delete resume.");
  }

  await removeResumeDocxPaths(storagePaths).catch(() => undefined);
}

export type InsertResumeJobSessionInput = {
  userId: string;
  resumeId: string;
  resumeVersionId: string;
  company?: string;
  jobTitle?: string;
  jobDescriptionText?: string;
  parsedJob?: ResumeJobSession["parsedJob"];
  matchResult?: ResumeJobSession["matchResult"];
  applicationId?: string | null;
};

export type UpdateResumeJobSessionInput = {
  company?: string;
  jobTitle?: string;
  jobDescriptionText?: string;
  resumeVersionId?: string;
  parsedJob?: ResumeJobSession["parsedJob"];
  matchResult?: ResumeJobSession["matchResult"];
  applicationId?: string | null;
};

function throwOnJobSessionUniqueViolation(
  error: { code?: string; message?: string } | null,
  fallback: string
): void {
  if (!error) return;
  if (error.code === "23505") {
    throw new ResumeRemoteError("An active job session already exists for this resume.", {
      code: error.code,
    });
  }
  throwOnError(error, fallback);
}

/** Active (non-archived) JD session for a resume. Null if none. */
export async function getActiveResumeJobSession(
  userId: string,
  resumeId: string
): Promise<ResumeJobSession | null> {
  const owner = assertUserId(userId);
  if (!isUuid(resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }

  const { data, error } = await supabase
    .from("resume_job_sessions")
    .select("*")
    .eq("user_id", owner)
    .eq("resume_id", resumeId)
    .is("archived_at", null)
    .maybeSingle();
  throwOnError(error, "Could not load job session.");

  if (!data) return null;
  try {
    const session = parseResumeJobSessionRow(data);
    assertJobSessionBelongsToResume(session, resumeId, owner);
    return session;
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load job session.");
  }
}

export async function insertResumeJobSession(
  input: InsertResumeJobSessionInput
): Promise<ResumeJobSession> {
  const owner = assertUserId(input.userId);
  if (!isUuid(input.resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }
  if (!isUuid(input.resumeVersionId)) {
    throw new ResumeRemoteError("Invalid resume version id.");
  }
  const jobDescriptionText = input.jobDescriptionText ?? "";
  if (jobDescriptionText.length > RESUME_JOB_DESCRIPTION_MAX_CHARS) {
    throw new ResumeRemoteError("Job description is too long.");
  }

  const now = new Date().toISOString();
  const draft: ResumeJobSession = {
    id: crypto.randomUUID(),
    userId: owner,
    resumeId: input.resumeId.trim().toLowerCase(),
    resumeVersionId: input.resumeVersionId.trim().toLowerCase(),
    company: input.company ?? "",
    jobTitle: input.jobTitle ?? "",
    jobDescriptionText,
    parsedJob: input.parsedJob ?? null,
    matchResult: input.matchResult ?? null,
    retention: "until_replaced",
    applicationId: input.applicationId ?? null,
    archivedAtIso: null,
    createdAtIso: now,
    updatedAtIso: now,
  };

  let row;
  try {
    row = resumeJobSessionToRow(draft);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save job session.");
  }

  const { data, error } = await supabase
    .from("resume_job_sessions")
    .insert(row)
    .select("*")
    .single();
  throwOnJobSessionUniqueViolation(error, "Could not save job session.");

  try {
    const session = parseResumeJobSessionRow(data);
    assertJobSessionBelongsToResume(session, draft.resumeId, owner);
    return session;
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save job session.");
  }
}

export async function updateResumeJobSession(
  userId: string,
  sessionId: string,
  patch: UpdateResumeJobSessionInput
): Promise<ResumeJobSession> {
  const owner = assertUserId(userId);
  if (!isUuid(sessionId)) {
    throw new ResumeRemoteError("Invalid job session id.");
  }
  if (patch.jobDescriptionText !== undefined) {
    if (typeof patch.jobDescriptionText !== "string") {
      throw new ResumeRemoteError("Invalid job description.");
    }
    if (patch.jobDescriptionText.length > RESUME_JOB_DESCRIPTION_MAX_CHARS) {
      throw new ResumeRemoteError("Job description is too long.");
    }
  }
  if (patch.resumeVersionId !== undefined && !isUuid(patch.resumeVersionId)) {
    throw new ResumeRemoteError("Invalid resume version id.");
  }
  if (patch.applicationId !== undefined && patch.applicationId !== null && !isUuid(patch.applicationId)) {
    throw new ResumeRemoteError("Invalid application id.");
  }

  const update: Record<string, unknown> = {};
  if (patch.company !== undefined) update.company = patch.company;
  if (patch.jobTitle !== undefined) update.job_title = patch.jobTitle;
  if (patch.jobDescriptionText !== undefined) update.job_description_text = patch.jobDescriptionText;
  if (patch.resumeVersionId !== undefined) {
    update.resume_version_id = patch.resumeVersionId.trim().toLowerCase();
  }
  if (patch.parsedJob !== undefined) update.parsed_job = patch.parsedJob;
  if (patch.matchResult !== undefined) update.match_result = patch.matchResult;
  if (patch.applicationId !== undefined) update.application_id = patch.applicationId;

  const { data, error } = await supabase
    .from("resume_job_sessions")
    .update(update)
    .eq("id", sessionId)
    .eq("user_id", owner)
    .is("archived_at", null)
    .select("*")
    .maybeSingle();
  throwOnError(error, "Could not save job session.");
  if (!data) {
    throw new ResumeRemoteError("Could not save job session.");
  }

  try {
    return parseResumeJobSessionRow(data);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save job session.");
  }
}

export type InsertResumeSuggestionInput = {
  userId: string;
  sessionId: string;
  resumeId: string;
  resumeVersionId: string;
  suggestion: ResumeSuggestion;
};

/** Persist one grounded suggestion row (Phase 6F). Does not go through AppPayload. */
export async function insertResumeSuggestion(
  input: InsertResumeSuggestionInput
): Promise<ResumeSuggestionRecord> {
  const owner = assertUserId(input.userId);
  if (!isUuid(input.sessionId)) {
    throw new ResumeRemoteError("Invalid job session id.");
  }
  if (!isUuid(input.resumeId)) {
    throw new ResumeRemoteError("Invalid resume id.");
  }
  if (!isUuid(input.resumeVersionId)) {
    throw new ResumeRemoteError("Invalid resume version id.");
  }
  const sessionId = input.sessionId.trim().toLowerCase();
  const resumeId = input.resumeId.trim().toLowerCase();
  const resumeVersionId = input.resumeVersionId.trim().toLowerCase();

  const now = new Date().toISOString();
  const draft: ResumeSuggestionRecord = {
    ...input.suggestion,
    userId: owner,
    sessionId,
    resumeId,
    resumeVersionId,
    createdAtIso: now,
    updatedAtIso: now,
  };

  let row;
  try {
    row = resumeSuggestionToRow(draft);
    assertSuggestionBelongsToSession(draft, sessionId, resumeId, owner);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save suggestion.");
  }

  const { data, error } = await supabase
    .from("resume_suggestions")
    .insert(row)
    .select("*")
    .single();
  throwOnError(error, "Could not save suggestion.");

  try {
    const record = parseResumeSuggestionRow(data);
    assertSuggestionBelongsToSession(record, sessionId, resumeId, owner);
    return record;
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save suggestion.");
  }
}

export async function updateResumeSuggestion(
  userId: string,
  record: ResumeSuggestionRecord
): Promise<ResumeSuggestionRecord> {
  const owner = assertUserId(userId);
  if (record.userId !== owner) {
    throw new ResumeRemoteError("Could not save suggestion.");
  }
  if (!isUuid(record.id)) {
    throw new ResumeRemoteError("Invalid suggestion id.");
  }

  let row;
  try {
    row = resumeSuggestionToRow(record);
    assertSuggestionBelongsToSession(record, record.sessionId, record.resumeId, owner);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save suggestion.");
  }

  const { created_at: _createdAt, id, user_id, ...update } = row;
  void _createdAt;

  const { data, error } = await supabase
    .from("resume_suggestions")
    .update(update)
    .eq("id", id)
    .eq("user_id", user_id)
    .select("*")
    .single();
  throwOnError(error, "Could not save suggestion.");

  try {
    const saved = parseResumeSuggestionRow(data);
    assertSuggestionBelongsToSession(saved, record.sessionId, record.resumeId, owner);
    return saved;
  } catch (err) {
    throw toResumeRemoteError(err, "Could not save suggestion.");
  }
}

export async function listResumeSuggestions(
  userId: string,
  sessionId: string
): Promise<ResumeSuggestionRecord[]> {
  const owner = assertUserId(userId);
  if (!isUuid(sessionId)) {
    throw new ResumeRemoteError("Invalid job session id.");
  }
  const session = sessionId.trim().toLowerCase();

  const { data, error } = await supabase
    .from("resume_suggestions")
    .select("*")
    .eq("user_id", owner)
    .eq("session_id", session)
    .order("created_at", { ascending: true });
  throwOnError(error, "Could not load suggestions.");

  const rows = data ?? [];
  try {
    return rows.map((row) => {
      const record = parseResumeSuggestionRow(row);
      if (record.sessionId !== session || record.userId !== owner) {
        throw new ResumeRemoteError("Could not load suggestions.");
      }
      return record;
    });
  } catch (err) {
    throw toResumeRemoteError(err, "Could not load suggestions.");
  }
}

/** Soft-archive the active session (Replace / Reset). Does not touch the resume document. */
export async function archiveResumeJobSession(
  userId: string,
  sessionId: string
): Promise<ResumeJobSession> {
  const owner = assertUserId(userId);
  if (!isUuid(sessionId)) {
    throw new ResumeRemoteError("Invalid job session id.");
  }

  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("resume_job_sessions")
    .update({ archived_at: archivedAt })
    .eq("id", sessionId)
    .eq("user_id", owner)
    .is("archived_at", null)
    .select("*")
    .maybeSingle();
  throwOnError(error, "Could not archive job session.");
  if (!data) {
    throw new ResumeRemoteError("Could not archive job session.");
  }

  try {
    return parseResumeJobSessionRow(data);
  } catch (err) {
    throw toResumeRemoteError(err, "Could not archive job session.");
  }
}
