import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_XML_PATH,
  getDocxPart,
  loadDocxBuffer,
} from "./resumeZip";
import { injectResumeBookmarks } from "./resumeOoxmlWrite";
import { listParagraphPlaintexts, listParagraphXml } from "./resumeOoxmlPatch";
import {
  flushWorkingCopyForDownload,
  resumeWorkingDownloadFilename,
} from "./resumeEditorDownload";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const publicOutDir = join(repoRoot, "fixtures/resume/public/out");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateProductDownloadPath = join(
  repoRoot,
  "fixtures/resume/private/current-resume.product-download.docx"
);

const MIXED_PLAIN =
  "MIXED_RUN_PARAGRAPH: Led TeamAlpha built APIs for ExampleCorp then shipped the batch window.";
const MIXED_LED_TO_RAN =
  "MIXED_RUN_PARAGRAPH: Ran TeamAlpha built APIs for ExampleCorp then shipped the batch window.";
const MIXED_MERGE_FAIL =
  "MIXED_RUN_PARAGRAPH: Directed built APIs for ExampleCorp then shipped the batch window.";
const GEOMETRY_PLAIN =
  "TARGET_GEOMETRY_BULLET: Built REST APIs for inventory sync across warehouse nodes using Python and AWS.";
const GEOMETRY_PATCHED =
  "TARGET_GEOMETRY_BULLET: Wrote REST APIs for inventory sync across warehouse nodes using Python and AWS.";

async function decodeDocument(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(getDocxPart(await loadDocxBuffer(bytes), DOCUMENT_XML_PATH));
}

function minimalSameLengthWordingChange(plain: string): string {
  const match = /[A-Za-z]{5,}/.exec(plain);
  if (!match || match.index === undefined) {
    throw new Error("Private fixture bullet has no 5+ letter word to change");
  }
  const word = match[0];
  const last = word[word.length - 1];
  if (!last) {
    throw new Error("Private fixture bullet has no 5+ letter word to change");
  }
  const replacementLast =
    last === "x" || last === "X" ? (last === "X" ? "Y" : "y") : last === last.toUpperCase() ? "X" : "x";
  return (
    plain.slice(0, match.index) +
    word.slice(0, -1) +
    replacementLast +
    plain.slice(match.index + word.length)
  );
}

function pickPrivateWorkBullet(
  paragraphXml: string[],
  plains: string[]
): { index: number; next: string } {
  for (let i = 0; i < paragraphXml.length; i += 1) {
    const xml = paragraphXml[i];
    const plain = plains[i];
    if (!xml || !plain) continue;
    if (!xml.includes("<w:numPr")) continue;
    const wtCount = xml.match(/<w:t[\s>]/g)?.length ?? 0;
    if (wtCount !== 1) continue;
    if (plain.length < 40) continue;
    if (plains.filter((item) => item === plain).length !== 1) continue;
    const next = minimalSameLengthWordingChange(plain);
    if (next !== plain) return { index: i, next };
  }
  throw new Error("No unique single-run work-experience bullet found in the private fixture");
}

describe("resumeWorkingDownloadFilename", () => {
  it("uses Name-role.docx from the library name and job title", () => {
    expect(resumeWorkingDownloadFilename("Geometry canary", "Backend Engineer")).toBe(
      "Geometry canary-Backend Engineer.docx"
    );
  });

  it("omits the role segment when the job title is empty", () => {
    expect(resumeWorkingDownloadFilename("Geometry canary")).toBe("Geometry canary.docx");
    expect(resumeWorkingDownloadFilename("Geometry canary", "   ")).toBe("Geometry canary.docx");
  });

  it("does not double the .docx suffix on name or role", () => {
    expect(resumeWorkingDownloadFilename("current-resume.docx")).toBe("current-resume.docx");
    expect(resumeWorkingDownloadFilename("current-resume.docx", "Engineer.docx")).toBe(
      "current-resume-Engineer.docx"
    );
  });

  it("strips path separators and illegal filename characters", () => {
    expect(resumeWorkingDownloadFilename("../../secret:name")).toBe("secret-name.docx");
    expect(resumeWorkingDownloadFilename("folder/resume")).toBe("folder-resume.docx");
    expect(resumeWorkingDownloadFilename("Resume", "../../role:title")).toBe("Resume-role-title.docx");
  });

  it("falls back to resume.docx when the name is empty after sanitizing", () => {
    expect(resumeWorkingDownloadFilename("   ")).toBe("resume.docx");
    expect(resumeWorkingDownloadFilename("...")).toBe("resume.docx");
    expect(resumeWorkingDownloadFilename("   ", "Engineer")).toBe("resume-Engineer.docx");
  });
});

