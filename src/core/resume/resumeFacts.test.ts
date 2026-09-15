import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseImportFactLedger } from "./resumeDbMappers";
import {
  allowedEvidenceForBlock,
  alignImportBlocksWithBlockMap,
  buildDocumentMentionIndex,
  classifyMentionsAgainstLedger,
  detectResumeSections,
  extractImportedFacts,
  markFactVerified,
  sameBlockUnverifiedFacts,
  ResumeFactsError,
  type FactSourceBlock,
} from "./resumeFacts";
import { lexiconEntryForTerm } from "./resumeSkillLexicon";
import { listParagraphPlaintexts } from "./resumeOoxmlRead";
import { injectResumeBookmarks } from "./resumeOoxmlWrite";
import type { ResumeFact, ResumeFactLedger } from "./resumeModel";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const geometryCanaryPath = join(repoRoot, "fixtures/resume/public/geometry-canary.docx");
const privateCanaryPath = join(repoRoot, "fixtures/resume/private/current-resume.docx");
const privateLedgerStatsPath = join(repoRoot, "fixtures/resume/private/fact-ledger.local.json");

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

function factsOfType(ledger: ResumeFactLedger, type: ResumeFact["type"]): ResumeFact[] {
  return ledger.facts.filter((fact) => fact.type === type);
}

function findFact(ledger: ResumeFactLedger, normalized: string): ResumeFact | undefined {
  return ledger.facts.find((fact) => fact.normalized === normalized);
}

function normalizedNames(facts: readonly ResumeFact[]): string[] {
  return facts.map((fact) => fact.normalized);
}

/**
 * Synthetic two-role resume. Block ids stand in for Phase 3B bookmark ids.
 * Kubernetes appears nowhere: it is the adversarial term for §20.4.
 */
const ROLE_A_BULLET = "b-role-a-bullet";
const ROLE_B_BULLET = "b-role-b-bullet";

const IMPORT_BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 \u2013 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 \u2013 2020" },
  { blockId: ROLE_B_BULLET, text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: "b-skills", text: "Python, REST APIs, SQL, Docker" },
];

function importedLedger(): ResumeFactLedger {
  return extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
}

