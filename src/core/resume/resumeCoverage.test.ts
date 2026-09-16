import { describe, expect, it } from "vitest";
import {
  ON_PAGE_UNVERIFIED_LABEL,
  RESUME_COVERAGE_DISCLOSURE,
  analyzeResumeJobCoverage,
  assertHonestCoverageCopy,
  blocksWithLivePlaintext,
  buildResumeCoverageView,
  coverageCopyBlob,
  editorBlocksForCoverageAnalyze,
  mentionIndexFromWorkingBlocks,
  mentionsForCoverageAnalysis,
  mergeMentionIndexesForCoverage,
  selectGraphForCoverageAnalyze,
  structureForCoverageAnalyze,
} from "./resumeCoverage";
import {
  classifyMentionsAgainstLedger,
  extractImportedFacts,
  type FactSourceBlock,
} from "./resumeFacts";
import { parseJobDescription, requirementMentioning } from "./resumeJobParse";
import type { ResumeFactLedger, ResumeStructureBlock } from "./resumeModel";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_A_BULLET = "b-role-a-bullet";

/**
 * Synthetic two-role resume — not Edwin's private file. Kubernetes is absent
 * on import (architecture Case B / §24). REST APIs supports the RESTful alias.
 */
const IMPORT_BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 \u2013 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 \u2013 2020" },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: "b-skills", text: "Python, REST APIs, SQL, Docker" },
];

const SYNTHETIC_JD = `
Must have Kubernetes.
Must have Python.
Nice to have Terraform.
Responsibilities
- Build RESTful services for warehouse nodes
`.trim();

function importedLedger(): ResumeFactLedger {
  return extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
}

function cloneLedger(ledger: ResumeFactLedger): ResumeFactLedger {
  return structuredClone(ledger);
}

function workingBlocks(textById: Record<string, string> = {}): ResumeStructureBlock[] {
  return IMPORT_BLOCKS.map((block, order) => ({
    order,
    text: textById[block.blockId] ?? block.text,
    blockId: block.blockId,
    bookmarkName: `pa_${block.blockId}`,
    runs: [{ text: textById[block.blockId] ?? block.text, bold: false, italic: false, underline: false, font: null, sizePt: null, hyperlinkRelId: null }],
  }));
}

describe("RESUME_COVERAGE_DISCLOSURE", () => {
  it("matches architecture §31 exactly", () => {
    expect(RESUME_COVERAGE_DISCLOSURE).toBe(
      "Job match coverage and parseability checks from Zanarkand. This is not an employer’s ATS score and does not predict whether a system will rank or reject you."
    );
  });
});

