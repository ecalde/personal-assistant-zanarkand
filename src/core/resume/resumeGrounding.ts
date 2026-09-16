/**
 * Suggestion grounding validator (Phase 6D).
 *
 * Deterministic post-LLM gate (architecture §20.2, §26, ADR-010 / RES-AI-002).
 * The job description is never an input: a JD-only noun such as Kubernetes
 * cannot authorize an insert. LLM `evidenceQuotes` are not an allow-list
 * either — the model can invent quotes.
 *
 * When rewriting block B, claims in `proposedText` must already appear in:
 * - the verbatim of B (including unverified tokens **already written** there)
 * - `imported_source` facts from B's own role/section
 * - Skills-section imported facts **only** when B itself is a Skills line
 *   (a work bullet must not claim job-X used a Skills-listed technology)
 * - `user_verified` facts (explicit confirm; reusable on other blocks)
 * - `grounded_ai_transformation` facts whose parents are all allowed
 *
 * Not allowed: `user_added_unverified` from any other block; **adding** a
 * token that is not already in B (even on the same block); other jobs'
 * exclusive tech. Coverage may still show an on-page unverified mention.
 *
 * Style lint, unicode rewriting, Ollama chat, and suggestion UI belong to
 * later phases. Do not log resume or JD text.
 */

import type { ResumeDocumentSections } from "./resumeFacts";
import type {
  FactType,
  ResumeFact,
  ResumeFactLedger,
  SuggestionFactualityStatus,
} from "./resumeModel";
import {
  findLexiconMatches,
  normalizeLexiconTerm,
} from "./resumeSkillLexicon";
import { normalizeDocumentTextForComparison } from "./resumeUnicode";

export const RESUME_GROUNDING_VERSION = "resume-grounding-1";

export class ResumeGroundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeGroundingError";
  }
}

export type ResumeGroundingViolationKind = "technology" | "metric" | "claim";

export type ResumeGroundingViolation = {
  kind: ResumeGroundingViolationKind;
  /** Surface as written in the proposal. Never log this. */
  verbatim: string;
  normalized: string;
};

export type ResumeGroundingResult = {
  factualityStatus: SuggestionFactualityStatus;
  violations: ResumeGroundingViolation[];
};

export type GroundProposedTextInput = {
  proposedText: string;
  originalText: string;
  blockId: string;
  ledger: ResumeFactLedger;
  /**
   * Role/section map for scoping imported facts. When omitted, imported
   * evidence is limited to facts that already list this block as a source.
   */
  scope?: ResumeDocumentSections;
};

const BOUNDARY_PREFIX = "(?<![A-Za-z0-9+#])";
const BOUNDARY_SUFFIX = "(?![A-Za-z0-9+#])";

const NUMBER_TOKEN_PATTERN =
  /(?<![A-Za-z0-9.])(?:\$\s*)?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|percent|[kmb]\b))?/gi;

