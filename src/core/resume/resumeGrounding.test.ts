import { describe, expect, it } from "vitest";
import {
  allowedEvidenceForBlock,
  buildDocumentMentionIndex,
  classifyMentionsAgainstLedger,
  detectResumeSections,
  extractImportedFacts,
  markFactVerified,
  type FactSourceBlock,
} from "./resumeFacts";
import {
  RESUME_GROUNDING_VERSION,
  ResumeGroundingError,
  extractNumberCores,
  groundProposedText,
  groundingAllowedFactsForBlock,
  type GroundProposedTextInput,
} from "./resumeGrounding";
import type { ResumeFact, ResumeFactLedger } from "./resumeModel";

const VERSION_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Synthetic two-role resume. Kubernetes appears nowhere on import — the
 * adversarial term for architecture §20.4 / quality-gate Cases B, E, G.
 */
const ROLE_A_BULLET = "b-role-a-bullet";
const ROLE_B_BULLET = "b-role-b-bullet";
const SKILLS_BLOCK = "b-skills";

const IMPORT_BLOCKS: FactSourceBlock[] = [
  { blockId: "b-name", text: "Jordan Hale" },
  { blockId: "b-exp-heading", text: "WORK EXPERIENCE" },
  { blockId: "b-role-a", text: "Software Engineer, Northwind Labs  |  2020 \u2013 2026" },
  { blockId: ROLE_A_BULLET, text: "Built REST APIs with Python and Docker for inventory sync." },
  { blockId: "b-role-b", text: "Data Engineer, Contoso  |  2018 \u2013 2020" },
  { blockId: ROLE_B_BULLET, text: "Wrote SQL batch jobs that reconciled nightly shipment files." },
  { blockId: "b-skills-heading", text: "SKILLS" },
  { blockId: SKILLS_BLOCK, text: "Python, REST APIs, SQL, Docker" },
];

function importedLedger(): ResumeFactLedger {
  return extractImportedFacts(IMPORT_BLOCKS, { firstSeenVersionId: VERSION_ID });
}

function withTypedKubernetesOnRoleA(): {
  ledger: ResumeFactLedger;
  blocks: FactSourceBlock[];
} {
  const blocks = IMPORT_BLOCKS.map((block) =>
    block.blockId === ROLE_A_BULLET
      ? { ...block, text: `${block.text} Ran workloads on Kubernetes.` }
      : block
  );
  return {
    blocks,
    ledger: classifyMentionsAgainstLedger(importedLedger(), buildDocumentMentionIndex(blocks), {
      firstSeenVersionId: VERSION_ID,
    }),
  };
}

function originalText(blockId: string, blocks: readonly FactSourceBlock[] = IMPORT_BLOCKS): string {
  const block = blocks.find((item) => item.blockId === blockId);
  if (!block) throw new Error(`missing block ${blockId}`);
  return block.text;
}

function ground(
  blockId: string,
  proposedText: string,
  options: {
    ledger?: ResumeFactLedger;
    blocks?: readonly FactSourceBlock[];
  } = {}
) {
  const blocks = options.blocks ?? IMPORT_BLOCKS;
  const input: GroundProposedTextInput = {
    proposedText,
    originalText: originalText(blockId, blocks),
    blockId,
    ledger: options.ledger ?? importedLedger(),
    scope: detectResumeSections(blocks),
  };
  return groundProposedText(input);
}

function violationNormalized(result: ReturnType<typeof groundProposedText>): string[] {
  return result.violations.map((item) => item.normalized);
}

describe("RESUME_GROUNDING_VERSION", () => {
  it("is a frozen validator identity for later suggestion rows", () => {
    expect(RESUME_GROUNDING_VERSION).toBe("resume-grounding-1");
  });
});

describe("extractNumberCores", () => {
  it("reads metric-style claims and ignores surrounding prose", () => {
    expect(extractNumberCores("Cut deploy time by 40% and consolidated 3 services.")).toEqual([
      "40",
      "3",
    ]);
    expect(extractNumberCores("Built REST APIs with Python and Docker.")).toEqual([]);
  });
});