describe("extractImportedFacts", () => {
  it("freezes imported technologies from the original upload", async () => {
    // Product flow: plaintext comes from the immutable original, ids from the
    // bookmarked working copy.
    const originalBytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const paragraphs = await listParagraphPlaintexts(originalBytes);
    const working = await injectResumeBookmarks(originalBytes);
    const blocks = alignImportBlocksWithBlockMap(paragraphs, working.blockMap);

    const ledger = extractImportedFacts(blocks, { firstSeenVersionId: VERSION_ID });

    const rest = findFact(ledger, "rest api");
    expect(rest).toBeDefined();
    expect(rest?.type).toBe("technology");
    expect(rest?.verbatim).toBe("REST APIs");
    expect(rest?.provenance).toBe("imported_source");
    expect(rest?.sourceBlockIds.length).toBeGreaterThan(0);

    expect(normalizedNames(factsOfType(ledger, "technology"))).toEqual(
      expect.arrayContaining(["python", "rest api", "aws", "docker", "sql", "git"])
    );

    for (const fact of ledger.facts) {
      expect(fact.provenance).toBe("imported_source");
      expect(fact.presentInWorkingDocument).toBe(true);
      expect(fact.inheritedFromFactIds).toEqual([]);
      expect(fact.firstSeenVersionId).toBe(VERSION_ID);
    }
  });

  it("does not invent Kubernetes on a resume that never mentions it", async () => {
    const originalBytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const paragraphs = await listParagraphPlaintexts(originalBytes);
    const working = await injectResumeBookmarks(originalBytes);
    const ledger = extractImportedFacts(
      alignImportBlocksWithBlockMap(paragraphs, working.blockMap),
      { firstSeenVersionId: VERSION_ID }
    );

    expect(findFact(ledger, "kubernetes")).toBeUndefined();
    // The detector knows the term, so this is absence of evidence, not of vocabulary.
    expect(lexiconEntryForTerm("Kubernetes")).not.toBeNull();
  });

  it("extracts employment, degree, and date facts from their strict shapes", async () => {
    const originalBytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const paragraphs = await listParagraphPlaintexts(originalBytes);
    const working = await injectResumeBookmarks(originalBytes);
    const ledger = extractImportedFacts(
      alignImportBlocksWithBlockMap(paragraphs, working.blockMap),
      { firstSeenVersionId: VERSION_ID }
    );

    expect(factsOfType(ledger, "employer").map((fact) => fact.verbatim)).toEqual([
      "Northwind Labs",
    ]);
    expect(factsOfType(ledger, "job_title").map((fact) => fact.verbatim)).toEqual([
      "Software Engineer",
    ]);
    expect(factsOfType(ledger, "degree")[0]?.verbatim).toBe(
      "B.S. Computer Science, Contoso University"
    );
    expect(factsOfType(ledger, "date_range").map((fact) => fact.verbatim)).toEqual(
      expect.arrayContaining(["2020 \u2013 2026", "2016 \u2013 2020"])
    );
    // Prose bullets never become employment facts.
    expect(factsOfType(ledger, "employer")).toHaveLength(1);
  });

  it("produces a ledger the persistence mapper accepts", async () => {
    const originalBytes = new Uint8Array(readFileSync(geometryCanaryPath));
    const paragraphs = await listParagraphPlaintexts(originalBytes);
    const working = await injectResumeBookmarks(originalBytes);
    const ledger = extractImportedFacts(
      alignImportBlocksWithBlockMap(paragraphs, working.blockMap),
      { firstSeenVersionId: VERSION_ID }
    );

    const roundTripped: unknown = JSON.parse(JSON.stringify(ledger));
    expect(parseImportFactLedger(roundTripped)).toEqual(ledger);
  });

  it("keeps section labels and prose out of the ledger", () => {
    const ledger = importedLedger();
    expect(findFact(ledger, "skills")).toBeUndefined();
    expect(findFact(ledger, "work experience")).toBeUndefined();
  });

  it("records only numbers that carry a claim", () => {
    const ledger = extractImportedFacts(
      [
        { blockId: "b-1", text: "WORK EXPERIENCE" },
        { blockId: "b-2", text: "Engineer, Contoso  |  2018 \u2013 2020" },
        { blockId: "b-3", text: "Cut deploy time by 40% and consolidated 3 services in 2019." },
      ],
      { firstSeenVersionId: VERSION_ID }
    );

    const metrics = factsOfType(ledger, "metric").map((fact) => fact.verbatim);
    expect(metrics).toEqual(expect.arrayContaining(["40%", "3 services"]));
    expect(metrics.some((metric) => metric.startsWith("2019"))).toBe(false);
    expect(metrics.some((metric) => metric.startsWith("2018"))).toBe(false);
  });

  it("refuses to freeze a ledger without the originating version", () => {
    expect(() => extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: "  " })).toThrow(
      ResumeFactsError
    );
  });
});

describe("detectResumeSections", () => {
  it("splits headings and employment chunks", () => {
    const sections = detectResumeSections(IMPORT_BLOCKS);

    expect(sections.sections.map((section) => section.kind)).toEqual([
      "header",
      "experience",
      "skills",
    ]);
    expect(sections.sectionKindByBlockId[ROLE_A_BULLET]).toBe("experience");
    expect(sections.sectionKindByBlockId["b-skills"]).toBe("skills");

    expect(sections.roles).toHaveLength(2);
    expect(sections.roles[0]).toMatchObject({
      jobTitle: "Software Engineer",
      employer: "Northwind Labs",
      dateRange: "2020 \u2013 2026",
    });
    // Bullets belong to the role above them, so evidence can be role-scoped.
    expect(sections.scopeKeyByBlockId[ROLE_A_BULLET]).toBe(sections.roles[0]?.key);
    expect(sections.scopeKeyByBlockId[ROLE_B_BULLET]).toBe(sections.roles[1]?.key);
  });
});