describe("analyzeResumeJobCoverage", () => {
  it("lists required Kubernetes as missing against an import ledger that has none", () => {
    const ledger = importedLedger();
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);

    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: SYNTHETIC_JD,
      importLedger: ledger,
      mentionIndex: mentionIndexFromWorkingBlocks(workingBlocks()),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(kubernetes).toBeDefined();
    expect(matchResult.coverage.missingRequiredIds).toContain(kubernetes!.id);

    const view = buildResumeCoverageView(parsedJob, matchResult);
    expect(view.missingRequired.some((row) => /kubernetes/i.test(row.text))).toBe(true);
    expect(view.onPageUnverified).toEqual([]);
  });

  it("labels typed Kubernetes as on-page unverified, not silent support", () => {
    const ledger = importedLedger();
    const before = cloneLedger(ledger);
    const typed = workingBlocks({
      [ROLE_A_BULLET]: `${IMPORT_BLOCKS.find((block) => block.blockId === ROLE_A_BULLET)?.text} Kubernetes.`,
    });

    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: mentionIndexFromWorkingBlocks(typed),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(kubernetes).toBeDefined();
    expect(matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(matchResult.coverage.missingRequiredIds).toEqual([]);
    expect(matchResult.coverage.requiredExplicitCoverage).toBe(0);
    expect(matchResult.coverage.semanticSupportedCount).toBe(0);

    const view = buildResumeCoverageView(parsedJob, matchResult);
    expect(view.onPageUnverified).toHaveLength(1);
    expect(view.onPageUnverified[0]?.statusLabel).toBe(ON_PAGE_UNVERIFIED_LABEL);
    expect(view.missingRequired).toEqual([]);
    expect(coverageCopyBlob(view)).toMatch(/unverified/i);
    expect(coverageCopyBlob(view)).not.toMatch(/silent/i);

    expect(ledger).toEqual(before);
    expect(ledger.facts.some((fact) => fact.provenance === "user_added_unverified")).toBe(false);
  });

  it("does not rebuild the frozen import ledger from working text", () => {
    const ledger = importedLedger();
    const typedMentions = mentionIndexFromWorkingBlocks(
      workingBlocks({
        [ROLE_A_BULLET]: "Built REST APIs with Python, Docker, and Kubernetes.",
      })
    );
    analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: typedMentions,
      firstSeenVersionId: VERSION_ID,
    });
    expect(classifyMentionsAgainstLedger(ledger, typedMentions, { firstSeenVersionId: VERSION_ID })
      .facts.some((fact) => fact.normalized === "kubernetes" && fact.provenance === "user_added_unverified")).toBe(true);
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
  });
});

describe("buildResumeCoverageView", () => {
  it("exposes named bars, related-wording count, and parseability warnings without an ATS score", () => {
    const ledger = importedLedger();
    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: SYNTHETIC_JD,
      importLedger: ledger,
      mentionIndex: mentionIndexFromWorkingBlocks(workingBlocks()),
      firstSeenVersionId: VERSION_ID,
    });
    const view = buildResumeCoverageView(parsedJob, matchResult, [
      {
        code: "table_layout",
        severity: "warning",
        occurrences: 1,
        message: "A table was found. Some parsers skip table cells.",
      },
    ]);

    expect(view.disclosure).toBe(RESUME_COVERAGE_DISCLOSURE);
    expect(view.bars.map((bar) => bar.id)).toEqual([
      "required-explicit",
      "preferred-explicit",
      "responsibility-alignment",
    ]);
    expect(view.bars[0]?.count).toBe(matchResult.coverage.requiredExplicitCount);
    expect(view.bars[0]?.total).toBe(matchResult.coverage.requiredTotal);
    expect(view.semanticSupportedCount).toBeGreaterThanOrEqual(1);
    expect(view.parseabilityWarnings).toHaveLength(1);
    expect(view.parseabilityWarnings[0]?.message).toMatch(/table/i);

    const blob = coverageCopyBlob(view);
    expect(blob).toContain("Zanarkand heuristic");
    expect(blob).toMatch(/kubernetes/i);
    assertHonestCoverageCopy(blob);
    expect(blob).not.toMatch(/ATS Score\s*:/i);
    expect(JSON.stringify(view)).not.toMatch(/atsScore/);
  });

  it("rejects forbidden ATS-score copy", () => {
    expect(() => assertHonestCoverageCopy("ATS Score: 97%")).toThrow(/ATS score/i);
    expect(() => assertHonestCoverageCopy("passes Greenhouse")).toThrow(/ATS score/i);
  });
});

describe("mentionIndexFromWorkingBlocks", () => {
  it("indexes REST APIs from the synthetic working copy", () => {
    const mentions = mentionIndexFromWorkingBlocks(workingBlocks());
    expect(mentions.some((mention) => mention.normalized === "rest api")).toBe(true);
    expect(mentions.some((mention) => mention.normalized === "kubernetes")).toBe(false);
  });
});

