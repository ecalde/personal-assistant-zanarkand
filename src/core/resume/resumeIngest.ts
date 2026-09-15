/**
 * Import-time analysis composition — Phase 3F.
 *
 * Runs the architecture §23 pipeline once, at the moment a new resume lineage
 * is created, and returns everything the two rows need:
 *
 * - the **working** bytes (the original plus Phase 3B `pa_` bookmarks),
 * - the version row's `extracted_structure` (block graph, block map, mention
 *   index, ATS warnings),
 * - the resume row's frozen `imported_source` ledger.
 *
 * Boundaries this module must keep:
 * - The original bytes are read but never rewritten; only the working copy is
 *   bookmarked (§19.2).
 * - The import ledger is frozen from the **original** paragraph text (§20.1,
 *   §23 step 5). The mention index is the working copy's current state and is
 *   coverage material only.
 * - `extracted_structure` holds structure, never document bytes: no base64,
 *   no zip entries. The DOCX lives in the `resume-docs` bucket.
 */

import { analyzeResumeAtsStructure } from "./resumeAtsChecks";
import { readIdentifiedResumeBlockGraph } from "./resumeBlocks";
import {
  alignImportBlocksWithBlockMap,
  buildDocumentMentionIndex,
  extractImportedFacts,
  type FactSourceBlock,
} from "./resumeFacts";
import { injectResumeBookmarks } from "./resumeOoxmlWrite";
import { listParagraphPlaintexts } from "./resumeOoxmlRead";
import { documentPlaintextFromParagraphs } from "./resumeUnicode";
import type {
  ResumeExtractedStructure,
  ResumeFactLedger,
  ResumeStructureBlock,
  ResumeStructureGraph,
} from "./resumeModel";

export class ResumeIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeIngestError";
  }
}

export type ResumeIngestOptions = {
  /** Version 1 of the new lineage; recorded as `firstSeenVersionId`. */
  versionId: string;
  /** Injectable bookmark-name factory for deterministic tests. */
  newBookmarkName?: () => string;
};

export type ResumeIngestResult = {
  /** Bookmarked bytes to store at the version's `working_storage_path`. */
  workingBytes: Uint8Array;
  /** Version row jsonb. */
  extractedStructure: ResumeExtractedStructure;
  /** Resume row jsonb; frozen at import and never rebuilt from working text. */
  importFactLedger: ResumeFactLedger;
  addedBookmarkCount: number;
  reusedBookmarkCount: number;
};

/**
 * Analyze a brand-new lineage's original bytes.
 *
 * Fails closed: if any paragraph ends up without a stable id, or the original
 * paragraph count does not line up with the working copy's block map, we
 * refuse rather than persist a structure whose block ids cannot be trusted.
 */
export async function ingestResumeOriginal(
  originalBytes: Uint8Array | ArrayBuffer,
  options: ResumeIngestOptions
): Promise<ResumeIngestResult> {
  const versionId = options.versionId;
  if (typeof versionId !== "string" || versionId.trim().length === 0) {
    throw new ResumeIngestError("versionId is required to ingest a resume");
  }

  const injection = await injectResumeBookmarks(originalBytes, options.newBookmarkName);
  const identified = await readIdentifiedResumeBlockGraph(injection.bytes);

  if (identified.blocks.length !== injection.blockMap.length) {
    throw new ResumeIngestError("Block map does not cover every paragraph of the working copy");
  }

  const graph: ResumeStructureGraph = { blocks: identified.blocks.map(toStructureBlock) };
  const workingBlocks: FactSourceBlock[] = identified.blocks.map((block) => {
    if (block.blockId === null) {
      throw new ResumeIngestError("Paragraph is missing a stable block id after injection");
    }
    // NFC only: the person's NBSP, tabs and hyphens stay as written (§16.1).
    return { blockId: block.blockId, text: block.text.normalize("NFC") };
  });

  const originalPlaintext = documentPlaintextFromParagraphs(
    await listParagraphPlaintexts(originalBytes)
  );
  const importBlocks = alignImportBlocksWithBlockMap(
    originalPlaintext.lines.map((line) => line.text),
    injection.blockMap
  );

  const importFactLedger = extractImportedFacts(importBlocks, {
    firstSeenVersionId: versionId,
  });
  const atsReport = await analyzeResumeAtsStructure(injection.bytes);

  return {
    workingBytes: injection.bytes,
    extractedStructure: {
      mentionIndex: buildDocumentMentionIndex(workingBlocks),
      graph,
      blockMap: injection.blockMap,
      atsWarnings: atsReport.warnings,
    },
    importFactLedger,
    addedBookmarkCount: injection.addedCount,
    reusedBookmarkCount: injection.reusedCount,
  };
}

/** Explicit projection so only structure fields can reach the jsonb column. */
function toStructureBlock(block: {
  order: number;
  text: string;
  blockId: string | null;
  bookmarkName: string | null;
  runs: readonly {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    font: string | null;
    sizePt: number | null;
    hyperlinkRelId: string | null;
  }[];
}): ResumeStructureBlock {
  return {
    order: block.order,
    text: block.text,
    blockId: block.blockId,
    bookmarkName: block.bookmarkName,
    runs: block.runs.map((run) => ({
      text: run.text,
      bold: run.bold,
      italic: run.italic,
      underline: run.underline,
      font: run.font,
      sizePt: run.sizePt,
      hyperlinkRelId: run.hyperlinkRelId,
    })),
  };
}
