import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  RESUME_DOCX_CONTENT_TYPE,
  RESUME_UPLOAD_ERRORS,
  RESUME_UPLOAD_MAX_BYTES,
  RESUME_UPLOAD_MAX_UNCOMPRESSED_BYTES,
  readDeclaredUncompressedBytes,
  resumeNameFromFilename,
  validateResumeDocxBytes,
  validateResumeFileMetadata,
} from "./resumeFileValidation";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");

const CENTRAL_FILE_SIGNATURE = [0x50, 0x4b, 0x01, 0x02] as const;

async function buildZip(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, contents] of Object.entries(entries)) {
    zip.file(name, contents);
  }
  return zip.generateAsync({ type: "uint8array" });
}

async function buildMinimalDocx(extra: Record<string, string> = {}): Promise<Uint8Array> {
  return buildZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document/>",
    ...extra,
  });
}

/** Overwrite the declared uncompressed size of every central-directory entry. */
function withDeclaredUncompressedSize(zipBytes: Uint8Array, declared: number): Uint8Array {
  const out = zipBytes.slice();
  for (let i = 0; i + 30 <= out.length; i++) {
    const isCentralHeader = CENTRAL_FILE_SIGNATURE.every((byte, offset) => out[i + offset] === byte);
    if (!isCentralHeader) continue;
    out[i + 24] = declared & 0xff;
    out[i + 25] = (declared >>> 8) & 0xff;
    out[i + 26] = (declared >>> 16) & 0xff;
    out[i + 27] = (declared >>> 24) & 0xff;
  }
  return out;
}

/** Rename an entry in place (same byte length) so JSZip cannot sanitize the traversal path. */
function renameZipEntry(zipBytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error("rename requires equal-length names");
  const out = zipBytes.slice();
  const fromBytes = new TextEncoder().encode(from);
  const toBytes = new TextEncoder().encode(to);
  for (let i = 0; i + fromBytes.length <= out.length; i++) {
    let matches = true;
    for (let j = 0; j < fromBytes.length; j++) {
      if (out[i + j] !== fromBytes[j]) {
        matches = false;
        break;
      }
    }
    if (matches) out.set(toBytes, i);
  }
  return out;
}

describe("validateResumeFileMetadata", () => {
  it("accepts a .docx with the Word MIME type or an empty browser type", () => {
    expect(
      validateResumeFileMetadata({
        name: "current-resume.docx",
        size: 40_000,
        type: RESUME_DOCX_CONTENT_TYPE,
      })
    ).toBeNull();
    expect(
      validateResumeFileMetadata({ name: "Current Resume.DOCX", size: 40_000, type: "" })
    ).toBeNull();
  });

  it("rejects macro-enabled Word files by extension and by MIME type", () => {
    expect(
      validateResumeFileMetadata({ name: "resume.docm", size: 40_000, type: "" })
    ).toBe(RESUME_UPLOAD_ERRORS.macroEnabled);
    expect(
      validateResumeFileMetadata({
        name: "resume.docx",
        size: 40_000,
        type: "application/vnd.ms-word.document.macroEnabled.12",
      })
    ).toBe(RESUME_UPLOAD_ERRORS.macroEnabled);
  });

  it("rejects other extensions and mismatched MIME types", () => {
    expect(validateResumeFileMetadata({ name: "resume.pdf", size: 40_000, type: "application/pdf" })).toBe(
      RESUME_UPLOAD_ERRORS.notDocx
    );
    expect(validateResumeFileMetadata({ name: "resume.doc", size: 40_000, type: "" })).toBe(
      RESUME_UPLOAD_ERRORS.notDocx
    );
    expect(validateResumeFileMetadata({ name: ".docx", size: 40_000, type: "" })).toBe(
      RESUME_UPLOAD_ERRORS.notDocx
    );
    expect(
      validateResumeFileMetadata({ name: "resume.docx", size: 40_000, type: "text/plain" })
    ).toBe(RESUME_UPLOAD_ERRORS.notDocx);
  });

  it("rejects empty and oversized files", () => {
    expect(validateResumeFileMetadata({ name: "resume.docx", size: 0, type: "" })).toBe(
      RESUME_UPLOAD_ERRORS.empty
    );
    expect(
      validateResumeFileMetadata({
        name: "resume.docx",
        size: RESUME_UPLOAD_MAX_BYTES + 1,
        type: RESUME_DOCX_CONTENT_TYPE,
      })
    ).toBe(RESUME_UPLOAD_ERRORS.tooLarge);
  });
});