describe("classifyMentionsAgainstLedger", () => {
  it("marks a typed Kubernetes as user_added_unverified, never imported", () => {
    const ledger = importedLedger();
    const workingBlocks = IMPORT_BLOCKS.map((block) =>
      block.blockId === ROLE_A_BULLET
        ? { ...block, text: `${block.text} Ran workloads on Kubernetes.` }
        : block
    );

    const classified = classifyMentionsAgainstLedger(
      ledger,
      buildDocumentMentionIndex(workingBlocks),
      { firstSeenVersionId: VERSION_ID }
    );

    const kubernetes = findFact(classified, "kubernetes");
    expect(kubernetes?.provenance).toBe("user_added_unverified");
    expect(kubernetes?.sourceBlockIds).toEqual([ROLE_A_BULLET]);
    expect(kubernetes?.presentInWorkingDocument).toBe(true);

    // Re-scanning never launders it into the frozen import set.
    const rescanned = classifyMentionsAgainstLedger(
      classified,
      buildDocumentMentionIndex(workingBlocks),
      { firstSeenVersionId: VERSION_ID }
    );
    expect(findFact(rescanned, "kubernetes")?.provenance).toBe("user_added_unverified");
    expect(factsOfType(rescanned, "technology").filter((f) => f.normalized === "kubernetes"))
      .toHaveLength(1);
  });

  it("keeps imported facts when the user deletes them from the working copy", () => {
    const ledger = importedLedger();
    const workingBlocks = IMPORT_BLOCKS.map((block) =>
      block.blockId === ROLE_A_BULLET
        ? { ...block, text: "Built REST APIs with Python for inventory sync." }
        : block.blockId === "b-skills"
          ? { ...block, text: "Python, REST APIs, SQL" }
          : block
    );

    const classified = classifyMentionsAgainstLedger(
      ledger,
      buildDocumentMentionIndex(workingBlocks),
      { firstSeenVersionId: VERSION_ID }
    );

    const docker = findFact(classified, "docker");
    expect(docker?.provenance).toBe("imported_source");
    expect(docker?.presentInWorkingDocument).toBe(false);
    // Frozen: the original's source blocks are not rewritten from working text.
    expect(docker?.sourceBlockIds).toEqual(findFact(ledger, "docker")?.sourceBlockIds);

    const python = findFact(classified, "python");
    expect(python?.presentInWorkingDocument).toBe(true);
    expect(python?.provenance).toBe("imported_source");
  });

  it("does not mutate the ledger it was given", () => {
    const ledger = importedLedger();
    const snapshot = JSON.stringify(ledger);
    classifyMentionsAgainstLedger(ledger, buildDocumentMentionIndex(IMPORT_BLOCKS), {
      firstSeenVersionId: VERSION_ID,
    });
    expect(JSON.stringify(ledger)).toBe(snapshot);
  });
});

describe("allowedEvidenceForBlock", () => {
  function ledgerWithTypedKubernetes(): ResumeFactLedger {
    const workingBlocks = IMPORT_BLOCKS.map((block) =>
      block.blockId === ROLE_A_BULLET
        ? { ...block, text: `${block.text} Ran workloads on Kubernetes.` }
        : block
    );
    return classifyMentionsAgainstLedger(
      importedLedger(),
      buildDocumentMentionIndex(workingBlocks),
      { firstSeenVersionId: VERSION_ID }
    );
  }

  it("never offers an unverified mention as evidence for another block", () => {
    const classified = ledgerWithTypedKubernetes();
    expect(normalizedNames(allowedEvidenceForBlock(classified, ROLE_B_BULLET))).not.toContain(
      "kubernetes"
    );
    // Not even for the block it was typed into: what is already written there
    // reaches the model as the block's own text, not as reusable evidence.
    expect(normalizedNames(allowedEvidenceForBlock(classified, ROLE_A_BULLET))).not.toContain(
      "kubernetes"
    );
    expect(normalizedNames(sameBlockUnverifiedFacts(classified, ROLE_A_BULLET))).toContain(
      "kubernetes"
    );
    expect(sameBlockUnverifiedFacts(classified, ROLE_B_BULLET)).toEqual([]);
  });

  it("offers imported facts as evidence", () => {
    const evidence = allowedEvidenceForBlock(importedLedger(), ROLE_B_BULLET);
    expect(normalizedNames(evidence)).toEqual(expect.arrayContaining(["python", "rest api"]));
    expect(evidence.every((fact) => fact.provenance === "imported_source")).toBe(true);
  });

  it("allows reuse only after the user explicitly verifies the claim", () => {
    const classified = ledgerWithTypedKubernetes();
    const kubernetes = findFact(classified, "kubernetes");
    expect(kubernetes).toBeDefined();
    if (!kubernetes) return;

    const verified = markFactVerified(classified, kubernetes.id, "2026-09-15T12:00:00.000Z");
    expect(findFact(verified, "kubernetes")?.provenance).toBe("user_verified");
    expect(normalizedNames(allowedEvidenceForBlock(verified, ROLE_B_BULLET))).toContain(
      "kubernetes"
    );
  });

  it("leaves imported facts untouched when asked to verify them", () => {
    const ledger = importedLedger();
    const python = findFact(ledger, "python");
    expect(python).toBeDefined();
    if (!python) return;

    const verified = markFactVerified(ledger, python.id, "2026-09-15T12:00:00.000Z");
    expect(findFact(verified, "python")?.provenance).toBe("imported_source");
    expect(findFact(verified, "python")?.verifiedAtIso).toBeUndefined();
    expect(() => markFactVerified(ledger, "not-a-fact", "2026-09-15T12:00:00.000Z")).toThrow(
      ResumeFactsError
    );
  });

  it("scopes evidence to the block's own role plus the skills section", () => {
    const ledger = importedLedger();
    const scope = detectResumeSections(IMPORT_BLOCKS);

    const scoped = normalizedNames(allowedEvidenceForBlock(ledger, ROLE_B_BULLET, { scope }));
    // Role A's employer is not evidence for a bullet under Role B.
    expect(scoped).not.toContain("northwind labs");
    // Skills-section terminology stays available (§20.2).
    expect(scoped).toEqual(expect.arrayContaining(["python", "rest api", "docker"]));

    const unscoped = normalizedNames(allowedEvidenceForBlock(ledger, ROLE_B_BULLET));
    expect(unscoped).toContain("northwind labs");
  });

  it("includes a grounded transformation only when all of its parents are allowed", () => {
    const classified = ledgerWithTypedKubernetes();
    const python = findFact(classified, "python");
    const kubernetes = findFact(classified, "kubernetes");
    expect(python).toBeDefined();
    expect(kubernetes).toBeDefined();
    if (!python || !kubernetes) return;

    const grounded: ResumeFact = {
      id: "22222222-2222-4222-8222-222222222222",
      type: "skill_phrase",
      verbatim: "Python service automation",
      normalized: "python service automation",
      sourceBlockIds: [ROLE_B_BULLET],
      provenance: "grounded_ai_transformation",
      inheritedFromFactIds: [python.id],
      presentInWorkingDocument: true,
      firstSeenVersionId: VERSION_ID,
    };
    const ungrounded: ResumeFact = {
      ...grounded,
      id: "33333333-3333-4333-8333-333333333333",
      verbatim: "Kubernetes rollout automation",
      normalized: "kubernetes rollout automation",
      inheritedFromFactIds: [kubernetes.id],
    };

    const ledger: ResumeFactLedger = {
      facts: [...classified.facts, grounded, ungrounded],
    };
    const evidence = normalizedNames(allowedEvidenceForBlock(ledger, ROLE_B_BULLET));
    expect(evidence).toContain("python service automation");
    expect(evidence).not.toContain("kubernetes rollout automation");
  });
});

