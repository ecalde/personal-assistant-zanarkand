/**
 * Honest job-match coverage presentation (Phase 5E).
 *
 * Architecture §31 / ADR-014 / RES-ATS-001: named coverage bars, a missing
 * required list, parseability warnings, and the disclosure sentence. There is
 * no overall "ATS Score" and no vendor pass/fail claim.
 *
 * Architecture §24 / RES-MATCH-003: on-page unverified terms are labeled.
 * They are coverage of the working document, not imported evidence.
 *
 * Analyze runs the 5C parser and 5D matcher. Working-copy mentions are
 * classified in memory only — the frozen import ledger is not written back.
 */

import {
  buildDocumentMentionIndex,
  classifyMentionsAgainstLedger,
  type FactSourceBlock,
} from "./resumeFacts";
import { parseJobDescription } from "./resumeJobParse";
import { matchJobDescription } from "./resumeMatch";
import type {
  DocumentMention,
  MatchResult,
  ParsedJobDescription,
  RequirementMatchStatus,
  ResumeAtsWarning,
  ResumeExtractedStructure,
  ResumeFactLedger,
  ResumeStructureBlock,
  ResumeStructureGraph,
} from "./resumeModel";

/** Architecture §31 — exact disclosure copy. */
export const RESUME_COVERAGE_DISCLOSURE =
  "Job match coverage and parseability checks from Zanarkand. This is not an employer’s ATS score and does not predict whether a system will rank or reject you.";

export const RESUME_COVERAGE_HEURISTIC_CAPTION =
  "Coverage percentages are a Zanarkand heuristic, not an employer ATS score.";

export const ON_PAGE_UNVERIFIED_LABEL = "On this document (unverified)";

export const REQUIREMENT_MATCH_STATUS_LABELS: Record<RequirementMatchStatus, string> = {
  explicit: "On this document (imported or verified)",
  semantic_supported: "Supported (related wording)",
  on_page_unverified: ON_PAGE_UNVERIFIED_LABEL,
  uncertain: "Uncertain — not treated as evidence",
  absent: "Not on this document",
  contradicted: "Conflicts with imported facts",
};

const FORBIDDEN_COVERAGE_COPY = [
  /ats score\s*:\s*\d/i,
  /\batsScore\b/,
  /passes greenhouse/i,
  /hiredscore/i,
];

export type CoverageBarView = {
  id: string;
  label: string;
  ratio: number;
  count: number;
  total: number;
  detail: string;
};

export type CoverageListItem = {
  requirementId: string;
  text: string;
  status: RequirementMatchStatus;
  statusLabel: string;
};

export type ResumeCoverageView = {
  disclosure: string;
  heuristicCaption: string;
  bars: CoverageBarView[];
  semanticSupportedCount: number;
  missingRequired: CoverageListItem[];
  uncertain: CoverageListItem[];
  onPageUnverified: CoverageListItem[];
  contradicted: CoverageListItem[];
  parseabilityWarnings: ResumeAtsWarning[];
};

export type AnalyzeResumeJobCoverageInput = {
  jobDescriptionText: string;
  company?: string;
  jobTitle?: string;
  importLedger: ResumeFactLedger;
  mentionIndex: readonly DocumentMention[];
  firstSeenVersionId: string;
};

export type AnalyzeResumeJobCoverageResult = {
  parsedJob: ParsedJobDescription;
  matchResult: MatchResult;
};

export function mentionIndexFromWorkingBlocks(
  blocks: readonly ResumeStructureBlock[]
): DocumentMention[] {
  const source: FactSourceBlock[] = [];
  for (const block of blocks) {
    if (!block.blockId) continue;
    source.push({ blockId: block.blockId, text: block.text.normalize("NFC") });
  }
  return buildDocumentMentionIndex(source);
}

/** Prefer the working graph (last saved wording); fall back to the stored index. */
export function mentionsForCoverageAnalysis(
  structure: ResumeExtractedStructure
): DocumentMention[] {
  if (structure.graph && structure.graph.blocks.length > 0) {
    return mentionIndexFromWorkingBlocks(structure.graph.blocks);
  }
  return [...structure.mentionIndex];
}

/**
 * Coverage of the editor pane must follow **draft** wording, not the last
 * flushed baseline. An empty pending-flush queue can still leave draft ahead
 * of baseline (in-flight React vs OOXML). Indexing baseline here is how typed
 * Kubernetes stayed Missing after Saved.
 */
export function editorBlocksForCoverageAnalyze(input: {
  draftBlocks?: readonly ResumeStructureBlock[] | null;
  baselineBlocks?: readonly ResumeStructureBlock[] | null;
  persistedBlocks?: readonly ResumeStructureBlock[] | null;
}): ResumeStructureBlock[] {
  if (input.draftBlocks && input.draftBlocks.length > 0) return [...input.draftBlocks];
  if (input.baselineBlocks && input.baselineBlocks.length > 0) return [...input.baselineBlocks];
  return [...(input.persistedBlocks ?? [])];
}