const LEDGER_CLAIM_TYPES = new Set<FactType>([
  "employer",
  "job_title",
  "degree",
  "certification",
  "clearance",
  "project",
  "leadership",
  "domain",
  "responsibility",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function scanText(value: string): string {
  return collapseWhitespace(normalizeDocumentTextForComparison(value));
}

function appearsAsTerm(term: string, text: string): boolean {
  const trimmed = collapseWhitespace(term);
  if (trimmed.length < 2) return false;
  const pattern = new RegExp(
    `${BOUNDARY_PREFIX}${escapeRegExp(trimmed).replace(/ /g, "\\s+")}${BOUNDARY_SUFFIX}`,
    "i"
  );
  return pattern.test(text);
}

/**
 * Numeric cores from currency, percents, magnitudes, years, and other digit
 * claims (architecture §26.3). A rewrite may keep numbers already in the
 * block (or in same-scope metric facts); new digits are ungrounded.
 */
export function extractNumberCores(text: string): string[] {
  const cores: string[] = [];
  const seen = new Set<string>();
  const regex = new RegExp(NUMBER_TOKEN_PATTERN.source, NUMBER_TOKEN_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const digits = match[0].replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    cores.push(digits);
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return cores;
}

function lexiconCanonicalsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const hit of findLexiconMatches(text)) {
    out.add(normalizeLexiconTerm(hit.canonical));
  }
  return out;
}

function isSkillsBlock(scope: ResumeDocumentSections, blockId: string): boolean {
  return scope.sectionKindByBlockId[blockId] === "skills";
}

/**
 * Facts that may authorize new claims in a rewrite of `blockId` (§20.2, §26.1).
 *
 * Stricter than `allowedEvidenceForBlock`: Skills-section terminology is
 * evidence for a Skills-line edit, not permission to claim another job used it.
 * `user_verified` is the exception that may be reused on other blocks.
 */
export function groundingAllowedFactsForBlock(
  ledger: ResumeFactLedger,
  blockId: string,
  scope?: ResumeDocumentSections
): ResumeFact[] {
  if (typeof blockId !== "string" || blockId.trim().length === 0) {
    throw new ResumeGroundingError("blockId is required to ground a rewrite");
  }

  const targetScopeKey = scope?.scopeKeyByBlockId[blockId];
  const skillsTarget = scope ? isSkillsBlock(scope, blockId) : false;

  const importedInScope = (fact: ResumeFact): boolean => {
    if (fact.provenance !== "imported_source") return false;
    if (!scope) {
      return fact.sourceBlockIds.includes(blockId);
    }
    if (targetScopeKey !== undefined) {
      if (fact.sourceBlockIds.some((id) => scope.scopeKeyByBlockId[id] === targetScopeKey)) {
        return true;
      }
    }
    return skillsTarget && fact.sourceBlockIds.some((id) => scope.sectionKindByBlockId[id] === "skills");
  };

  const allowed: ResumeFact[] = [];
  for (const fact of ledger.facts) {
    if (fact.provenance === "user_verified") {
      allowed.push(fact);
      continue;
    }
    if (importedInScope(fact)) {
      allowed.push(fact);
    }
  }

  const allowedIds = new Set(allowed.map((fact) => fact.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const fact of ledger.facts) {
      if (fact.provenance !== "grounded_ai_transformation") continue;
      if (allowedIds.has(fact.id)) continue;
      if (fact.inheritedFromFactIds.length === 0) continue;
      if (!fact.inheritedFromFactIds.every((parentId) => allowedIds.has(parentId))) continue;
      allowed.push(fact);
      allowedIds.add(fact.id);
      grew = true;
    }
  }

  return allowed;
}

function allowedTechnologyCanonicals(
  originalText: string,
  allowedFacts: readonly ResumeFact[]
): Set<string> {
  const out = lexiconCanonicalsIn(originalText);
  for (const fact of allowedFacts) {
    if (fact.type === "technology" || fact.type === "skill_phrase") {
      out.add(fact.normalized);
    }
  }
  return out;
}

function allowedNumberCoresFrom(
  originalText: string,
  allowedFacts: readonly ResumeFact[]
): Set<string> {
  const out = new Set(extractNumberCores(originalText));
  for (const fact of allowedFacts) {
    if (fact.type !== "metric") continue;
    for (const core of extractNumberCores(fact.verbatim)) {
      out.add(core);
    }
  }
  return out;
}

function addViolation(
  into: ResumeGroundingViolation[],
  seen: Set<string>,
  violation: ResumeGroundingViolation
): void {
  const key = `${violation.kind}|${violation.normalized}`;
  if (seen.has(key) || violation.normalized.length === 0) return;
  seen.add(key);
  into.push(violation);
}

/**
 * Validate `proposedText` against allowed evidence for the target block.
 *
 * Returns `grounded` only when every technology, number, employer, and other
 * ledger claim in the proposal is authorized. Fail closed otherwise:
 * `rejected_ungrounded`. This phase never returns `needs_user`.
 */
export function groundProposedText(input: GroundProposedTextInput): ResumeGroundingResult {
  if (typeof input.blockId !== "string" || input.blockId.trim().length === 0) {
    throw new ResumeGroundingError("blockId is required to ground a rewrite");
  }
  if (typeof input.proposedText !== "string") {
    throw new ResumeGroundingError("proposedText is required to ground a rewrite");
  }
  if (typeof input.originalText !== "string") {
    throw new ResumeGroundingError("originalText is required to ground a rewrite");
  }

  const proposed = scanText(input.proposedText);
  const original = scanText(input.originalText);
  if (proposed.length === 0) {
    throw new ResumeGroundingError("proposedText is required to ground a rewrite");
  }

  const allowedFacts = groundingAllowedFactsForBlock(input.ledger, input.blockId, input.scope);
  const allowedTech = allowedTechnologyCanonicals(original, allowedFacts);
  const allowedNumbers = allowedNumberCoresFrom(original, allowedFacts);
  const allowedFactIds = new Set(allowedFacts.map((fact) => fact.id));
  const allowedClaimKeys = new Set(
    allowedFacts.map((fact) => `${fact.type}|${fact.normalized}`)
  );

  const violations: ResumeGroundingViolation[] = [];
  const seen = new Set<string>();

  for (const hit of findLexiconMatches(proposed)) {
    const normalized = normalizeLexiconTerm(hit.canonical);
    if (allowedTech.has(normalized)) continue;
    addViolation(violations, seen, {
      kind: "technology",
      verbatim: hit.verbatim,
      normalized,
    });
  }

  for (const core of extractNumberCores(proposed)) {
    if (allowedNumbers.has(core)) continue;
    addViolation(violations, seen, {
      kind: "metric",
      verbatim: core,
      normalized: core,
    });
  }

  for (const fact of input.ledger.facts) {
    if (!LEDGER_CLAIM_TYPES.has(fact.type)) continue;
    const inProposed =
      appearsAsTerm(fact.verbatim, proposed) || appearsAsTerm(fact.normalized, proposed);
    if (!inProposed) continue;
    const inOriginal =
      appearsAsTerm(fact.verbatim, original) || appearsAsTerm(fact.normalized, original);
    if (inOriginal) continue;
    if (allowedFactIds.has(fact.id)) continue;
    if (allowedClaimKeys.has(`${fact.type}|${fact.normalized}`)) continue;
    addViolation(violations, seen, {
      kind: "claim",
      verbatim: fact.verbatim,
      normalized: fact.normalized,
    });
  }

  if (violations.length > 0) {
    return { factualityStatus: "rejected_ungrounded", violations };
  }
  return { factualityStatus: "grounded", violations: [] };
}