describe("Case B — JD Kubernetes; resume has none", () => {
  it("rejects inserting Kubernetes when the import ledger has none", () => {
    const ledger = importedLedger();
    expect(ledger.facts.some((fact) => fact.normalized === "kubernetes")).toBe(false);

    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs on Kubernetes that reconciled nightly shipment files."
    );

    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
    expect(result.violations.some((item) => item.kind === "technology")).toBe(true);
  });

  it("rejects the k8s alias the same way", () => {
    const result = ground(ROLE_A_BULLET, "Built REST APIs with Python, Docker, and k8s.");
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });

  it("does not take a job description as evidence (JD-only nouns cannot authorize an insert)", () => {
    expect(groundProposedText.length).toBe(1);
    const result = ground(
      ROLE_B_BULLET,
      "Must have Kubernetes as the job description states. Wrote SQL batch jobs."
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });
});

describe("Case E — extra metric", () => {
  it("rejects a number that is not in the block or allowed metric facts", () => {
    const result = ground(
      ROLE_A_BULLET,
      "Built REST APIs with Python and Docker for inventory sync, cutting costs 40%."
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("40");
    expect(result.violations.some((item) => item.kind === "metric")).toBe(true);
  });

  it("allows a metric that is already in the original block", () => {
    const blocks: FactSourceBlock[] = IMPORT_BLOCKS.map((block) =>
      block.blockId === ROLE_A_BULLET
        ? { ...block, text: "Built REST APIs with Python and Docker, cutting deploy time 40%." }
        : block
    );
    const ledger = extractImportedFacts(blocks, { firstSeenVersionId: VERSION_ID });
    const result = ground(
      ROLE_A_BULLET,
      "Built REST APIs with Python and Docker, cutting deploy time 40%.",
      { ledger, blocks }
    );
    expect(result.factualityStatus).toBe("grounded");
    expect(result.violations).toEqual([]);
  });
});

describe("Case G — unverified Kubernetes must not leak", () => {
  it("rejects using Role A's typed Kubernetes when rewriting Role B", () => {
    const { ledger, blocks } = withTypedKubernetesOnRoleA();
    const kubernetes = ledger.facts.find((fact) => fact.normalized === "kubernetes");
    expect(kubernetes?.provenance).toBe("user_added_unverified");
    expect(kubernetes?.sourceBlockIds).toEqual([ROLE_A_BULLET]);

    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs on Kubernetes that reconciled nightly shipment files.",
      { ledger, blocks }
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });

  it("rejects adding Kubernetes to a block that does not already contain it", () => {
    const { ledger, blocks } = withTypedKubernetesOnRoleA();
    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs that reconciled nightly shipment files on Kubernetes.",
      { ledger, blocks }
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });

  it("preserves Kubernetes already written in the same block", () => {
    const { ledger, blocks } = withTypedKubernetesOnRoleA();
    const result = ground(
      ROLE_A_BULLET,
      "Built REST APIs with Python and Docker for inventory sync. Ran workloads on Kubernetes.",
      { ledger, blocks }
    );
    expect(result.factualityStatus).toBe("grounded");
    expect(result.violations).toEqual([]);
  });

  it("still rejects inserting Kubernetes into Role A when that block's verbatim lacks it", () => {
    const { ledger } = withTypedKubernetesOnRoleA();
    const result = groundProposedText({
      proposedText: "Built REST APIs with Python, Docker, and Kubernetes for inventory sync.",
      originalText: originalText(ROLE_A_BULLET, IMPORT_BLOCKS),
      blockId: ROLE_A_BULLET,
      ledger,
      scope: detectResumeSections(IMPORT_BLOCKS),
    });
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });

  it("allows reuse on Role B only after the user verifies the fact", () => {
    const { ledger, blocks } = withTypedKubernetesOnRoleA();
    const kubernetes = ledger.facts.find((fact) => fact.normalized === "kubernetes");
    expect(kubernetes).toBeDefined();
    if (!kubernetes) return;

    const verified = markFactVerified(ledger, kubernetes.id, "2026-09-16T12:00:00.000Z");
    expect(verified.facts.find((fact) => fact.id === kubernetes.id)?.provenance).toBe(
      "user_verified"
    );

    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs on Kubernetes that reconciled nightly shipment files.",
      { ledger: verified, blocks }
    );
    expect(result.factualityStatus).toBe("grounded");
    expect(result.violations).toEqual([]);
  });
});