/**
 * Overlay live contentEditable plaintext onto graph blocks for mention
 * indexing only. Does not rewrite runs (fail-closed patching stays on flush).
 */
export function blocksWithLivePlaintext(
  blocks: readonly ResumeStructureBlock[],
  liveByBlockId: Readonly<Record<string, string>>
): ResumeStructureBlock[] {
  if (Object.keys(liveByBlockId).length === 0) return [...blocks];
  return blocks.map((block) => {
    if (!block.blockId) return block;
    const live = liveByBlockId[block.blockId];
    if (live === undefined || live === block.text) return block;
    return { ...block, text: live };
  });
}

function mentionKey(mention: DocumentMention): string {
  return `${mention.blockId}|${mention.type}|${mention.normalized}`;
}

/**
 * Union mention indexes from several working-copy views. Saved + live draft
 * must both count; Open-only mentions are included only when they are the
 * sole source. Duplicate keys keep the later source.
 */
export function mergeMentionIndexesForCoverage(
  sources: readonly (readonly DocumentMention[] | ResumeStructureGraph | null | undefined)[]
): DocumentMention[] {
  const byKey = new Map<string, DocumentMention>();
  for (const source of sources) {
    if (!source) continue;
    const mentions =
      "blocks" in source ? mentionIndexFromWorkingBlocks(source.blocks) : source;
    for (const mention of mentions) {
      byKey.set(mentionKey(mention), mention);
    }
  }
  return [...byKey.values()];
}

function nonemptyGraph(
  graph: ResumeStructureGraph | null | undefined
): ResumeStructureGraph | null {
  if (!graph || graph.blocks.length === 0) return null;
  return graph;
}

/** Stable reading-order fingerprint so we can detect a stale editor snapshot. */
export function graphPlaintextFingerprint(graph: ResumeStructureGraph | null | undefined): string {
  const blocks = graph?.blocks;
  if (!blocks || blocks.length === 0) return "";
  return blocks.map((block) => `${block.blockId ?? ""}:${block.text.normalize("NFC")}`).join("\n");
}

/**
 * Choose the working-copy graph Analyze should index.
 *
 * Prefer the live editor graph when it actually diverged from Open. A parent
 * `workingGraph` that is still the Open snapshot must not shadow a newer
 * post-autosave version row (5E verification: Saved Kubernetes stayed Missing).
 * The frozen import ledger is not consulted here.
 */
export function selectGraphForCoverageAnalyze(input: {
  openSnapshot?: ResumeExtractedStructure | null;
  workingGraph?: ResumeStructureGraph | null;
  savedSnapshot?: ResumeExtractedStructure | null;
}): ResumeStructureGraph | null {
  const working = nonemptyGraph(input.workingGraph);
  const saved = nonemptyGraph(input.savedSnapshot?.graph);
  const opened = nonemptyGraph(input.openSnapshot?.graph);
  const openFp = graphPlaintextFingerprint(opened);
  const workingFp = graphPlaintextFingerprint(working);
  const savedFp = graphPlaintextFingerprint(saved);

  // Any graph that diverged from Open beats an Open-equal editor snapshot.
  if (saved && savedFp !== openFp && (!working || workingFp === openFp)) {
    return saved;
  }
  if (working && workingFp !== openFp) {
    return working;
  }
  return working ?? saved ?? opened;
}

/**
 * Analyze must read the **current working copy**, not the graph fetched when
 * the resume was opened. After a saved bullet edit, `workingGraph` (editor)
 * or `savedSnapshot` (version row after autosave) is newer than `openSnapshot`.
 * The frozen import ledger is not part of this structure.
 */
export function structureForCoverageAnalyze(input: {
  openSnapshot?: ResumeExtractedStructure | null;
  workingGraph?: ResumeStructureGraph | null;
  savedSnapshot?: ResumeExtractedStructure | null;
}): ResumeExtractedStructure {
  const saved = input.savedSnapshot ?? null;
  const opened = input.openSnapshot ?? null;
  const graph = selectGraphForCoverageAnalyze(input);
  const base = saved ?? opened ?? { mentionIndex: [] };

  if (graph && graph.blocks.length > 0) {
    return {
      mentionIndex: mergeMentionIndexesForCoverage([
        graph,
        nonemptyGraph(input.workingGraph),
        nonemptyGraph(input.savedSnapshot?.graph),
      ]),
      graph,
      ...(base.blockMap ? { blockMap: base.blockMap } : {}),
      ...(base.atsWarnings ? { atsWarnings: base.atsWarnings } : {}),
    };
  }
  return base;
}

