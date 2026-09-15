/**
 * Deterministic `.docx` upload validation (architecture §17, §41).
 * Every check runs in the browser before any byte reaches Supabase Storage.
 */

import { loadDocxBuffer, ResumeZipError } from "./resumeZip";

export const RESUME_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const RESUME_UPLOAD_MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

export const RESUME_DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Some browsers report an empty type for `.docx`; the ZIP/OOXML checks below are the real gate. */
export const RESUME_UPLOAD_ALLOWED_TYPES = [RESUME_DOCX_CONTENT_TYPE, ""] as const;

const MACRO_CONTENT_TYPE = "application/vnd.ms-word.document.macroEnabled.12";
const MACRO_PART_SUFFIX = "vbaproject.bin";
const DOCX_EXTENSION = ".docx";
const MACRO_EXTENSION = ".docm";

export const RESUME_UPLOAD_ERRORS = {
  notDocx: "Choose a Word .docx file.",
  macroEnabled: "Macro-enabled Word files are not supported. Save the file as .docx and try again.",
  empty: "A Word .docx file is required.",
  tooLarge: "Resume must be 8 MB or smaller.",
  unreadable: "This Word file could not be read.",
  expandsTooMuch: "This Word file expands to too much data to open safely.",
} as const;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_MIN_LENGTH = 22;
const CENTRAL_FILE_HEADER_LENGTH = 46;
const MAX_ZIP_COMMENT_LENGTH = 0xffff;
const ZIP64_SIZE_SENTINEL = 0xffffffff;

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(bytes: Uint8Array): number | null {
  const earliest = Math.max(0, bytes.length - (EOCD_MIN_LENGTH + MAX_ZIP_COMMENT_LENGTH));
  for (let offset = bytes.length - EOCD_MIN_LENGTH; offset >= earliest; offset--) {
    if (readU32(bytes, offset) === EOCD_SIGNATURE) return offset;
  }
  return null;
}

/**
 * Sum of the uncompressed sizes declared in the ZIP central directory, or `null` when the
 * directory cannot be read (including Zip64, whose sizes live in an extra field we do not parse).
 * Reading the declaration first means a zip bomb is rejected before anything is inflated.
 */
export function readDeclaredUncompressedBytes(bytes: Uint8Array): number | null {
  if (bytes.length < EOCD_MIN_LENGTH) return null;
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd === null) return null;

  const entryCount = readU16(bytes, eocd + 10);
  let cursor = readU32(bytes, eocd + 16);
  let total = 0;

  for (let index = 0; index < entryCount; index++) {
    if (cursor + CENTRAL_FILE_HEADER_LENGTH > bytes.length) return null;
    if (readU32(bytes, cursor) !== CENTRAL_FILE_SIGNATURE) return null;

    const uncompressed = readU32(bytes, cursor + 24);
    if (uncompressed === ZIP64_SIZE_SENTINEL) return null;
    total += uncompressed;

    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    cursor += CENTRAL_FILE_HEADER_LENGTH + nameLength + extraLength + commentLength;
  }

  return total;
}

/** Name, extension, MIME, and size checks. Returns a user-facing message or `null` when valid. */
export function validateResumeFileMetadata(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  const name = file.name.trim().toLowerCase();
  const contentType = file.type.trim();

  if (name.endsWith(MACRO_EXTENSION) || contentType === MACRO_CONTENT_TYPE) {
    return RESUME_UPLOAD_ERRORS.macroEnabled;
  }
  if (!name.endsWith(DOCX_EXTENSION) || name === DOCX_EXTENSION) {
    return RESUME_UPLOAD_ERRORS.notDocx;
  }
  if (!(RESUME_UPLOAD_ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    return RESUME_UPLOAD_ERRORS.notDocx;
  }
  if (file.size <= 0) return RESUME_UPLOAD_ERRORS.empty;
  if (file.size > RESUME_UPLOAD_MAX_BYTES) return RESUME_UPLOAD_ERRORS.tooLarge;
  return null;
}

/**
 * ZIP magic, zip-slip, required OOXML parts, macro payloads, and expansion cap.
 * Returns a user-facing message or `null` when the package may be uploaded.
 */
export async function validateResumeDocxBytes(bytes: Uint8Array): Promise<string | null> {
  if (bytes.byteLength === 0) return RESUME_UPLOAD_ERRORS.empty;
  if (bytes.byteLength > RESUME_UPLOAD_MAX_BYTES) return RESUME_UPLOAD_ERRORS.tooLarge;

  const declared = readDeclaredUncompressedBytes(bytes);
  if (declared === null) return RESUME_UPLOAD_ERRORS.unreadable;
  if (declared > RESUME_UPLOAD_MAX_UNCOMPRESSED_BYTES) {
    return RESUME_UPLOAD_ERRORS.expandsTooMuch;
  }

  let docx;
  try {
    docx = await loadDocxBuffer(bytes);
  } catch (err) {
    if (err instanceof ResumeZipError) return RESUME_UPLOAD_ERRORS.unreadable;
    throw err;
  }

  let inflated = 0;
  for (const entry of docx.entries) {
    if (entry.name.toLowerCase().endsWith(MACRO_PART_SUFFIX)) {
      return RESUME_UPLOAD_ERRORS.macroEnabled;
    }
    inflated += entry.data.byteLength;
  }
  if (inflated > RESUME_UPLOAD_MAX_UNCOMPRESSED_BYTES) {
    return RESUME_UPLOAD_ERRORS.expandsTooMuch;
  }

  return null;
}

/** Library display name from the upload filename; the original filename is stored separately. */
export function resumeNameFromFilename(filename: string): string {
  const base = filename.trim().split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.toLowerCase().endsWith(DOCX_EXTENSION)
    ? base.slice(0, -DOCX_EXTENSION.length)
    : base;
  const name = withoutExtension.trim();
  return name.length > 0 ? name : "Resume";
}
