import JSZip from "jszip";

export const DOCUMENT_XML_PATH = "word/document.xml";
export const CONTENT_TYPES_PATH = "[Content_Types].xml";

export class ResumeZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeZipError";
  }
}

export type DocxEntry = {
  name: string;
  data: Uint8Array;
  dir: boolean;
  date: Date;
  unixPermissions: number | null;
  dosPermissions: number | null;
};

export type LoadedDocx = {
  entries: readonly DocxEntry[];
};

const ZIP_MAGIC = [0x50, 0x4b] as const;

function asBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];
}

/** Reject zip-slip and absolute/drive paths. JSZip may sanitize `name` but keep `unsafeOriginalName`. */
export function isUnsafeZipEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized === ".") return true;
  if (normalized.startsWith("/")) return true;
  if (/^[a-zA-Z]:/.test(normalized)) return true;
  const trimmed = normalized.replace(/\/+$/, "");
  if (!trimmed) return true;
  const parts = trimmed.split("/");
  return parts.some((part) => part === ".." || part === "");
}

function assertSafeNames(...names: Array<string | undefined>): void {
  for (const name of names) {
    if (name !== undefined && isUnsafeZipEntryName(name)) {
      throw new ResumeZipError("Unsafe zip entry path");
    }
  }
}

function unixPermissionsOf(file: JSZip.JSZipObject): number | null {
  return typeof file.unixPermissions === "number" ? file.unixPermissions : null;
}

export async function loadDocxBuffer(input: Uint8Array | ArrayBuffer): Promise<LoadedDocx> {
  const bytes = asBytes(input);
  if (!looksLikeZip(bytes)) {
    throw new ResumeZipError("Not a zip archive");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    throw new ResumeZipError("Not a zip archive");
  }

  const entries: DocxEntry[] = [];
  for (const file of Object.values(zip.files)) {
    assertSafeNames(file.name, file.unsafeOriginalName);
    if (file.dir) {
      entries.push({
        name: file.name,
        data: new Uint8Array(0),
        dir: true,
        date: file.date,
        unixPermissions: unixPermissionsOf(file),
        dosPermissions: file.dosPermissions,
      });
      continue;
    }
    const data = await file.async("uint8array");
    entries.push({
      name: file.name,
      data,
      dir: false,
      date: file.date,
      unixPermissions: unixPermissionsOf(file),
      dosPermissions: file.dosPermissions,
    });
  }

  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has(DOCUMENT_XML_PATH) || !names.has(CONTENT_TYPES_PATH)) {
    throw new ResumeZipError("Not a Word document package");
  }

  return { entries };
}

export function getDocxPart(docx: LoadedDocx, path: string): Uint8Array {
  const entry = docx.entries.find((item) => item.name === path && !item.dir);
  if (!entry) {
    throw new ResumeZipError(`Missing part: ${path}`);
  }
  return entry.data;
}

export async function writeDocxBuffer(docx: LoadedDocx): Promise<Uint8Array> {
  const zip = new JSZip();
  const ordered = [...docx.entries].sort((a, b) => {
    if (a.name === CONTENT_TYPES_PATH && b.name !== CONTENT_TYPES_PATH) return -1;
    if (b.name === CONTENT_TYPES_PATH && a.name !== CONTENT_TYPES_PATH) return 1;
    return 0;
  });

  for (const entry of ordered) {
    assertSafeNames(entry.name);
    const shared = {
      date: entry.date,
      compression: "DEFLATE" as const,
      compressionOptions: { level: 6 },
      unixPermissions: entry.unixPermissions ?? undefined,
      dosPermissions: entry.dosPermissions ?? undefined,
    };
    if (entry.dir) {
      zip.file(entry.name, null, { ...shared, dir: true });
      continue;
    }
    zip.file(entry.name, entry.data, { ...shared, binary: true, dir: false });
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
