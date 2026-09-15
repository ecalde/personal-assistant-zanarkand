import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  DOCUMENT_XML_PATH,
  getDocxPart,
  isUnsafeZipEntryName,
  loadDocxBuffer,
  ResumeZipError,
  writeDocxBuffer,
} from "./resumeZip";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const roundtripPath = join(repoRoot, "fixtures/resume/public/geometry-canary.roundtrip.docx");

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  return buf;
}

function u32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** STORE-only zip so the entry name is preserved (JSZip may sanitize `..` on write). */
function storeZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const local = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.data,
    ]);
    locals.push(local);
    const central = concat([
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

describe("isUnsafeZipEntryName", () => {
  it("rejects parent-segment and absolute paths", () => {
    expect(isUnsafeZipEntryName("../evil.txt")).toBe(true);
    expect(isUnsafeZipEntryName("word/../../etc/passwd")).toBe(true);
    expect(isUnsafeZipEntryName("/tmp/x")).toBe(true);
    expect(isUnsafeZipEntryName("C:/Windows/x")).toBe(true);
    expect(isUnsafeZipEntryName("word/document.xml")).toBe(false);
    expect(isUnsafeZipEntryName("[Content_Types].xml")).toBe(false);
    expect(isUnsafeZipEntryName("word/")).toBe(false);
  });
});

describe("loadDocxBuffer / writeDocxBuffer", () => {
  it("rejects non-zip buffers", async () => {
    await expect(loadDocxBuffer(new Uint8Array([0, 1, 2, 3, 4]))).rejects.toMatchObject({
      name: "ResumeZipError",
      message: "Not a zip archive",
    });
    await expect(loadDocxBuffer(new TextEncoder().encode("not a zip"))).rejects.toBeInstanceOf(
      ResumeZipError
    );
  });

  it("rejects path traversal entries", async () => {
    const malicious = storeZip([{ name: "../evil.txt", data: new TextEncoder().encode("nope") }]);
    await expect(loadDocxBuffer(malicious)).rejects.toMatchObject({
      name: "ResumeZipError",
      message: "Unsafe zip entry path",
    });
  });

  it("keeps word/document.xml byte-identical after identity rezip of the public geometry canary", async () => {
    const input = new Uint8Array(readFileSync(geometryCanaryPath));
    const loaded = await loadDocxBuffer(input);
    const originalXml = getDocxPart(loaded, DOCUMENT_XML_PATH);
    const output = await writeDocxBuffer(loaded);
    const reloaded = await loadDocxBuffer(output);
    expect(getDocxPart(reloaded, DOCUMENT_XML_PATH)).toEqual(originalXml);

    const inputNames = new Set(loaded.entries.map((entry) => entry.name));
    const outputNames = new Set(reloaded.entries.map((entry) => entry.name));
    for (const name of inputNames) {
      expect(outputNames.has(name)).toBe(true);
    }
  });

  it("writes geometry-canary.roundtrip.docx for Microsoft Word verification", async () => {
    const input = new Uint8Array(readFileSync(geometryCanaryPath));
    const output = await writeDocxBuffer(await loadDocxBuffer(input));
    mkdirSync(dirname(roundtripPath), { recursive: true });
    writeFileSync(roundtripPath, output);
    expect(readFileSync(roundtripPath).length).toBeGreaterThan(0);
  });

  it("copies every part without rewriting XML text", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const loaded = await loadDocxBuffer(bytes);
    expect(new TextDecoder().decode(getDocxPart(loaded, DOCUMENT_XML_PATH))).toBe("<w:document/>");
    const written = await writeDocxBuffer(loaded);
    const round = await loadDocxBuffer(written);
    expect(new TextDecoder().decode(getDocxPart(round, DOCUMENT_XML_PATH))).toBe("<w:document/>");
  });
});