describe("groundProposedText", () => {
  it("grounds a same-role terminology alignment that introduces no new facts", () => {
    const result = ground(
      ROLE_A_BULLET,
      "Built RESTful services with Python and Docker for inventory sync."
    );
    expect(result.factualityStatus).toBe("grounded");
    expect(result.violations).toEqual([]);
  });

  it("grounds a Role B rephrase that stays inside SQL and that role's wording", () => {
    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs that reconciled nightly shipment files."
    );
    expect(result.factualityStatus).toBe("grounded");
  });

  it("does not let Skills-listed tech become a different role's claim", () => {
    const ledger = importedLedger();
    const scope = detectResumeSections(IMPORT_BLOCKS);
    const promptEvidence = allowedEvidenceForBlock(ledger, ROLE_B_BULLET, { scope }).map(
      (fact) => fact.normalized
    );
    expect(promptEvidence).toContain("python");

    const allowed = groundingAllowedFactsForBlock(ledger, ROLE_B_BULLET, scope).map(
      (fact) => fact.normalized
    );
    expect(allowed).not.toContain("python");

    const result = ground(
      ROLE_B_BULLET,
      "Wrote Python and SQL batch jobs that reconciled nightly shipment files."
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("python");
  });

  it("allows a Skills-line terminology alignment and still rejects adding Kubernetes", () => {
    const aligned = ground(SKILLS_BLOCK, "Python, RESTful APIs, SQL, Docker");
    expect(aligned.factualityStatus).toBe("grounded");

    const inserted = ground(SKILLS_BLOCK, "Python, REST APIs, SQL, Docker, Kubernetes");
    expect(inserted.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(inserted)).toContain("kubernetes");
  });

  it("rejects another role's employer as a claim", () => {
    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs at Northwind Labs that reconciled nightly shipment files."
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("northwind labs");
  });

  it("still finds Kubernetes hidden behind a zero-width space", () => {
    const result = ground(
      ROLE_B_BULLET,
      "Wrote SQL batch jobs on Kuber\u200bnetes that reconciled nightly shipment files."
    );
    expect(result.factualityStatus).toBe("rejected_ungrounded");
    expect(violationNormalized(result)).toContain("kubernetes");
  });

  it("includes a grounded transformation only when every parent is allowed", () => {
    const { ledger, blocks } = withTypedKubernetesOnRoleA();
    const sql = ledger.facts.find(
      (fact) => fact.normalized === "sql" && fact.provenance === "imported_source"
    );
    const kubernetes = ledger.facts.find((fact) => fact.normalized === "kubernetes");
    expect(sql).toBeDefined();
    expect(kubernetes).toBeDefined();
    if (!sql || !kubernetes) return;

    const fromSql: ResumeFact = {
      id: "22222222-2222-4222-8222-222222222222",
      type: "skill_phrase",
      verbatim: "SQL batch reconciliation",
      normalized: "sql batch reconciliation",
      sourceBlockIds: [ROLE_B_BULLET],
      provenance: "grounded_ai_transformation",
      inheritedFromFactIds: [sql.id],
      presentInWorkingDocument: true,
      firstSeenVersionId: VERSION_ID,
    };
    const fromKubernetes: ResumeFact = {
      ...fromSql,
      id: "33333333-3333-4333-8333-333333333333",
      verbatim: "Kubernetes rollout automation",
      normalized: "kubernetes rollout automation",
      inheritedFromFactIds: [kubernetes.id],
    };
    const mixed: ResumeFactLedger = { facts: [...ledger.facts, fromSql, fromKubernetes] };

    const allowed = groundingAllowedFactsForBlock(
      mixed,
      ROLE_B_BULLET,
      detectResumeSections(blocks)
    ).map((fact) => fact.normalized);
    expect(allowed).toContain("sql batch reconciliation");
    expect(allowed).not.toContain("kubernetes rollout automation");
  });

  it("does not put resume text into thrown errors", () => {
    expect(() =>
      groundProposedText({
        proposedText: "Secret Kubernetes bullet",
        originalText: "original",
        blockId: "",
        ledger: importedLedger(),
      })
    ).toThrow(ResumeGroundingError);
    try {
      groundProposedText({
        proposedText: "Secret Kubernetes bullet",
        originalText: "original",
        blockId: "  ",
        ledger: importedLedger(),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeGroundingError);
      expect(String(error)).not.toContain("Kubernetes");
      expect(String(error)).not.toContain("Secret");
    }
  });
});
