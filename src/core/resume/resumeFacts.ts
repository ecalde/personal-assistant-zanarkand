/**
 * Resume fact ledger (Phase 3C).
 *
 * Two layers that must never collapse into one (architecture §16.2, §20):
 *
 * 1. **Import ledger** — `imported_source` facts extracted once from the
 *    **immutable original** upload bytes and frozen for that resume lineage.
 *    It is the authority for what the person actually did.
 * 2. **Document mention index** — what the working copy says right now. It
 *    answers "is this word on the page?" for coverage. It is never the ledger,
 *    and a term typed into the document never promotes itself into evidence.
 *
 * `classifyMentionsAgainstLedger` reconciles the two: imported facts keep their
 * provenance forever (only `presentInWorkingDocument` moves), and anything new
 * lands as `user_added_unverified` until the user explicitly verifies it.
 *
 * Everything here is deterministic — a lexicon plus explicit patterns
 * (architecture §28). No job-description text reaches this module, so a JD can
 * never introduce a fact the resume does not contain. Extraction covers only
 * what patterns can support honestly; open-ended types (responsibility,
 * project, leadership, domain) are deliberately not guessed.
 */

import type {
  DocumentMention,
  FactProvenance,
  FactType,
  ResumeFact,
  ResumeFactLedger,
} from "./resumeModel";
import type { ResumeBlockMapEntry } from "./resumeOoxmlWrite";
import {
  findLexiconMatches,
  lexiconEntryForTerm,
  normalizeLexiconTerm,
} from "./resumeSkillLexicon";

export class ResumeFactsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeFactsError";
  }
}

/** One paragraph of a resume, already carrying its stable Phase 3B block id. */
export type FactSourceBlock = {
  blockId: string;
  text: string;
};

export const RESUME_SECTION_KINDS = [
  "header",
  "profile",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "other",
] as const;

export type ResumeSectionKind = (typeof RESUME_SECTION_KINDS)[number];

export type ResumeSectionSpan = {
  kind: ResumeSectionKind;
  /** Heading text as written, or null for the pre-heading contact block. */
  headingText: string | null;
  headingBlockId: string | null;
  /** Heading block first, then its body blocks. */
  blockIds: string[];
};

/** One employment/project entry inside an experience-like section. */
export type ResumeRoleChunk = {
  /** Scope key used by `allowedEvidenceForBlock`. */
  key: string;
  headingBlockId: string;
  jobTitle: string | null;
  employer: string | null;
  dateRange: string | null;
  blockIds: string[];
};

export type ResumeDocumentSections = {
  sections: ResumeSectionSpan[];
  roles: ResumeRoleChunk[];
  sectionKindByBlockId: Record<string, ResumeSectionKind>;
  /** Role chunk when the block sits in one, otherwise its section. */
  scopeKeyByBlockId: Record<string, string>;
};

type FactCandidate = {
  type: FactType;
  verbatim: string;
  normalized: string;
  blockId: string;
};

