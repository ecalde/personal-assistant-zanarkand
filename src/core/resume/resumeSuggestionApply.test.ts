import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MIXED_RUN_FAIL_MESSAGE } from "./resumeBlockEdit";
import {
  DOCUMENT_XML_PATH,
  getDocxPart,
  loadDocxBuffer,
} from "./resumeZip";
import { injectResumeBookmarks } from "./resumeOoxmlWrite";
import { listParagraphPlaintexts, listParagraphXml } from "./resumeOoxmlPatch";
import {
  applyAcceptedSuggestionToOoxml,
  bookmarkNameForSuggestionBlock,
  currentPlaintextForSuggestionBlock,
  originalTextHashMatchesCurrent,
  RESUME_SUGGESTION_STALE_MESSAGE,
} from "./resumeSuggestionApply";
import { hashResumeBlockText } from "./resumeSuggestions";
import type { ResumeStructureBlock } from "./resumeModel";

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

async function bookmarkedBlocks(path: string): Promise<{
  bytes: Uint8Array;
  blocks: ResumeStructureBlock[];
  plains: string[];
}> {
  const original = new Uint8Array(readFileSync(path));
  const injected = await injectResumeBookmarks(original);
  const plains = await listParagraphPlaintexts(injected.bytes);
  const blocks: ResumeStructureBlock[] = injected.blockMap.map((entry, order) => ({
    order,
    text: plains[order] ?? "",
    blockId: entry.blockId,
    bookmarkName: entry.bookmarkName,
    runs: [
      {
        text: plains[order] ?? "",
        bold: false,
        italic: false,
        underline: false,
        font: null,
        sizePt: null,
        hyperlinkRelId: null,
      },
    ],
  }));
  return { bytes: injected.bytes, blocks, plains };
}

describe("currentPlaintextForSuggestionBlock", () => {
  it("returns the matching block text by id", async () => {
    const { blocks, plains } = await bookmarkedBlocks(geometryCanaryPath);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    const target = blocks[index]!;
    expect(currentPlaintextForSuggestionBlock(blocks, target.blockId!)).toBe(GEOMETRY_PLAIN);
    expect(currentPlaintextForSuggestionBlock(blocks, "missing-block")).toBeNull();
  });
});

describe("bookmarkNameForSuggestionBlock", () => {
  it("resolves the pa_ bookmark for the source block id, not by paragraph text", async () => {
    const { blocks, plains } = await bookmarkedBlocks(geometryCanaryPath);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    expect(index).toBeGreaterThanOrEqual(0);
    const target = blocks[index];
    expect(target?.blockId).toBeTruthy();
    expect(bookmarkNameForSuggestionBlock(blocks, target!.blockId!)).toBe(target!.bookmarkName);

    const other = blocks.find((block, i) => i !== index && block.blockId);
    expect(other).toBeDefined();
    expect(bookmarkNameForSuggestionBlock(blocks, other!.blockId!)).toBe(other!.bookmarkName);
    expect(bookmarkNameForSuggestionBlock(blocks, other!.blockId!)).not.toBe(target!.bookmarkName);
    expect(bookmarkNameForSuggestionBlock(blocks, "missing-block")).toBeNull();
    expect(bookmarkNameForSuggestionBlock(blocks, "")).toBeNull();
  });
});

