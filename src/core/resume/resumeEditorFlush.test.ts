import { readFileSync } from "node:fs";
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
import { flushBlockPlaintextByBookmark } from "./resumeEditorFlush";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const mixedCanaryPath = join(repoRoot, "fixtures/resume/public/mixed-runs-canary.docx");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");

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

describe("flushBlockPlaintextByBookmark", () => {
  it("patches a bookmarked paragraph through the 0D patcher", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const names = injected.blockMap.map((entry) => entry.bookmarkName);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    expect(index).toBeGreaterThanOrEqual(0);
    const bookmarkName = names[index];
    expect(bookmarkName).toMatch(/^pa_/);

    const result = await flushBlockPlaintextByBookmark(
      injected.bytes,
      bookmarkName!,
      GEOMETRY_PATCHED
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nextPlains = await listParagraphPlaintexts(result.bytes);
    expect(nextPlains).toContain(GEOMETRY_PATCHED);
    expect(nextPlains).not.toContain(GEOMETRY_PLAIN);
  });

  it("returns mixed_rpr without mutating bytes when a flush would flatten", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const snapshot = new Uint8Array(original);
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(MIXED_PLAIN);
    expect(index).toBeGreaterThanOrEqual(0);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toBeDefined();

    const before = new Uint8Array(injected.bytes);
    const result = await flushBlockPlaintextByBookmark(
      injected.bytes,
      bookmarkName!,
      MIXED_MERGE_FAIL
    );

    expect(result).toMatchObject({ ok: false, code: "mixed_rpr" });
    expect(injected.bytes).toEqual(before);
    expect(original).toEqual(snapshot);
    expect(await listParagraphPlaintexts(injected.bytes)).toContain(MIXED_PLAIN);
  });

  it("keeps bold/italic/hyperlink when only an unformatted word changes", async () => {
    const original = new Uint8Array(readFileSync(mixedCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(MIXED_PLAIN);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toBeDefined();

    const result = await flushBlockPlaintextByBookmark(
      injected.bytes,
      bookmarkName!,
      MIXED_LED_TO_RAN
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const xml = await decodeDocument(result.bytes);
    const mixedXml = listParagraphXml(xml).find((para) => para.includes("Ran ")) ?? "";
    expect(mixedXml).toContain("Ran ");
    expect(mixedXml).not.toContain(">Led <");
    expect(mixedXml).toMatch(/<w:b\/>[\s\S]*<w:t>TeamAlpha<\/w:t>/);
    expect(mixedXml).toContain("<w:i/>");
    expect(mixedXml).toContain('r:id="rId5"');
  });

  it("flushes a whole-sentence deletion through the same bookmark patcher", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const injected = await injectResumeBookmarks(original);
    const plains = await listParagraphPlaintexts(injected.bytes);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    const bookmarkName = injected.blockMap[index]?.bookmarkName;
    expect(bookmarkName).toMatch(/^pa_/);

    const next = "TARGET_GEOMETRY_BULLET: ";
    const result = await flushBlockPlaintextByBookmark(injected.bytes, bookmarkName!, next);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nextPlains = await listParagraphPlaintexts(result.bytes);
    expect(nextPlains).toContain(next);
    expect(nextPlains).not.toContain(GEOMETRY_PLAIN);
  });

  it("rejects a non-pa_ bookmark name without calling a flatten path", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const result = await flushBlockPlaintextByBookmark(original, "other_name", "x");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