const SECTION_HEADING_PATTERNS: ReadonlyArray<{ kind: ResumeSectionKind; pattern: RegExp }> = [
  { kind: "profile", pattern: /^(professional |career )?(profile|summary|objective|about( me)?)$/ },
  {
    kind: "experience",
    pattern: /^((work|professional|relevant|industry|employment) )?(experience|history|employment)$/,
  },
  { kind: "education", pattern: /^education( and training)?$/ },
  {
    kind: "skills",
    pattern: /^((technical|core|key|relevant) )?(skills|competencies|technologies|toolkit)$/,
  },
  { kind: "projects", pattern: /^((selected|personal|key) )?projects$/ },
  {
    kind: "certifications",
    pattern: /^(certifications?|licenses?|licenses? and certifications?|certifications? and licenses?)$/,
  },
];

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_POINT = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}`;
const DATE_RANGE_SOURCE = `${DATE_POINT}\\s*(?:[\u2010-\u2015\u2212-]|\\bto\\b)\\s*(?:${DATE_POINT}|present|current|now)`;

function dateRangeRegExp(): RegExp {
  return new RegExp(DATE_RANGE_SOURCE, "gi");
}

const DEGREE_SOURCE =
  "(?:b\\.?s\\.?|b\\.?a\\.?|b\\.?sc\\.?|m\\.?s\\.?|m\\.?a\\.?|m\\.?eng\\.?|mba|ph\\.?d\\.?|" +
  "bachelor(?:'s)?(?: of [a-z ]+)?|master(?:'s)?(?: of [a-z ]+)?|associate(?:'s)? degree|doctorate)";

function degreeRegExp(): RegExp {
  return new RegExp(`(?<![A-Za-z])${DEGREE_SOURCE}(?![A-Za-z])`, "gi");
}

function clearanceRegExp(): RegExp {
  return /(?:ts\/sci|top secret(?:\/sci)?|secret clearance|security clearance|public trust)/gi;
}

/**
 * A number that carries a claim: currency, a percentage/magnitude unit, or the
 * noun it counts ("3 services"). A bare digit is not evidence, and a bare year
 * is a date — both are dropped.
 */
function metricRegExp(): RegExp {
  return new RegExp(
    "(?<![\\w$.])(?:" +
      "\\$\\s?\\d+(?:[.,]\\d+)*\\s*[kmb]?\\b" +
      "|\\d+(?:[.,]\\d+)*\\s*(?:%|percent\\b|[kmbx]\\b)" +
      "|\\d+(?:[.,]\\d+)*\\s+[A-Za-z][A-Za-z-]*" +
      ")",
    "g"
  );
}

const MAX_SKILL_ITEM_LENGTH = 40;
const MAX_SKILL_ITEM_WORDS = 5;
const MAX_CERTIFICATION_LENGTH = 120;
const MAX_DEGREE_VERBATIM_LENGTH = 120;
const MAX_HEADING_LENGTH = 60;
const MAX_ROLE_HEADING_LENGTH = 120;

/** Provenances that may be used as evidence for rewriting other blocks (§20.2). */
const AUTHORITY_PROVENANCES: readonly FactProvenance[] = ["imported_source", "user_verified"];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForKey(value: string): string {
  return collapseWhitespace(value.normalize("NFC").toLowerCase());
}

function factKey(type: FactType, normalized: string): string {
  return `${type}|${normalized}`;
}

function headingKind(text: string): ResumeSectionKind | null {
  const trimmed = collapseWhitespace(text).replace(/[:•]+$/, "").trim();
  if (trimmed.length < 2 || trimmed.length > MAX_HEADING_LENGTH) return null;
  if (/[.!?]$/.test(trimmed)) return null;

  const normalized = normalizeForKey(trimmed);
  for (const { kind, pattern } of SECTION_HEADING_PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }

  // Unlabelled all-caps banner ("AWARDS") is still a section break.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && trimmed === trimmed.toUpperCase() && !/\d/.test(trimmed)) {
    return "other";
  }
  return null;
}

function firstDateRange(text: string): { value: string; start: number; end: number } | null {
  const regex = dateRangeRegExp();
  const match = regex.exec(text);
  if (!match) return null;
  return { value: collapseWhitespace(match[0]), start: match.index, end: match.index + match[0].length };
}

type ParsedRoleHeading = {
  jobTitle: string | null;
  employer: string | null;
  dateRange: string;
};

/**
 * Role headings are recognised only in their strict shape: a short line that
 * carries a date range plus a separator, e.g. "Software Engineer, Northwind
 * Labs | 2020 – 2026". Bullets and prose never become employment facts.
 */
function parseRoleHeading(text: string): ParsedRoleHeading | null {
  const trimmed = collapseWhitespace(text);
  if (trimmed.length === 0 || trimmed.length > MAX_ROLE_HEADING_LENGTH) return null;
  if (/[.!?]$/.test(trimmed)) return null;

  const range = firstDateRange(trimmed);
  if (!range) return null;

  // Split on column separators only. Dashes are excluded because the date
  // range itself ("2020 – 2026") is dash-joined.
  const parts = trimmed
    .split(/\s*[|•·]\s*|\t+|\s{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const withoutDate = parts.filter((part) => firstDateRange(part) === null);
  if (withoutDate.length === 0) return null;

  if (withoutDate.length === 1) {
    const only = withoutDate[0];
    const comma = only.indexOf(",");
    if (comma > 0) {
      return {
        jobTitle: only.slice(0, comma).trim() || null,
        employer: only.slice(comma + 1).trim() || null,
        dateRange: range.value,
      };
    }
    return { jobTitle: null, employer: only, dateRange: range.value };
  }

  return {
    jobTitle: withoutDate[0] || null,
    employer: withoutDate[1] || null,
    dateRange: range.value,
  };
}

/**
 * Split the document into sections and employment chunks (architecture §23).
 * Blocks before the first heading are the `header` (name/contact) section.
 */
export function detectResumeSections(
  blocks: readonly FactSourceBlock[]
): ResumeDocumentSections {
  const sections: ResumeSectionSpan[] = [];
  const roles: ResumeRoleChunk[] = [];
  const sectionKindByBlockId: Record<string, ResumeSectionKind> = {};
  const scopeKeyByBlockId: Record<string, string> = {};

  let current: ResumeSectionSpan | null = null;
  let currentRole: ResumeRoleChunk | null = null;

  for (const block of blocks) {
    const kind = headingKind(block.text);
    if (kind !== null) {
      const heading: ResumeSectionSpan = {
        kind,
        headingText: collapseWhitespace(block.text),
        headingBlockId: block.blockId,
        blockIds: [block.blockId],
      };
      sections.push(heading);
      current = heading;
      currentRole = null;
      sectionKindByBlockId[block.blockId] = kind;
      scopeKeyByBlockId[block.blockId] = `section:${block.blockId}`;
      continue;
    }

    if (current === null) {
      const header: ResumeSectionSpan = {
        kind: "header",
        headingText: null,
        headingBlockId: null,
        blockIds: [],
      };
      sections.push(header);
      current = header;
    }
    const section = current;
    section.blockIds.push(block.blockId);
    sectionKindByBlockId[block.blockId] = section.kind;

    const roleHeading =
      section.kind === "experience" || section.kind === "projects"
        ? parseRoleHeading(block.text)
        : null;
    if (roleHeading !== null) {
      currentRole = {
        key: `role:${block.blockId}`,
        headingBlockId: block.blockId,
        jobTitle: roleHeading.jobTitle,
        employer: roleHeading.employer,
        dateRange: roleHeading.dateRange,
        blockIds: [block.blockId],
      };
      roles.push(currentRole);
    } else if (currentRole !== null) {
      currentRole.blockIds.push(block.blockId);
    }

    scopeKeyByBlockId[block.blockId] =
      currentRole?.key ?? `section:${section.headingBlockId ?? "header"}`;
  }

  return { sections, roles, sectionKindByBlockId, scopeKeyByBlockId };
}

function pushCandidate(
  into: FactCandidate[],
  seen: Set<string>,
  candidate: FactCandidate
): void {
  if (candidate.verbatim.length === 0 || candidate.normalized.length === 0) return;
  const key = `${candidate.blockId}|${factKey(candidate.type, candidate.normalized)}`;
  if (seen.has(key)) return;
  seen.add(key);
  into.push(candidate);
}

function collectSkillItems(
  block: FactSourceBlock,
  into: FactCandidate[],
  seen: Set<string>
): void {
  for (const rawItem of block.text.split(/[,;•|]/)) {
    const item = collapseWhitespace(rawItem).replace(/[.]+$/, "").trim();
    if (item.length === 0 || item.length > MAX_SKILL_ITEM_LENGTH) continue;
    if (item.split(" ").length > MAX_SKILL_ITEM_WORDS) continue;
    // Sentence fragments ("git. This last line is …") are prose, not a skill.
    if (/[.!?]\s/.test(collapseWhitespace(rawItem))) continue;
    if (!/[A-Za-z]/.test(item)) continue;
    // Lexicon hits are already recorded as technologies.
    if (lexiconEntryForTerm(item) !== null) continue;
    pushCandidate(into, seen, {
      type: "skill_phrase",
      verbatim: item,
      normalized: normalizeForKey(item),
      blockId: block.blockId,
    });
  }
}

function collectMetrics(
  block: FactSourceBlock,
  dateSpans: ReadonlyArray<{ start: number; end: number }>,
  into: FactCandidate[],
  seen: Set<string>
): void {
  const regex = metricRegExp();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block.text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (dateSpans.some((span) => start < span.end && end > span.start)) continue;

    const verbatim = collapseWhitespace(match[0]);
    const numeric = verbatim.match(/\d+(?:[.,]\d+)*/)?.[0] ?? "";
    // "2026 roadmap" is a year, not an achievement.
    if (/^(?:19|20)\d{2}$/.test(numeric) && !/[%$]/.test(verbatim)) continue;

    pushCandidate(into, seen, {
      type: "metric",
      verbatim,
      normalized: normalizeForKey(verbatim),
      blockId: block.blockId,
    });
  }
}

function collectDegrees(block: FactSourceBlock, into: FactCandidate[], seen: Set<string>): void {
  const regex = degreeRegExp();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block.text)) !== null) {
    // Keep the institution with the degree; it is the quote grounding will cite.
    const tail = block.text.slice(match.index);
    const cut = tail.search(/\s*[|•·\t]/);
    const verbatim = collapseWhitespace(cut > 0 ? tail.slice(0, cut) : tail).slice(
      0,
      MAX_DEGREE_VERBATIM_LENGTH
    );
    pushCandidate(into, seen, {
      type: "degree",
      verbatim,
      normalized: normalizeForKey(verbatim),
      blockId: block.blockId,
    });
  }
}

function collectPattern(
  block: FactSourceBlock,
  regex: RegExp,
  type: FactType,
  into: FactCandidate[],
  seen: Set<string>
): void {
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block.text)) !== null) {
    const verbatim = collapseWhitespace(match[0]);
    pushCandidate(into, seen, {
      type,
      verbatim,
      normalized: normalizeForKey(verbatim),
      blockId: block.blockId,
    });
  }
}

/**
 * Single detector shared by the import ledger and the mention index, so a
 * mention and the imported fact it matches always normalize identically.
 */
function detectFactCandidates(
  blocks: readonly FactSourceBlock[],
  sections: ResumeDocumentSections
): FactCandidate[] {
  const candidates: FactCandidate[] = [];
  const seen = new Set<string>();
  const roleHeadingIds = new Set(sections.roles.map((role) => role.headingBlockId));
  const sectionHeadingIds = new Set(
    sections.sections
      .map((section) => section.headingBlockId)
      .filter((id): id is string => id !== null)
  );

  for (const block of blocks) {
    const kind = sections.sectionKindByBlockId[block.blockId] ?? "other";

    for (const hit of findLexiconMatches(block.text)) {
      pushCandidate(candidates, seen, {
        type: hit.type,
        verbatim: hit.verbatim,
        normalized: normalizeLexiconTerm(hit.canonical),
        blockId: block.blockId,
      });
    }

    const dateSpans: Array<{ start: number; end: number }> = [];
    const dateRegex = dateRangeRegExp();
    let dateMatch: RegExpExecArray | null;
    while ((dateMatch = dateRegex.exec(block.text)) !== null) {
      dateSpans.push({ start: dateMatch.index, end: dateMatch.index + dateMatch[0].length });
      pushCandidate(candidates, seen, {
        type: "date_range",
        verbatim: collapseWhitespace(dateMatch[0]),
        normalized: normalizeForKey(dateMatch[0]).replace(/[\u2010-\u2015\u2212]/g, "-"),
        blockId: block.blockId,
      });
    }

    collectMetrics(block, dateSpans, candidates, seen);
    collectDegrees(block, candidates, seen);
    collectPattern(block, clearanceRegExp(), "clearance", candidates, seen);

    // A section banner ("SKILLS") is a label, not a claim.
    const isSectionHeading = sectionHeadingIds.has(block.blockId);

    if (kind === "skills" && !isSectionHeading) collectSkillItems(block, candidates, seen);

    if (kind === "certifications" && !isSectionHeading && block.text.trim().length > 0) {
      const verbatim = collapseWhitespace(block.text);
      if (verbatim.length <= MAX_CERTIFICATION_LENGTH) {
        pushCandidate(candidates, seen, {
          type: "certification",
          verbatim,
          normalized: normalizeForKey(verbatim),
          blockId: block.blockId,
        });
      }
    }

    if (roleHeadingIds.has(block.blockId)) {
      const role = sections.roles.find((item) => item.headingBlockId === block.blockId);
      if (role?.employer) {
        pushCandidate(candidates, seen, {
          type: "employer",
          verbatim: role.employer,
          normalized: normalizeForKey(role.employer),
          blockId: block.blockId,
        });
      }
      if (role?.jobTitle) {
        pushCandidate(candidates, seen, {
          type: "job_title",
          verbatim: role.jobTitle,
          normalized: normalizeForKey(role.jobTitle),
          blockId: block.blockId,
        });
      }
    }
  }

  return candidates;
}

export type ExtractImportedFactsOptions = {
  /** Version 1 of the lineage; recorded as `firstSeenVersionId`. */
  firstSeenVersionId: string;
  createId?: () => string;
};

/**
 * Freeze the `imported_source` ledger from the **original** upload.
 *
 * Callers must pass blocks parsed from the immutable original bytes. Rebuilding
 * this ledger from working-copy text after edits is the one thing §20.1
 * forbids: use `classifyMentionsAgainstLedger` for anything post-import.
 */
export function extractImportedFacts(
  blocks: readonly FactSourceBlock[],
  options: ExtractImportedFactsOptions
): ResumeFactLedger {
  const firstSeenVersionId = options.firstSeenVersionId;
  if (typeof firstSeenVersionId !== "string" || firstSeenVersionId.trim().length === 0) {
    throw new ResumeFactsError("firstSeenVersionId is required to freeze an import ledger");
  }
  const createId = options.createId ?? (() => crypto.randomUUID());

  const sections = detectResumeSections(blocks);
  const candidates = detectFactCandidates(blocks, sections);

  const byKey = new Map<string, ResumeFact>();
  const facts: ResumeFact[] = [];
  for (const candidate of candidates) {
    const key = factKey(candidate.type, candidate.normalized);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.sourceBlockIds.includes(candidate.blockId)) {
        existing.sourceBlockIds.push(candidate.blockId);
      }
      continue;
    }
    const fact: ResumeFact = {
      id: createId(),
      type: candidate.type,
      verbatim: candidate.verbatim,
      normalized: candidate.normalized,
      sourceBlockIds: [candidate.blockId],
      provenance: "imported_source",
      inheritedFromFactIds: [],
      presentInWorkingDocument: true,
      firstSeenVersionId,
    };
    byKey.set(key, fact);
    facts.push(fact);
  }

  return { facts };
}

/**
 * What the working document currently says. Coverage material only — never an
 * authority set (architecture §16.2).
 */
export function buildDocumentMentionIndex(
  blocks: readonly FactSourceBlock[]
): DocumentMention[] {
  const sections = detectResumeSections(blocks);
  return detectFactCandidates(blocks, sections).map((candidate) => ({
    normalized: candidate.normalized,
    type: candidate.type,
    blockId: candidate.blockId,
    verbatim: candidate.verbatim,
  }));
}

export type ClassifyMentionsOptions = {
  /** Version the mentions were read from; used for new unverified rows. */
  firstSeenVersionId: string;
  createId?: () => string;
};

/**
 * Reconcile current mentions against the frozen ledger (architecture §20.1).
 *
 * Imported facts keep their provenance and source blocks forever; only
 * `presentInWorkingDocument` moves when the user shortens a bullet. Mentions
 * that no authority fact explains become `user_added_unverified` — never
 * `imported_source`, no matter how many times they are re-scanned.
 */
export function classifyMentionsAgainstLedger(
  ledger: ResumeFactLedger,
  mentions: readonly DocumentMention[],
  options: ClassifyMentionsOptions
): ResumeFactLedger {
  const firstSeenVersionId = options.firstSeenVersionId;
  if (typeof firstSeenVersionId !== "string" || firstSeenVersionId.trim().length === 0) {
    throw new ResumeFactsError("firstSeenVersionId is required to classify mentions");
  }
  const createId = options.createId ?? (() => crypto.randomUUID());

  const mentionKeys = new Set(mentions.map((mention) => factKey(mention.type, mention.normalized)));
  const authorityKeys = new Set(
    ledger.facts
      .filter((fact) => fact.provenance !== "user_added_unverified")
      .map((fact) => factKey(fact.type, fact.normalized))
  );

  const facts: ResumeFact[] = ledger.facts.map((fact) => ({
    ...fact,
    sourceBlockIds: [...fact.sourceBlockIds],
    inheritedFromFactIds: [...fact.inheritedFromFactIds],
    presentInWorkingDocument: mentionKeys.has(factKey(fact.type, fact.normalized)),
  }));

  const unverifiedByKey = new Map(
    facts
      .filter((fact) => fact.provenance === "user_added_unverified")
      .map((fact) => [factKey(fact.type, fact.normalized), fact] as const)
  );

  for (const mention of mentions) {
    const key = factKey(mention.type, mention.normalized);
    if (authorityKeys.has(key)) continue;

    const existing = unverifiedByKey.get(key);
    if (existing) {
      if (!existing.sourceBlockIds.includes(mention.blockId)) {
        existing.sourceBlockIds.push(mention.blockId);
      }
      existing.presentInWorkingDocument = true;
      continue;
    }

    const fact: ResumeFact = {
      id: createId(),
      type: mention.type,
      verbatim: mention.verbatim,
      normalized: mention.normalized,
      sourceBlockIds: [mention.blockId],
      provenance: "user_added_unverified",
      inheritedFromFactIds: [],
      presentInWorkingDocument: true,
      firstSeenVersionId,
    };
    unverifiedByKey.set(key, fact);
    facts.push(fact);
  }

  return { facts };
}

/**
 * Explicit user confirmation: `user_added_unverified` → `user_verified`
 * (architecture §20.3). Only this promotion makes a typed claim reusable as
 * evidence elsewhere; nothing automatic may call it.
 */
export function markFactVerified(
  ledger: ResumeFactLedger,
  factId: string,
  verifiedAtIso: string
): ResumeFactLedger {
  const target = ledger.facts.find((fact) => fact.id === factId);
  if (!target) {
    throw new ResumeFactsError("Cannot verify a fact that is not in the ledger");
  }
  return {
    facts: ledger.facts.map((fact) => {
      if (fact.id !== factId) return fact;
      if (fact.provenance !== "user_added_unverified") return fact;
      return { ...fact, provenance: "user_verified", verifiedAtIso };
    }),
  };
}

export type AllowedEvidenceOptions = {
  /**
   * Restrict evidence to the target block's own role/section plus the Skills
   * section (§20.2). Omit for document-wide evidence.
   */
  scope?: ResumeDocumentSections;
};

/**
 * Facts that may ground a rewrite of `blockId` (architecture §20.2).
 *
 * `user_added_unverified` is excluded on purpose, including for the target
 * block itself: what is already written in the block reaches the model as the
 * block's own verbatim text, not as reusable evidence. That is what stops a
 * typed "Kubernetes" in one bullet from spreading to another role.
 */
export function allowedEvidenceForBlock(
  ledger: ResumeFactLedger,
  blockId: string,
  options: AllowedEvidenceOptions = {}
): ResumeFact[] {
  const scope = options.scope;
  const targetScopeKey = scope ? scope.scopeKeyByBlockId[blockId] : undefined;

  const inScope = (fact: ResumeFact): boolean => {
    if (!scope) return true;
    return fact.sourceBlockIds.some((sourceId) => {
      if (scope.sectionKindByBlockId[sourceId] === "skills") return true;
      if (targetScopeKey === undefined) return false;
      return scope.scopeKeyByBlockId[sourceId] === targetScopeKey;
    });
  };

  const allowed = ledger.facts.filter(
    (fact) => AUTHORITY_PROVENANCES.includes(fact.provenance) && inScope(fact)
  );

  // Transformations inherit permission: every parent must already be allowed.
  const allowedIds = new Set(allowed.map((fact) => fact.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const fact of ledger.facts) {
      if (fact.provenance !== "grounded_ai_transformation") continue;
      if (allowedIds.has(fact.id)) continue;
      if (fact.inheritedFromFactIds.length === 0) continue;
      if (!fact.inheritedFromFactIds.every((parentId) => allowedIds.has(parentId))) continue;
      if (!inScope(fact)) continue;
      allowed.push(fact);
      allowedIds.add(fact.id);
      grew = true;
    }
  }

  return allowed;
}

/**
 * Document-wide allowed evidence for matching (Phase 5D). Same provenance
 * rules as `allowedEvidenceForBlock`, without role/section scoping.
 */
export function allowedEvidenceForDocument(ledger: ResumeFactLedger): ResumeFact[] {
  return allowedEvidenceForBlock(ledger, "");
}

/**
 * Unverified claims already written in this block. Safe to display or preserve
 * in place; never evidence for another block.
 */
export function sameBlockUnverifiedFacts(
  ledger: ResumeFactLedger,
  blockId: string
): ResumeFact[] {
  return ledger.facts.filter(
    (fact) =>
      fact.provenance === "user_added_unverified" && fact.sourceBlockIds.includes(blockId)
  );
}

/**
 * Pair original-upload paragraph text with the working copy's stable block ids.
 *
 * At import the working copy is byte-identical to the original apart from the
 * Phase 3B bookmarks, so paragraph order lines up. Fail closed if it does not:
 * mislabelled evidence is worse than no ledger.
 */
export function alignImportBlocksWithBlockMap(
  originalParagraphTexts: readonly string[],
  blockMap: readonly ResumeBlockMapEntry[]
): FactSourceBlock[] {
  const ordered = [...blockMap].sort((a, b) => a.order - b.order);
  if (ordered.length !== originalParagraphTexts.length) {
    throw new ResumeFactsError(
      "Block map does not match the original paragraph count; refusing to guess block identity"
    );
  }
  return ordered.map((entry, index) => {
    if (entry.order !== index) {
      throw new ResumeFactsError("Block map order is not contiguous");
    }
    if (entry.blockId.length === 0) {
      throw new ResumeFactsError("Block map entry is missing a block id");
    }
    return { blockId: entry.blockId, text: originalParagraphTexts[index] };
  });
}