describe("readDeclaredUncompressedBytes", () => {
  it("sums the central-directory sizes of a real package", async () => {
    const bytes = await buildMinimalDocx();
    expect(readDeclaredUncompressedBytes(bytes)).toBe(
      "<Types/>".length + "<w:document/>".length
    );
  });

  it("returns null when there is no readable central directory", () => {
    expect(readDeclaredUncompressedBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });
});

describe("validateResumeDocxBytes", () => {
  it("accepts the public geometry canary", async () => {
    const bytes = new Uint8Array(readFileSync(geometryCanaryPath));
    await expect(validateResumeDocxBytes(bytes)).resolves.toBeNull();
  });

  it("rejects buffers that are not zip archives", async () => {
    await expect(validateResumeDocxBytes(new TextEncoder().encode("not a zip"))).resolves.toBe(
      RESUME_UPLOAD_ERRORS.unreadable
    );
    await expect(validateResumeDocxBytes(new Uint8Array(0))).resolves.toBe(
      RESUME_UPLOAD_ERRORS.empty
    );
  });

  it("rejects a zip that is missing required OOXML parts", async () => {
    const bytes = await buildZip({ "word/document.xml": "<w:document/>" });
    await expect(validateResumeDocxBytes(bytes)).resolves.toBe(RESUME_UPLOAD_ERRORS.unreadable);
  });

  it("rejects zip-slip entry names", async () => {
    const packaged = await buildMinimalDocx({ "xx/evil.txt": "nope" });
    const malicious = renameZipEntry(packaged, "xx/evil.txt", "../evil.txt");
    await expect(validateResumeDocxBytes(malicious)).resolves.toBe(
      RESUME_UPLOAD_ERRORS.unreadable
    );
  });

  it("rejects macro payloads even when the extension is .docx", async () => {
    const bytes = await buildMinimalDocx({ "word/vbaProject.bin": "macro" });
    await expect(validateResumeDocxBytes(bytes)).resolves.toBe(
      RESUME_UPLOAD_ERRORS.macroEnabled
    );
  });

  it("rejects a declared expansion above the uncompressed cap before inflating", async () => {
    const packaged = await buildMinimalDocx();
    const bomb = withDeclaredUncompressedSize(
      packaged,
      RESUME_UPLOAD_MAX_UNCOMPRESSED_BYTES + 1
    );
    await expect(validateResumeDocxBytes(bomb)).resolves.toBe(
      RESUME_UPLOAD_ERRORS.expandsTooMuch
    );
  });

  it("rejects files above the compressed cap", async () => {
    const oversized = new Uint8Array(RESUME_UPLOAD_MAX_BYTES + 1);
    oversized.set([0x50, 0x4b, 0x03, 0x04]);
    await expect(validateResumeDocxBytes(oversized)).resolves.toBe(
      RESUME_UPLOAD_ERRORS.tooLarge
    );
  });
});

describe("resumeNameFromFilename", () => {
  it("drops the extension and any path prefix", () => {
    expect(resumeNameFromFilename("current-resume.docx")).toBe("current-resume");
    expect(resumeNameFromFilename("Resume 2026.DOCX")).toBe("Resume 2026");
    expect(resumeNameFromFilename("/Users/me/Documents/base.docx")).toBe("base");
  });

  it("falls back to a nonempty name", () => {
    expect(resumeNameFromFilename(".docx")).toBe("Resume");
    expect(resumeNameFromFilename("   ")).toBe("Resume");
  });
});
