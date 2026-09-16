/**
 * Local per-block plaintext edits for the resume preview (Phase 4C).
 *
 * This is **React state only** for applying a paragraph's new plaintext.
 * OOXML flush is Phase 4D; undo/redo is Phase 4E (`resumeEditorHistory.ts`);
 * persisting working bytes is Phase 4F. The algorithm
 * mirrors architecture §18.4 at the *graph/run* layer so the on-screen
 * preview can update without flattening mixed bold/italic/hyperlink runs.
 *
 * Fail closed: if a change would merge distinct `rPr` regions or drop a
 * hyperlink, the block is left unchanged.
 */

import type { ResumeSectionKind } from "./resumeFacts";
import type { ResumeStructureBlock, ResumeStructureRun } from "./resumeModel";

export type BlockEditErrorCode = "mixed_rpr" | "hyperlink" | "not_found";

export type ApplyBlockPlaintextResult =
  | { ok: true; block: ResumeStructureBlock }
  | { ok: false; code: Exclude<BlockEditErrorCode, "not_found">; block: ResumeStructureBlock };

export type ApplyGraphBlockPlaintextResult =
  | { ok: true; blocks: ResumeStructureBlock[] }
  | { ok: false; code: BlockEditErrorCode; blocks: ResumeStructureBlock[] };

const SECTION_KIND_LABELS: Record<ResumeSectionKind, string> = {
  header: "Header",
  profile: "Profile",
  experience: "Work experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  other: "Body",
};

const DEFAULT_ARIA_TEXT_MAX = 80;

/** NFC, strip invisible format chars, fold line breaks — keep NBSP and spaces. */
export function editorInputPlaintext(raw: string): string {
  const folded = raw
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\r\n|[\n\r\u0085\u2028\u2029]/g, " ");
  return folded === "\u00a0" ? "" : folded;
}

export function sectionKindLabel(kind: ResumeSectionKind | undefined): string {
  if (!kind) return "Resume";
  return SECTION_KIND_LABELS[kind];
}

export function truncateForAriaLabel(text: string, max: number = DEFAULT_ARIA_TEXT_MAX): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "empty paragraph";
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/** `aria-label` from section + truncated plaintext (Phase 4C accessibility). */
export function blockEditorAriaLabel(
  sectionLabel: string,
  text: string,
  maxTextLength: number = DEFAULT_ARIA_TEXT_MAX
): string {
  return `${sectionLabel}: ${truncateForAriaLabel(text, maxTextLength)}`;
}

function runFormatKey(run: ResumeStructureRun): string {
  return [
    run.bold ? "b" : "",
    run.italic ? "i" : "",
    run.underline ? "u" : "",
    run.font ?? "",
    run.sizePt === null ? "" : String(run.sizePt),
    run.hyperlinkRelId ?? "",
  ].join("|");
}