describe("flushWorkingCopyForDownload", () => {
  it("patches one known geometry paragraph through the 0D flush helper", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    expect(index).toBeGreaterThanOrEqual(0);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toMatch(/^pa_/);

    const snapshot = new Uint8Array(injected.bytes);
    const result = await flushWorkingCopyForDownload(injected.bytes, [
      { bookmarkName: bookmarkName!, newPlaintext: GEOMETRY_PATCHED },
    ]);

    expect(result.failed).toBe(false);
    expect(injected.bytes).toEqual(snapshot);

    const nextPlains = await listParagraphPlaintexts(result.bytes);
    expect(nextPlains).toContain(GEOMETRY_PATCHED);
    expect(nextPlains).not.toContain(GEOMETRY_PLAIN);
    for (let i = 0; i < plains.length; i += 1) {
      if (plains[i] === GEOMETRY_PLAIN) continue;
      expect(nextPlains[i]).toBe(plains[i]);
    }

    mkdirSync(publicOutDir, { recursive: true });
    writeFileSync(join(publicOutDir, "geometry-canary.product-download.docx"), result.bytes);
  });

  it("keeps mixed-run rPr and hyperlink r:id on the download payload", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(MIXED_PLAIN);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toBeDefined();

    const result = await flushWorkingCopyForDownload(injected.bytes, [
      { bookmarkName: bookmarkName!, newPlaintext: MIXED_LED_TO_RAN },
    ]);
    expect(result.failed).toBe(false);

    const nextPlains = await listParagraphPlaintexts(result.bytes);
    expect(nextPlains).toContain(MIXED_LED_TO_RAN);

    const xml = await decodeDocument(result.bytes);
    const mixedXml = listParagraphXml(xml).find((para) => para.includes("Ran ")) ?? "";
    expect(mixedXml).toContain("Ran ");
    expect(mixedXml).toMatch(/<w:b\/>[\s\S]*<w:t>TeamAlpha<\/w:t>/);
    expect(mixedXml).toContain("<w:i/>");
    expect(mixedXml).toContain('r:id="rId5"');

    mkdirSync(publicOutDir, { recursive: true });
    writeFileSync(join(publicOutDir, "mixed-runs-canary.product-download.docx"), result.bytes);
  });

  it("returns last-good bytes when a pending flush would flatten", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(MIXED_PLAIN);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toBeDefined();

    const before = new Uint8Array(injected.bytes);
    const result = await flushWorkingCopyForDownload(injected.bytes, [
      { bookmarkName: bookmarkName!, newPlaintext: MIXED_MERGE_FAIL },
    ]);

    expect(result.failed).toBe(true);
    expect(result.message).toMatch(/formatting cannot be updated safely/i);
    expect(result.bytes).toEqual(before);
    expect(await listParagraphPlaintexts(result.bytes)).toContain(MIXED_PLAIN);
    expect(await listParagraphPlaintexts(result.bytes)).not.toContain("Directed");
  });

  it("identity-downloads the bookmarked working copy when nothing is pending", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const result = await flushWorkingCopyForDownload(injected.bytes, []);
    expect(result.failed).toBe(false);
    expect(result.bytes).toBe(injected.bytes);
    expect(await listParagraphPlaintexts(result.bytes)).toEqual(
      await listParagraphPlaintexts(injected.bytes)
    );
  });

  it.skipIf(!existsSync(privateCanaryPath))(
    "writes a product-path private download when the gitignored fixture is present",
    async () => {
      if (process.env.RESUME_PRIVATE_FIXTURE === "1" && !existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const original = new Uint8Array(readFileSync(privateCanaryPath));
      const injected = await injectResumeBookmarks(original);
      const xml = await decodeDocument(injected.bytes);
      const parts = listParagraphXml(xml);
      const plains = await listParagraphPlaintexts(injected.bytes);
      const target = pickPrivateWorkBullet(parts, plains);
      const bookmarkName = injected.blockMap[target.index]?.bookmarkName;
      expect(bookmarkName).toMatch(/^pa_/);

      const result = await flushWorkingCopyForDownload(injected.bytes, [
        { bookmarkName: bookmarkName!, newPlaintext: target.next },
      ]);
      expect(result.failed).toBe(false);
      const nextPlains = await listParagraphPlaintexts(result.bytes);
      expect(nextPlains).toContain(target.next);
      expect(nextPlains.filter((plain) => plain === plains[target.index])).toHaveLength(0);

      writeFileSync(privateProductDownloadPath, result.bytes);
      expect(readFileSync(privateProductDownloadPath).length).toBeGreaterThan(0);
    }
  );
});