describe("mentionsForCoverageAnalysis", () => {
  it("rebuilds the mention index from working graph text, including typed Kubernetes", () => {
    const typed = workingBlocks({
      [ROLE_A_BULLET]: "Built REST APIs with Python, Docker, and Kubernetes.",
    });
    const mentions = mentionsForCoverageAnalysis({
      mentionIndex: mentionIndexFromWorkingBlocks(workingBlocks()),
      graph: { blocks: typed },
    });
    expect(mentions.some((mention) => mention.normalized === "kubernetes")).toBe(true);
  });
});

describe("structureForCoverageAnalyze after a saved working-copy edit", () => {
  const EDITED =
    "Shipped Docker and Kubernetes images for internal CLIs...";

  it("does not let a stale Open-time editor graph shadow a saved Kubernetes edit", () => {
    const ledger = importedLedger();
    const before = cloneLedger(ledger);
    const openBlocks = workingBlocks();
    const openSnapshot = {
      mentionIndex: mentionIndexFromWorkingBlocks(openBlocks),
      graph: { blocks: openBlocks },
    };
    const staleWorkingGraph = { blocks: openBlocks };
    const savedBlocks = workingBlocks({ [ROLE_A_BULLET]: EDITED });
    const savedSnapshot = {
      mentionIndex: mentionIndexFromWorkingBlocks(savedBlocks),
      graph: { blocks: savedBlocks },
    };

    expect(selectGraphForCoverageAnalyze({
      openSnapshot,
      workingGraph: staleWorkingGraph,
      savedSnapshot,
    })).toEqual(savedSnapshot.graph);

    const structure = structureForCoverageAnalyze({
      openSnapshot,
      workingGraph: staleWorkingGraph,
      savedSnapshot,
    });
    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: mentionsForCoverageAnalysis(structure),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(kubernetes).toBeDefined();
    expect(matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(matchResult.coverage.missingRequiredIds).not.toContain(kubernetes!.id);
    expect(matchResult.coverage.requiredExplicitCoverage).toBe(0);
    expect(matchResult.coverage.semanticSupportedCount).toBe(0);

    const view = buildResumeCoverageView(parsedJob, matchResult);
    expect(view.onPageUnverified[0]?.statusLabel).toBe(ON_PAGE_UNVERIFIED_LABEL);
    expect(view.missingRequired.some((row) => /kubernetes/i.test(row.text))).toBe(false);
    expect(view.onPageUnverified.some((row) => /kubernetes/i.test(row.text))).toBe(true);

    expect(ledger).toEqual(before);
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
    expect(ledger.facts.some((fact) => fact.provenance === "user_added_unverified")).toBe(false);
  });

  it("still prefers a live editor graph that already contains the typed Kubernetes sentence", () => {
    const ledger = importedLedger();
    const before = cloneLedger(ledger);
    const openBlocks = workingBlocks();
    const openSnapshot = {
      mentionIndex: mentionIndexFromWorkingBlocks(openBlocks),
      graph: { blocks: openBlocks },
    };
    const workingGraph = { blocks: workingBlocks({ [ROLE_A_BULLET]: EDITED }) };
    const jd = "Must have Kubernetes.";

    const stale = analyzeResumeJobCoverage({
      jobDescriptionText: jd,
      importLedger: ledger,
      mentionIndex: mentionsForCoverageAnalysis(openSnapshot),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(stale.parsedJob, "Kubernetes");
    expect(kubernetes).toBeDefined();
    expect(stale.matchResult.coverage.missingRequiredIds).toContain(kubernetes!.id);
    expect(stale.matchResult.coverage.onPageUnverifiedIds).toEqual([]);

    const structure = structureForCoverageAnalyze({
      openSnapshot,
      workingGraph,
    });
    const live = analyzeResumeJobCoverage({
      jobDescriptionText: jd,
      importLedger: ledger,
      mentionIndex: mentionsForCoverageAnalysis(structure),
      firstSeenVersionId: VERSION_ID,
    });
    expect(live.matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(live.matchResult.coverage.missingRequiredIds).not.toContain(kubernetes!.id);
    expect(live.matchResult.coverage.requiredExplicitCoverage).toBe(0);
    expect(live.matchResult.coverage.semanticSupportedCount).toBe(0);

    const view = buildResumeCoverageView(live.parsedJob, live.matchResult);
    expect(view.onPageUnverified[0]?.statusLabel).toBe(ON_PAGE_UNVERIFIED_LABEL);
    expect(view.missingRequired.some((row) => /kubernetes/i.test(row.text))).toBe(false);

    expect(ledger).toEqual(before);
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
  });

  it("prefers a refetched saved snapshot over the open-time snapshot when the editor graph is missing", () => {
    const ledger = importedLedger();
    const openBlocks = workingBlocks();
    const savedBlocks = workingBlocks({ [ROLE_A_BULLET]: EDITED });
    const structure = structureForCoverageAnalyze({
      openSnapshot: {
        mentionIndex: mentionIndexFromWorkingBlocks(openBlocks),
        graph: { blocks: openBlocks },
      },
      savedSnapshot: {
        mentionIndex: mentionIndexFromWorkingBlocks(savedBlocks),
        graph: { blocks: savedBlocks },
      },
    });
    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: mentionsForCoverageAnalysis(structure),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(matchResult.coverage.missingRequiredIds).toEqual([]);
  });

  it("indexes draft wording even when the flushed baseline still matches Open", () => {
    const ledger = importedLedger();
    const openBlocks = workingBlocks();
    const draftBlocks = workingBlocks({ [ROLE_A_BULLET]: EDITED });
    expect(editorBlocksForCoverageAnalyze({
      draftBlocks,
      baselineBlocks: openBlocks,
      persistedBlocks: openBlocks,
    })).toEqual(draftBlocks);

    const liveGraph = { blocks: editorBlocksForCoverageAnalyze({
      draftBlocks,
      baselineBlocks: openBlocks,
      persistedBlocks: openBlocks,
    }) };
    const structure = structureForCoverageAnalyze({
      openSnapshot: {
        mentionIndex: mentionIndexFromWorkingBlocks(openBlocks),
        graph: { blocks: openBlocks },
      },
      workingGraph: liveGraph,
      savedSnapshot: {
        mentionIndex: mentionIndexFromWorkingBlocks(openBlocks),
        graph: { blocks: openBlocks },
      },
    });
    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: mergeMentionIndexesForCoverage([
        mentionsForCoverageAnalysis(structure),
        liveGraph,
      ]),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(matchResult.coverage.missingRequiredIds).not.toContain(kubernetes!.id);
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);
  });

  it("indexes live contentEditable plaintext when React draft still matches Open", () => {
    const ledger = importedLedger();
    const openBlocks = workingBlocks();
    const overlaid = blocksWithLivePlaintext(openBlocks, { [ROLE_A_BULLET]: EDITED });
    expect(overlaid.find((block) => block.blockId === ROLE_A_BULLET)?.text).toBe(EDITED);

    const { parsedJob, matchResult } = analyzeResumeJobCoverage({
      jobDescriptionText: "Must have Kubernetes.",
      importLedger: ledger,
      mentionIndex: mentionIndexFromWorkingBlocks(overlaid),
      firstSeenVersionId: VERSION_ID,
    });
    const kubernetes = requirementMentioning(parsedJob, "Kubernetes");
    expect(matchResult.coverage.onPageUnverifiedIds).toEqual([kubernetes!.id]);
    expect(matchResult.coverage.missingRequiredIds).toEqual([]);
  });
});

describe("parseJobDescription still extracts the canary JD terms", () => {
  it("treats Must have Kubernetes as required", () => {
    const parsed = parseJobDescription("Must have Kubernetes. Nice to have Terraform.");
    expect(requirementMentioning(parsed, "Kubernetes")?.priority).toBe("required");
    expect(requirementMentioning(parsed, "Terraform")?.priority).toBe("preferred");
  });
});