function allRunsShareFormat(runs: readonly ResumeStructureRun[]): boolean {
  if (runs.length <= 1) return true;
  const first = runs[0];
  if (!first) return true;
  const key = runFormatKey(first);
  return runs.every((run) => runFormatKey(run) === key);
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffixLength(a: string, b: string, prefixLen: number): number {
  const limit = Math.min(a.length - prefixLen, b.length - prefixLen);
  let i = 0;
  while (i < limit && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

type RunSpan = {
  run: ResumeStructureRun;
  start: number;
  end: number;
};

function runSpans(runs: readonly ResumeStructureRun[]): RunSpan[] {
  const spans: RunSpan[] = [];
  let offset = 0;
  for (const run of runs) {
    const start = offset;
    offset += run.text.length;
    spans.push({ run, start, end: offset });
  }
  return spans;
}

function hyperlinkRelIds(runs: readonly ResumeStructureRun[]): Set<string> {
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.hyperlinkRelId) ids.add(run.hyperlinkRelId);
  }
  return ids;
}

function lostHyperlink(
  before: readonly ResumeStructureRun[],
  after: readonly ResumeStructureRun[]
): boolean {
  const remaining = hyperlinkRelIds(after);
  for (const id of hyperlinkRelIds(before)) {
    if (!remaining.has(id)) return true;
  }
  return false;
}

function blockFromRuns(
  block: ResumeStructureBlock,
  runs: ResumeStructureRun[]
): ResumeStructureBlock {
  const nextRuns = runs.filter((run) => run.text.length > 0);
  return {
    ...block,
    text: nextRuns.map((run) => run.text).join(""),
    runs: nextRuns,
  };
}

function blankRunFrom(template: ResumeStructureRun | undefined, text: string): ResumeStructureRun {
  return {
    text,
    bold: template?.bold ?? false,
    italic: template?.italic ?? false,
    underline: template?.underline ?? false,
    font: template?.font ?? null,
    sizePt: template?.sizePt ?? null,
    hyperlinkRelId: template?.hyperlinkRelId ?? null,
  };
}

function overlappingSpans(spans: readonly RunSpan[], start: number, end: number): RunSpan[] {
  if (start >= end) return [];
  return spans.filter((span) => span.start < end && span.end > start);
}

function insertionSpan(spans: readonly RunSpan[], caret: number): RunSpan | undefined {
  if (spans.length === 0) return undefined;
  if (caret <= 0) return spans[0];
  return spans.find((span) => span.start <= caret - 1 && caret - 1 < span.end) ?? spans[0];
}

function applyMappedRuns(
  runs: readonly ResumeStructureRun[],
  original: string,
  nextText: string
): ResumeStructureRun[] | null {
  const prefixLen = commonPrefixLength(original, nextText);
  const suffixLen = commonSuffixLength(original, nextText, prefixLen);
  const changeStart = prefixLen;
  const changeEnd = original.length - suffixLen;
  const newMiddle = nextText.slice(prefixLen, nextText.length - suffixLen);
  const spans = runSpans(runs);

  if (changeStart === changeEnd) {
    const span = insertionSpan(spans, changeStart);
    if (!span) return [blankRunFrom(undefined, nextText)];
    const local = changeStart - span.start;
    return runs.map((run) =>
      run === span.run
        ? { ...run, text: run.text.slice(0, local) + newMiddle + run.text.slice(local) }
        : run
    );
  }

  const overlapping = overlappingSpans(spans, changeStart, changeEnd);
  if (overlapping.length === 0) return null;

  const keys = new Set(overlapping.map((span) => runFormatKey(span.run)));
  if (overlapping.length === 1) {
    const span = overlapping[0];
    if (!span) return null;
    const localStart = changeStart - span.start;
    const localEnd = changeEnd - span.start;
    return runs.map((run) =>
      run === span.run
        ? { ...run, text: run.text.slice(0, localStart) + newMiddle + run.text.slice(localEnd) }
        : run
    );
  }

  if (keys.size === 1) {
    const first = overlapping[0];
    const last = overlapping[overlapping.length - 1];
    if (!first || !last) return null;
    const firstLocal = changeStart - first.start;
    const lastLocal = changeEnd - last.start;
    const touched = new Set(overlapping.map((span) => span.run));
    return runs.map((run) => {
      if (run === first.run && run === last.run) {
        return {
          ...run,
          text: run.text.slice(0, firstLocal) + newMiddle + run.text.slice(lastLocal),
        };
      }
      if (run === first.run) {
        return { ...run, text: run.text.slice(0, firstLocal) + newMiddle };
      }
      if (run === last.run) {
        return { ...run, text: run.text.slice(lastLocal) };
      }
      if (touched.has(run)) return { ...run, text: "" };
      return run;
    });
  }

  if (newMiddle.length > 0) return null;

  return runs.map((run) => {
    const span = spans.find((item) => item.run === run);
    if (!span || span.end <= changeStart || span.start >= changeEnd) return run;
    const localStart = Math.max(0, changeStart - span.start);
    const localEnd = Math.min(run.text.length, changeEnd - span.start);
    return { ...run, text: run.text.slice(0, localStart) + run.text.slice(localEnd) };
  });
}

/**
 * Replace one block's concatenated run plaintext. Mixed formatting is kept
 * when the change maps onto existing runs; otherwise the original block is
 * returned with `ok: false`.
 */
export function applyBlockPlaintext(
  block: ResumeStructureBlock,
  rawNextText: string
): ApplyBlockPlaintextResult {
  const nextText = editorInputPlaintext(rawNextText);
  if (nextText === block.text) return { ok: true, block };

  if (block.runs.length === 0) {
    return {
      ok: true,
      block: {
        ...block,
        text: nextText,
        runs: nextText.length === 0 ? [] : [blankRunFrom(undefined, nextText)],
      },
    };
  }

  if (allRunsShareFormat(block.runs)) {
    const template = block.runs[0];
    const nextRuns = nextText.length === 0 ? [] : [blankRunFrom(template, nextText)];
    if (lostHyperlink(block.runs, nextRuns)) {
      return { ok: false, code: "hyperlink", block };
    }
    return { ok: true, block: blockFromRuns(block, nextRuns) };
  }

  const mapped = applyMappedRuns(block.runs, block.text, nextText);
  if (mapped === null) {
    return { ok: false, code: "mixed_rpr", block };
  }
  const nextBlock = blockFromRuns(block, mapped);
  if (nextBlock.text !== nextText) {
    return { ok: false, code: "mixed_rpr", block };
  }
  if (lostHyperlink(block.runs, nextBlock.runs)) {
    return { ok: false, code: "hyperlink", block };
  }
  return { ok: true, block: nextBlock };
}

/** Apply a plaintext edit to one block in a graph. Untouched blocks keep identity. */
export function applyGraphBlockPlaintext(
  blocks: readonly ResumeStructureBlock[],
  blockId: string,
  rawNextText: string
): ApplyGraphBlockPlaintextResult {
  const index = blocks.findIndex((block) => block.blockId === blockId);
  if (index < 0) {
    return { ok: false, code: "not_found", blocks: [...blocks] };
  }
  const current = blocks[index];
  if (!current) {
    return { ok: false, code: "not_found", blocks: [...blocks] };
  }
  const result = applyBlockPlaintext(current, rawNextText);
  if (!result.ok) {
    return { ok: false, code: result.code, blocks: [...blocks] };
  }
  if (result.block === current) {
    return { ok: true, blocks: [...blocks] };
  }
  const next = blocks.slice();
  next[index] = result.block;
  return { ok: true, blocks: next };
}

export const MIXED_RUN_FAIL_MESSAGE =
  "This paragraph's formatting cannot be updated safely. Try a smaller change that stays inside the existing bold, italic, or hyperlink ranges, or edit in Microsoft Word.";

export type ResumeBlockPaintNode =
  | { kind: "placeholder"; text: "\u00a0" }
  | { kind: "run"; run: ResumeStructureRun };

/**
 * Host painting model for one contentEditable paragraph. Empty blocks keep a
 * single NBSP so the line box remains; they must not assume a non-empty run.
 *
 * React must not own these as VDOM children of `contentEditable`. A native
 * large deletion removes the span nodes; later React `removeChild` throws and
 * blanks the page while the already-scheduled OOXML flush can still save.
 */
export function resumeBlockPaintNodes(block: ResumeStructureBlock): ResumeBlockPaintNode[] {
  if (block.runs.length === 0) {
    return [{ kind: "placeholder", text: "\u00a0" }];
  }
  return block.runs.map((run) => ({ kind: "run", run }));
}

/**
 * Analog of the browser crash: React tries to remove a run node the user
 * already deleted from the contentEditable host.
 */
export function reconcileContentEditableChild(hostStillHasChild: boolean): void {
  if (!hostStillHasChild) {
    throw new Error(
      "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
    );
  }
}