describe("applyAcceptedSuggestionToOoxml", () => {
  it("patches the bookmarked geometry bullet and leaves other paragraphs unchanged", async () => {
    const { bytes, blocks, plains } = await bookmarkedBlocks(geometryCanaryPath);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    const bookmarkName = bookmarkNameForSuggestionBlock(blocks, blocks[index]!.blockId!);
    expect(bookmarkName).toMatch(/^pa_/);

    const currentPlaintext = plains[index]!;
    const originalTextHash = await hashResumeBlockText(currentPlaintext);
    const beforeXml = listParagraphXml(await decodeDocument(bytes));
    const snapshot = new Uint8Array(bytes);
    const result = await applyAcceptedSuggestionToOoxml({
      docxBytes: bytes,
      bookmarkName: bookmarkName!,
      proposedText: GEOMETRY_PATCHED,
      originalTextHash,
      currentPlaintext,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytes).toEqual(snapshot);

    const nextPlains = await listParagraphPlaintexts(result.bytes);
    expect(nextPlains[index]).toBe(GEOMETRY_PATCHED);
    expect(nextPlains.filter((_, i) => i !== index)).toEqual(
      plains.filter((_, i) => i !== index)
    );

    const afterXml = listParagraphXml(await decodeDocument(result.bytes));
    expect(afterXml.length).toBe(beforeXml.length);
    for (let i = 0; i < beforeXml.length; i += 1) {
      if (i === index) continue;
      expect(afterXml[i]).toBe(beforeXml[i]);
    }
  });

  it("keeps bold, italic, and hyperlink r:id when Accept changes an unformatted word", async () => {
    const { bytes, blocks, plains } = await bookmarkedBlocks(mixedCanaryPath);
    const index = plains.indexOf(MIXED_PLAIN);
    const bookmarkName = bookmarkNameForSuggestionBlock(blocks, blocks[index]!.blockId!);
    expect(bookmarkName).toBeDefined();

    const beforeXml = listParagraphXml(await decodeDocument(bytes));
    const result = await applyAcceptedSuggestionToOoxml({
      docxBytes: bytes,
      bookmarkName: bookmarkName!,
      proposedText: MIXED_LED_TO_RAN,
      originalTextHash: await hashResumeBlockText(MIXED_PLAIN),
      currentPlaintext: MIXED_PLAIN,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const afterXml = listParagraphXml(await decodeDocument(result.bytes));
    expect(afterXml[index - 1]).toBe(beforeXml[index - 1]);
    expect(afterXml[index + 1]).toBe(beforeXml[index + 1]);

    const mixedXml = afterXml[index] ?? "";
    expect(mixedXml).toContain("Ran ");
    expect(mixedXml).not.toContain(">Led <");
    expect(mixedXml).toMatch(/<w:b\/>[\s\S]*<w:t>TeamAlpha<\/w:t>/);
    expect(mixedXml).toContain("<w:i/>");
    expect(mixedXml).toContain('r:id="rId5"');
  });

  it("returns blocked_formatting without mutating bytes when Accept would flatten mixed runs", async () => {
    const { bytes, blocks, plains } = await bookmarkedBlocks(mixedCanaryPath);
    const index = plains.indexOf(MIXED_PLAIN);
    const bookmarkName = bookmarkNameForSuggestionBlock(blocks, blocks[index]!.blockId!);
    const snapshot = new Uint8Array(bytes);

    const result = await applyAcceptedSuggestionToOoxml({
      docxBytes: bytes,
      bookmarkName: bookmarkName!,
      proposedText: MIXED_MERGE_FAIL,
      originalTextHash: await hashResumeBlockText(MIXED_PLAIN),
      currentPlaintext: MIXED_PLAIN,
    });

    expect(result).toEqual({
      ok: false,
      code: "blocked_formatting",
      message: MIXED_RUN_FAIL_MESSAGE,
    });
    expect(bytes).toEqual(snapshot);
    expect(await listParagraphPlaintexts(bytes)).toContain(MIXED_PLAIN);
  });

  it("does not apply via document-wide plaintext search when the bookmark is missing", async () => {
    const original = new Uint8Array(readFileSync(geometryCanaryPath));
    const snapshot = new Uint8Array(original);
    const result = await applyAcceptedSuggestionToOoxml({
      docxBytes: original,
      bookmarkName: "pa_missing-bookmark",
      proposedText: GEOMETRY_PATCHED,
      originalTextHash: await hashResumeBlockText(GEOMETRY_PLAIN),
      currentPlaintext: GEOMETRY_PLAIN,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("blocked_formatting");
    expect(original).toEqual(snapshot);
    expect(await listParagraphPlaintexts(original)).toContain(GEOMETRY_PLAIN);
    expect(await listParagraphPlaintexts(original)).not.toContain(GEOMETRY_PATCHED);
  });

  it("does not patch when originalTextHash does not match current paragraph text", async () => {
    const { bytes, blocks, plains } = await bookmarkedBlocks(geometryCanaryPath);
    const index = plains.indexOf(GEOMETRY_PLAIN);
    const bookmarkName = bookmarkNameForSuggestionBlock(blocks, blocks[index]!.blockId!);
    const snapshot = new Uint8Array(bytes);
    const originalTextHash = await hashResumeBlockText(GEOMETRY_PLAIN);
    const editedPlaintext = `${GEOMETRY_PLAIN} extra`;

    expect(
      await originalTextHashMatchesCurrent({
        originalTextHash,
        currentPlaintext: GEOMETRY_PLAIN,
      })
    ).toBe(true);
    expect(
      await originalTextHashMatchesCurrent({
        originalTextHash,
        currentPlaintext: editedPlaintext,
      })
    ).toBe(false);

    const result = await applyAcceptedSuggestionToOoxml({
      docxBytes: bytes,
      bookmarkName: bookmarkName!,
      proposedText: GEOMETRY_PATCHED,
      originalTextHash,
      currentPlaintext: editedPlaintext,
    });

    expect(result).toEqual({
      ok: false,
      code: "stale",
      message: RESUME_SUGGESTION_STALE_MESSAGE,
    });
    expect(bytes).toEqual(snapshot);
    expect(await listParagraphPlaintexts(bytes)).toContain(GEOMETRY_PLAIN);
    expect(await listParagraphPlaintexts(bytes)).not.toContain(GEOMETRY_PATCHED);
  });
});