/**
 * In-memory parse + match for Analyze. Does not mutate `importLedger` and
 * does not persist. JD text is untrusted data and is never logged.
 */
export function analyzeResumeJobCoverage(
  input: AnalyzeResumeJobCoverageInput
): AnalyzeResumeJobCoverageResult {
  const parsedJob = parseJobDescription(input.jobDescriptionText, {
    company: input.company,
    jobTitle: input.jobTitle,
  });
  const classified = classifyMentionsAgainstLedger(input.importLedger, input.mentionIndex, {
    firstSeenVersionId: input.firstSeenVersionId,
  });
  const matchResult = matchJobDescription({
    parsedJob,
    ledger: classified,
    mentionIndex: input.mentionIndex,
  });
  return { parsedJob, matchResult };
}

export function buildResumeCoverageView(
  parsedJob: ParsedJobDescription,
  matchResult: MatchResult,
  atsWarnings: readonly ResumeAtsWarning[] = []
): ResumeCoverageView {
  const byId = new Map(parsedJob.requirements.map((requirement) => [requirement.id, requirement]));
  const item = (requirementId: string, status: RequirementMatchStatus): CoverageListItem | null => {
    const requirement = byId.get(requirementId);
    if (!requirement) return null;
    return {
      requirementId,
      text: requirement.text,
      status,
      statusLabel: REQUIREMENT_MATCH_STATUS_LABELS[status],
    };
  };

  const coverage = matchResult.coverage;
  const view: ResumeCoverageView = {
    disclosure: RESUME_COVERAGE_DISCLOSURE,
    heuristicCaption: RESUME_COVERAGE_HEURISTIC_CAPTION,
    bars: [
      {
        id: "required-explicit",
        label: "Required-term explicit coverage",
        ratio: coverage.requiredExplicitCoverage,
        count: coverage.requiredExplicitCount,
        total: coverage.requiredTotal,
        detail: countDetail(coverage.requiredExplicitCount, coverage.requiredTotal),
      },
      {
        id: "preferred-explicit",
        label: "Preferred-term explicit coverage",
        ratio: coverage.preferredExplicitCoverage,
        count: coverage.preferredExplicitCount,
        total: coverage.preferredTotal,
        detail: countDetail(coverage.preferredExplicitCount, coverage.preferredTotal),
      },
      {
        id: "responsibility-alignment",
        label: "Responsibility alignment (explicit or related wording)",
        ratio: coverage.responsibilityAlignment,
        count: coverage.responsibilityAlignedCount,
        total: coverage.responsibilityTotal,
        detail: countDetail(coverage.responsibilityAlignedCount, coverage.responsibilityTotal),
      },
    ],
    semanticSupportedCount: coverage.semanticSupportedCount,
    missingRequired: listItems(coverage.missingRequiredIds, "absent", item),
    uncertain: listItems(coverage.uncertainIds, "uncertain", item),
    onPageUnverified: listItems(coverage.onPageUnverifiedIds, "on_page_unverified", item),
    contradicted: listItems(coverage.contradictedIds, "contradicted", item),
    parseabilityWarnings: [...atsWarnings],
  };
  assertHonestCoverageCopy(JSON.stringify(view));
  return view;
}

export function coverageCopyBlob(view: ResumeCoverageView): string {
  return [
    view.disclosure,
    view.heuristicCaption,
    ...view.bars.map((bar) => `${bar.label} ${bar.detail}`),
    `Related wording matches: ${view.semanticSupportedCount}`,
    ...view.missingRequired.map((row) => row.text),
    ...view.uncertain.map((row) => `${row.text} ${row.statusLabel}`),
    ...view.onPageUnverified.map((row) => `${row.text} ${row.statusLabel}`),
    ...view.contradicted.map((row) => `${row.text} ${row.statusLabel}`),
    ...view.parseabilityWarnings.map((warning) => warning.message),
  ].join("\n");
}

/** Fail closed if presentation copy ever looks like a vendor ATS score. */
export function assertHonestCoverageCopy(text: string): void {
  for (const pattern of FORBIDDEN_COVERAGE_COPY) {
    if (pattern.test(text)) {
      throw new Error("Coverage copy must not claim an ATS score or named-vendor pass.");
    }
  }
}

function countDetail(count: number, total: number): string {
  if (total <= 0) return "0 of 0";
  const percent = Math.round((count / total) * 100);
  return `${count} of ${total} (${percent}%)`;
}

function listItems(
  ids: readonly string[],
  status: RequirementMatchStatus,
  item: (requirementId: string, status: RequirementMatchStatus) => CoverageListItem | null
): CoverageListItem[] {
  const rows: CoverageListItem[] = [];
  for (const id of ids) {
    const row = item(id, status);
    if (row) rows.push(row);
  }
  return rows;
}