describe("alignImportBlocksWithBlockMap", () => {
  it("pairs original paragraphs with working-copy block ids", () => {
    const blocks = alignImportBlocksWithBlockMap(
      ["First", "Second"],
      [
        { blockId: "id-2", bookmarkName: "pa_id-2", order: 1 },
        { blockId: "id-1", bookmarkName: "pa_id-1", order: 0 },
      ]
    );
    expect(blocks).toEqual([
      { blockId: "id-1", text: "First" },
      { blockId: "id-2", text: "Second" },
    ]);
  });

  it("fails closed when the block map does not describe the original", () => {
    expect(() =>
      alignImportBlocksWithBlockMap(
        ["First", "Second"],
        [{ blockId: "id-1", bookmarkName: "pa_id-1", order: 0 }]
      )
    ).toThrow(ResumeFactsError);
  });
});

describe("private resume fixture", () => {
  it.skipIf(process.env.RESUME_PRIVATE_FIXTURE !== "1")(
    "freezes a ledger from the private original without recording its contents",
    async () => {
      if (!existsSync(privateCanaryPath)) {
        throw new Error("RESUME_PRIVATE_FIXTURE=1 but the private fixture is missing");
      }
      const originalBytes = new Uint8Array(readFileSync(privateCanaryPath));
      const paragraphs = await listParagraphPlaintexts(originalBytes);
      const working = await injectResumeBookmarks(originalBytes);
      const blocks = alignImportBlocksWithBlockMap(paragraphs, working.blockMap);

      const ledger = extractImportedFacts(blocks, { firstSeenVersionId: VERSION_ID });
      expect(ledger.facts.length).toBeGreaterThan(0);
      expect(ledger.facts.every((fact) => fact.provenance === "imported_source")).toBe(true);
      expect(parseImportFactLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);

      // Aggregate counts only, to a gitignored path. Never verbatim fact text.
      const countsByType: Record<string, number> = {};
      for (const fact of ledger.facts) {
        countsByType[fact.type] = (countsByType[fact.type] ?? 0) + 1;
      }
      mkdirSync(dirname(privateLedgerStatsPath), { recursive: true });
      writeFileSync(
        privateLedgerStatsPath,
        `${JSON.stringify(
          { blockCount: blocks.length, factCount: ledger.facts.length, countsByType },
          null,
          2
        )}\n`
      );
    }
  );
});
