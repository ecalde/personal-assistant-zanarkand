/**
 * Block-level plaintext diff vs version 1 (Phase 9C).
 *
 * Version 1 wording is the **immutable original** aligned to the frozen
 * ingest `blockMap`. Autosave overwrites `extracted_structure.graph` on the
 * same version row, so that live graph is never the baseline.
 *
 * Display is paragraph identity (`blockId`) plus plaintext. Run-level diffs
 * stay inside the OOXML patcher.
 */

import { alignImportBlocksWithBlockMap, ResumeFactsError } from "./resumeFacts";
import type { ResumeBlockMapEntry, ResumeStructureBlock } from "./resumeModel";
import { documentPlaintextFromParagraphs } from "./resumeUnicode";

export class ResumeDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeDiffError";
  }
}

export const RESUME_BLOCK_DIFF_KINDS = ["changed", "added", "removed"] as const;

export type ResumeBlockDiffKind = (typeof RESUME_BLOCK_DIFF_KINDS)[number];

export type ResumeBlockDiff = {
  blockId: string;
  kind: ResumeBlockDiffKind;
  baseText: string;
  currentText: string;
};

function nfc(text: string): string {
  return text.normalize("NFC");
}

/**
 * Map version-1 paragraph plaintext onto stable bookmark ids using the ingest
 * block map. Refuses to guess when paragraph count and map length disagree.
 */
export function versionOnePlaintextByBlockId(
  originalParagraphTexts: readonly string[],
  blockMap: readonly ResumeBlockMapEntry[]
): Readonly<Record<string, string>> {
  const nfcLines = documentPlaintextFromParagraphs(originalParagraphTexts).lines.map(
    (line) => line.text
  );
  let aligned;
  try {
    aligned = alignImportBlocksWithBlockMap(nfcLines, blockMap);
  } catch (err) {
    if (err instanceof ResumeFactsError) {
      throw new ResumeDiffError("Could not align the original document with this resume.");
    }
    throw err;
  }
  const byId: Record<string, string> = {};
  for (const block of aligned) {
    byId[block.blockId] = block.text;
  }
  return byId;
}

/**
 * Changed / added / removed paragraphs vs version 1. Current blocks without a
 * `blockId` are skipped (cannot be listed). Comparison is NFC plaintext only.
 */
export function diffResumeBlocksAgainstVersionOne(
  baseByBlockId: Readonly<Record<string, string>>,
  currentBlocks: readonly Pick<ResumeStructureBlock, "blockId" | "text">[]
): ResumeBlockDiff[] {
  const currentById = new Map<string, string>();
  const currentOrder: string[] = [];
  for (const block of currentBlocks) {
    if (!block.blockId) continue;
    if (!currentById.has(block.blockId)) currentOrder.push(block.blockId);
    currentById.set(block.blockId, nfc(block.text));
  }

  const diffs: ResumeBlockDiff[] = [];
  for (const blockId of currentOrder) {
    const currentText = currentById.get(blockId) ?? "";
    if (!Object.prototype.hasOwnProperty.call(baseByBlockId, blockId)) {
      diffs.push({ blockId, kind: "added", baseText: "", currentText });
      continue;
    }
    const baseText = nfc(baseByBlockId[blockId] ?? "");
    if (baseText !== currentText) {
      diffs.push({ blockId, kind: "changed", baseText, currentText });
    }
  }

  for (const blockId of Object.keys(baseByBlockId)) {
    if (currentById.has(blockId)) continue;
    diffs.push({
      blockId,
      kind: "removed",
      baseText: nfc(baseByBlockId[blockId] ?? ""),
      currentText: "",
    });
  }

  return diffs;
}

export function resumeBlockDiffCountLabel(count: number): string {
  if (count === 0) return "No paragraph changes vs version 1.";
  if (count === 1) return "1 paragraph differs from version 1.";
  return `${count} paragraphs differ from version 1.`;
}
