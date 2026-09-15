/**
 * Isolated Resume persistence. Must not go through replaceRemotePayload / payloadFromRows.
 * DOCX bytes live in the private resume-docs bucket; rows live in dedicated RLS tables.
 */

import { supabase } from "./supabaseClient";
import { MapperError, isUuid } from "../core/dbMappers";
import { RESUME_DOCX_CONTENT_TYPE } from "../core/resume/resumeFileValidation";
import {
  duplicateResumeName,
  normalizeResumeName,
  validateResumeName,
} from "../core/resume/resumeLibrary";
import {
  assertActiveVersionBelongsToResume,
  assertResumeOwnerStoragePath,
  buildResumeOriginalStoragePath,
  buildResumeWorkingStoragePath,
  parseResumeRow,
  parseResumeVersionRow,
  resumeToRow,
  resumeVersionToRow,
} from "../core/resume/resumeDbMappers";
import type { Resume, ResumeSourceKind, ResumeVersion } from "../core/resume/resumeModel";

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
    return new ResumeRemoteError(err.message);
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
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  const hashBytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of hashBytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
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
 * Shared create path: upload identical original + working bytes for a brand-new
 * resume lineage, insert the resume row + version 1, then point
 * `active_version_id` at that version. Fully rolls back storage + rows on error.
 * Used by both upload (source_kind `upload`) and duplicate (source_kind `duplicate`).
 */
async function createResumeLineage(args: {
  userId: string;
  name: string;
  sourceFilename: string;
  sourceKind: ResumeSourceKind;
  bytes: Uint8Array;
}): Promise<InsertResumeWithOriginalResult> {
  const { userId, name, sourceFilename, sourceKind, bytes } = args;
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

  const uploadedPaths: string[] = [];
  let insertedResumeId: string | null = null;

  try {
    await uploadResumeDocx({ userId, path: originalPath, bytes });
    uploadedPaths.push(originalPath);
    await uploadResumeDocx({ userId, path: workingPath, bytes });
    uploadedPaths.push(workingPath);

    const resumeDraft: Resume = {
      id: resumeId,
      userId,
      name,
      sourceFilename,
      isDefault: false,
      activeVersionId: null,
      importFactLedger: { facts: [] },
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
      extractedStructure: { mentionIndex: [] },
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
