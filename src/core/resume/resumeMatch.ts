/**
 * Deterministic JD ↔ resume matcher (Phase 5D).
 *
 * Architecture §24 layers 1–3 only: exact (casefold / punctuation), lexicon
 * alias table, and a conservative Levenshtein cap for typos. There is no LLM
 * mapping here (Wave 6). Coverage *percentages* live here so 5E can render
 * honest bars without a second matcher.
 *
 * Two views, one status per requirement:
 * - `explicit` / `semantic_supported` use **allowed** evidence only.
 * - `on_page_unverified` is coverage of `user_added_unverified` mentions.
 * - `absent` means no allowed evidence and not on the page.
 *
 * Kubernetes that is only typed into a bullet stays unverified; REST APIs vs
 * RESTful services is alias support, not an exact hit. JD and resume text are
 * untrusted data (RES-SEC-002) and are never logged.
 */

import { allowedEvidenceForDocument } from "./resumeFacts";
import type {
  DocumentMention,
  MatchCoverageSummary,
  MatchResult,
  Requirement,
  RequirementMatch,
  RequirementMatchStatus,
  ResumeFact,
  ResumeFactLedger,
  ParsedJobDescription,
} from "./resumeModel";
import {
  findLexiconMatches,
  lexiconEntryForTerm,
  normalizeLexiconTerm,
  type LexiconMatch,
} from "./resumeSkillLexicon";

/** Bump when the match shape or rules change. */
export const RESUME_JD_MATCHER_VERSION = "jd-match-1";

export type MatchJobDescriptionInput = {
  parsedJob: ParsedJobDescription;
  ledger: ResumeFactLedger;
  /** Optional working-copy mention index (coverage only). */
  mentionIndex?: readonly DocumentMention[];
  /** Calendar year for "present" date ranges. Tests pass a fixed year. */
  asOfYear?: number;
};

const STATUS_WEAKNESS: Record<RequirementMatchStatus, number> = {
  explicit: 0,
  semantic_supported: 1,
  on_page_unverified: 2,
  uncertain: 3,
  contradicted: 4,
  absent: 5,
};

const SKILL_CATEGORIES = new Set(["skill", "language", "framework", "tool"]);

const YEAR_TOKEN = /(?:19|20)\d{2}/g;
const PRESENT_TOKEN = /\b(?:present|current|now)\b/i;
const LEADING_YEARS = /(\d+)/;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 100) / 100;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return clamp01(numerator / denominator);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function weaker(a: RequirementMatchStatus, b: RequirementMatchStatus): RequirementMatchStatus {
  return STATUS_WEAKNESS[a] >= STATUS_WEAKNESS[b] ? a : b;
}

function canonicalOf(term: string): string | null {
  return lexiconEntryForTerm(term)?.canonical ?? null;
}

function surfacesMatch(left: string, right: string): boolean {
  return normalizeLexiconTerm(left) === normalizeLexiconTerm(right);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const next = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    next[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      next[j] = Math.min((prev[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = next[j] ?? 0;
  }
  return prev[b.length] ?? b.length;
}

function fuzzyCap(length: number): number | null {
  if (length < 6) return null;
  if (length < 10) return 1;
  return 2;
}

function isFuzzyTypo(left: string, right: string): boolean {
  if (left === right) return false;
  const cap = fuzzyCap(Math.min(left.length, right.length));
  if (cap === null) return false;
  if (Math.abs(left.length - right.length) > cap) return false;
  const leftCanon = canonicalOf(left);
  const rightCanon = canonicalOf(right);
  if (leftCanon && rightCanon && leftCanon !== rightCanon) return false;
  return levenshtein(left, right) <= cap;
}

function unverifiedFacts(ledger: ResumeFactLedger): ResumeFact[] {
  return ledger.facts.filter(
    (fact) => fact.provenance === "user_added_unverified" && fact.presentInWorkingDocument
  );
}

function factsForCanonical(facts: readonly ResumeFact[], canonical: string): ResumeFact[] {
  return facts.filter((fact) => {
    const fromNormalized = canonicalOf(fact.normalized);
    const fromVerbatim = canonicalOf(fact.verbatim);
    return fromNormalized === canonical || fromVerbatim === canonical;
  });
}

function mentionsForCanonical(
  mentions: readonly DocumentMention[],
  canonical: string
): DocumentMention[] {
  return mentions.filter((mention) => canonicalOf(mention.normalized) === canonical);
}

function blockIdsFor(
  facts: readonly ResumeFact[],
  mentions: readonly DocumentMention[]
): string[] {
  return uniqueStrings([
    ...facts.flatMap((fact) => fact.sourceBlockIds),
    ...mentions.map((mention) => mention.blockId),
  ]);
}

function emptyMatch(requirementId: string, status: RequirementMatchStatus): RequirementMatch {
  return {
    requirementId,
    status,
    evidenceFactIds: [],
    mentionBlockIds: [],
    matchedTerm: null,
  };
}

function hitSurfaceEqualsFact(hit: LexiconMatch, fact: ResumeFact): boolean {
  // Explicit is same *surface*, not same lexicon canonical. RESTful vs REST APIs
  // share a canonical but must stay semantic_supported (architecture §24).
  return (
    surfacesMatch(hit.verbatim, fact.verbatim) ||
    normalizeLexiconTerm(hit.verbatim) === fact.normalized
  );
}

function matchLexiconHitAgainstFacts(
  hit: LexiconMatch,
  facts: readonly ResumeFact[],
  mentions: readonly DocumentMention[],
  asAllowedEvidence: boolean
): RequirementMatch | null {
  const matchingFacts = factsForCanonical(facts, hit.canonical);
  const matchingMentions = mentionsForCanonical(mentions, hit.canonical);
  // Mentions answer "is this word on the page?" They are never allowed
  // evidence on their own (architecture §16.2 / §24). Otherwise a typed
  // Kubernetes mention would silently look like semantic_supported.
  if (asAllowedEvidence) {
    if (matchingFacts.length === 0) return null;
  } else if (matchingFacts.length === 0 && matchingMentions.length === 0) {
    return null;
  }

  const surfaceFact = matchingFacts.find((fact) => hitSurfaceEqualsFact(hit, fact));
  const status: RequirementMatchStatus = asAllowedEvidence
    ? surfaceFact
      ? "explicit"
      : "semantic_supported"
    : "on_page_unverified";

  return {
    requirementId: "",
    status,
    evidenceFactIds: asAllowedEvidence ? matchingFacts.map((fact) => fact.id) : [],
    mentionBlockIds: blockIdsFor(matchingFacts, matchingMentions),
    matchedTerm: surfaceFact?.verbatim ?? matchingFacts[0]?.verbatim ?? hit.verbatim,
  };
}

function fuzzyAgainstFacts(
  term: string,
  facts: readonly ResumeFact[]
): { fact: ResumeFact; term: string } | null {
  const needle = normalizeLexiconTerm(term);
  if (!needle) return null;
  for (const fact of facts) {
    if (isFuzzyTypo(needle, fact.normalized) || isFuzzyTypo(needle, normalizeLexiconTerm(fact.verbatim))) {
      return { fact, term: fact.verbatim };
    }
  }
  return null;
}

function lexiconHitsFor(requirement: Requirement): LexiconMatch[] {
  const fromText = findLexiconMatches(requirement.text);
  if (fromText.length > 0) return fromText;

  const reconstructed: LexiconMatch[] = [];
  for (const term of [...requirement.normalizedTerms, ...requirement.aliases]) {
    const entry = lexiconEntryForTerm(term);
    if (!entry) continue;
    if (reconstructed.some((hit) => hit.canonical === entry.canonical)) continue;
    reconstructed.push({
      canonical: entry.canonical,
      type: entry.type,
      verbatim: term,
      start: 0,
      end: term.length,
    });
  }
  return reconstructed;
}

function combineMatches(requirementId: string, parts: RequirementMatch[]): RequirementMatch {
  if (parts.length === 0) return emptyMatch(requirementId, "absent");
  let status: RequirementMatchStatus = parts[0]?.status ?? "absent";
  for (const part of parts.slice(1)) status = weaker(status, part.status);
  return {
    requirementId,
    status,
    evidenceFactIds: uniqueStrings(parts.flatMap((part) => part.evidenceFactIds)),
    mentionBlockIds: uniqueStrings(parts.flatMap((part) => part.mentionBlockIds)),
    matchedTerm: parts.find((part) => part.status === status)?.matchedTerm ?? parts[0]?.matchedTerm ?? null,
  };
}

function minYearsFrom(requirement: Requirement): number | null {
  for (const term of requirement.normalizedTerms) {
    if (!/year/.test(term)) continue;
    const match = LEADING_YEARS.exec(term);
    LEADING_YEARS.lastIndex = 0;
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  const fromText = requirement.text.match(/(\d+)\s*\+?\s*years?/i);
  if (!fromText) return null;
  const value = Number(fromText[1]);
  return Number.isFinite(value) ? value : null;
}

function careerSpanYears(facts: readonly ResumeFact[], asOfYear: number): number | null {
  const years: number[] = [];
  for (const fact of facts) {
    if (fact.type !== "date_range") continue;
    YEAR_TOKEN.lastIndex = 0;
    const found = [...fact.verbatim.matchAll(YEAR_TOKEN)].map((match) => Number(match[0]));
    years.push(...found.filter((year) => Number.isFinite(year)));
    if (PRESENT_TOKEN.test(fact.verbatim) || PRESENT_TOKEN.test(fact.normalized)) {
      years.push(asOfYear);
    }
  }
  if (years.length === 0) return null;
  return Math.max(...years) - Math.min(...years);
}

function yearsPhraseFacts(facts: readonly ResumeFact[], minYears: number): ResumeFact[] {
  return facts.filter((fact) => {
    const haystack = `${fact.verbatim} ${fact.normalized}`.toLowerCase();
    if (!/year/.test(haystack)) return false;
    const match = haystack.match(/(\d+)\s*\+?\s*years?/);
    if (!match) return /year/.test(haystack);
    return Number(match[1]) >= minYears;
  });
}

function matchYears(
  requirement: Requirement,
  allowed: readonly ResumeFact[],
  asOfYear: number
): RequirementMatch {
  const minYears = minYearsFrom(requirement);
  const phraseHits = minYears === null ? [] : yearsPhraseFacts(allowed, minYears);
  if (phraseHits.length > 0) {
    return {
      requirementId: requirement.id,
      status: "explicit",
      evidenceFactIds: phraseHits.map((fact) => fact.id),
      mentionBlockIds: blockIdsFor(phraseHits, []),
      matchedTerm: phraseHits[0]?.verbatim ?? null,
    };
  }

  if (minYears !== null) {
    const span = careerSpanYears(allowed, asOfYear);
    if (span !== null && span < minYears) {
      const dateFacts = allowed.filter((fact) => fact.type === "date_range");
      return {
        requirementId: requirement.id,
        status: "contradicted",
        evidenceFactIds: dateFacts.map((fact) => fact.id),
        mentionBlockIds: blockIdsFor(dateFacts, []),
        matchedTerm: `${minYears}+ years`,
      };
    }
  }

  return emptyMatch(requirement.id, "absent");
}

function educationTerms(requirement: Requirement): string[] {
  return uniqueStrings(
    [...requirement.normalizedTerms, ...requirement.aliases]
      .map((term) => term.toLowerCase())
      .filter((term) => term.length > 0)
  );
}

function matchEducation(
  requirement: Requirement,
  allowed: readonly ResumeFact[],
  unverified: readonly ResumeFact[]
): RequirementMatch {
  const needles = educationTerms(requirement);
  if (needles.length === 0) return matchLeftover(requirement, allowed, unverified);

  const factHasDegree = (fact: ResumeFact): boolean => {
    if (fact.type !== "degree") return false;
    const haystack = `${normalizeLexiconTerm(fact.verbatim)} ${fact.normalized}`;
    return needles.some((needle) => haystack.includes(needle) || needle.includes(haystack));
  };

  const allowedHits = allowed.filter((fact) => fact.type === "degree" && factHasDegree(fact));
  if (allowedHits.length > 0) {
    return {
      requirementId: requirement.id,
      status: "explicit",
      evidenceFactIds: allowedHits.map((fact) => fact.id),
      mentionBlockIds: blockIdsFor(allowedHits, []),
      matchedTerm: allowedHits[0]?.verbatim ?? null,
    };
  }

  const unverifiedHits = unverified.filter((fact) => fact.type === "degree" && factHasDegree(fact));
  if (unverifiedHits.length > 0) {
    return {
      requirementId: requirement.id,
      status: "on_page_unverified",
      evidenceFactIds: [],
      mentionBlockIds: blockIdsFor(unverifiedHits, []),
      matchedTerm: unverifiedHits[0]?.verbatim ?? null,
    };
  }

  return emptyMatch(requirement.id, "absent");
}

function leftoverNeedle(requirement: Requirement): string {
  return normalizeLexiconTerm(requirement.text);
}

function matchLeftover(
  requirement: Requirement,
  allowed: readonly ResumeFact[],
  unverified: readonly ResumeFact[]
): RequirementMatch {
  const needle = leftoverNeedle(requirement);
  if (needle.length < 4) return emptyMatch(requirement.id, "absent");

  const exactAllowed = allowed.filter((fact) => {
    const surface = normalizeLexiconTerm(fact.verbatim);
    if (surface.length < 4) return false;
    return needle.includes(surface) || surface.includes(needle) || fact.normalized === needle;
  });
  if (exactAllowed.length > 0) {
    return {
      requirementId: requirement.id,
      status: "explicit",
      evidenceFactIds: exactAllowed.map((fact) => fact.id),
      mentionBlockIds: blockIdsFor(exactAllowed, []),
      matchedTerm: exactAllowed[0]?.verbatim ?? null,
    };
  }

  const exactUnverified = unverified.filter((fact) => {
    const surface = normalizeLexiconTerm(fact.verbatim);
    if (surface.length < 4) return false;
    return needle.includes(surface) || surface.includes(needle);
  });
  if (exactUnverified.length > 0) {
    return {
      requirementId: requirement.id,
      status: "on_page_unverified",
      evidenceFactIds: [],
      mentionBlockIds: blockIdsFor(exactUnverified, []),
      matchedTerm: exactUnverified[0]?.verbatim ?? null,
    };
  }

  const fuzzy = fuzzyAgainstFacts(needle, allowed);
  if (fuzzy) {
    return {
      requirementId: requirement.id,
      status: "uncertain",
      evidenceFactIds: [fuzzy.fact.id],
      mentionBlockIds: blockIdsFor([fuzzy.fact], []),
      matchedTerm: fuzzy.term,
    };
  }

  return emptyMatch(requirement.id, "absent");
}

function matchSkillLike(
  requirement: Requirement,
  allowed: readonly ResumeFact[],
  unverified: readonly ResumeFact[],
  mentions: readonly DocumentMention[]
): RequirementMatch {
  const hits = lexiconHitsFor(requirement);
  if (hits.length === 0) return matchLeftover(requirement, allowed, unverified);

  const parts: RequirementMatch[] = [];
  for (const hit of hits) {
    const allowedHit = matchLexiconHitAgainstFacts(hit, allowed, mentions, true);
    if (allowedHit) {
      parts.push({ ...allowedHit, requirementId: requirement.id });
      continue;
    }
    const unverifiedHit = matchLexiconHitAgainstFacts(hit, unverified, mentions, false);
    if (unverifiedHit) {
      parts.push({ ...unverifiedHit, requirementId: requirement.id });
      continue;
    }
    const fuzzy = fuzzyAgainstFacts(hit.canonical, allowed) ?? fuzzyAgainstFacts(hit.verbatim, allowed);
    if (fuzzy) {
      parts.push({
        requirementId: requirement.id,
        status: "uncertain",
        evidenceFactIds: [fuzzy.fact.id],
        mentionBlockIds: blockIdsFor([fuzzy.fact], []),
        matchedTerm: fuzzy.term,
      });
      continue;
    }
    parts.push(emptyMatch(requirement.id, "absent"));
  }

  return combineMatches(requirement.id, parts);
}

function matchRequirement(
  requirement: Requirement,
  allowed: readonly ResumeFact[],
  unverified: readonly ResumeFact[],
  mentions: readonly DocumentMention[],
  asOfYear: number
): RequirementMatch {
  if (requirement.category === "years") {
    return matchYears(requirement, allowed, asOfYear);
  }
  if (requirement.category === "education") {
    return matchEducation(requirement, allowed, unverified);
  }
  if (SKILL_CATEGORIES.has(requirement.category) || requirement.category === "responsibility") {
    return matchSkillLike(requirement, allowed, unverified, mentions);
  }
  const skillHits = lexiconHitsFor(requirement);
  if (skillHits.length > 0) {
    return matchSkillLike(requirement, allowed, unverified, mentions);
  }
  return matchLeftover(requirement, allowed, unverified);
}

function summarize(
  parsedJob: ParsedJobDescription,
  matches: readonly RequirementMatch[]
): MatchCoverageSummary {
  const byId = new Map(matches.map((match) => [match.requirementId, match] as const));
  const of = (requirement: Requirement): RequirementMatchStatus =>
    byId.get(requirement.id)?.status ?? "absent";

  const required = parsedJob.requirements.filter((requirement) => requirement.priority === "required");
  const preferred = parsedJob.requirements.filter((requirement) => requirement.priority === "preferred");
  const responsibilities = parsedJob.requirements.filter(
    (requirement) => requirement.category === "responsibility"
  );

  const requiredExplicit = required.filter((requirement) => of(requirement) === "explicit");
  const preferredExplicit = preferred.filter((requirement) => of(requirement) === "explicit");
  const missingRequired = required.filter((requirement) => {
    const status = of(requirement);
    return status === "absent" || status === "contradicted";
  });
  const aligned = responsibilities.filter((requirement) => {
    const status = of(requirement);
    return status === "explicit" || status === "semantic_supported";
  });

  return {
    requiredTotal: required.length,
    requiredExplicitCount: requiredExplicit.length,
    requiredExplicitCoverage: ratio(requiredExplicit.length, required.length),
    preferredTotal: preferred.length,
    preferredExplicitCount: preferredExplicit.length,
    preferredExplicitCoverage: ratio(preferredExplicit.length, preferred.length),
    semanticSupportedCount: matches.filter((match) => match.status === "semantic_supported").length,
    missingRequiredIds: missingRequired.map((requirement) => requirement.id),
    uncertainIds: matches.filter((match) => match.status === "uncertain").map((match) => match.requirementId),
    onPageUnverifiedIds: matches
      .filter((match) => match.status === "on_page_unverified")
      .map((match) => match.requirementId),
    contradictedIds: matches
      .filter((match) => match.status === "contradicted")
      .map((match) => match.requirementId),
    responsibilityTotal: responsibilities.length,
    responsibilityAlignedCount: aligned.length,
    responsibilityAlignment: ratio(aligned.length, responsibilities.length),
  };
}

/**
 * Compare a parsed job description to a resume fact ledger.
 *
 * Does not persist, does not call Ollama, and does not invent facts that are
 * not already in the ledger or mention index.
 */
export function matchJobDescription(input: MatchJobDescriptionInput): MatchResult {
  const allowed = allowedEvidenceForDocument(input.ledger);
  const unverified = unverifiedFacts(input.ledger);
  const mentions = input.mentionIndex ?? [];
  const asOfYear = input.asOfYear ?? new Date().getFullYear();

  const requirements = input.parsedJob.requirements.map((requirement) =>
    matchRequirement(requirement, allowed, unverified, mentions, asOfYear)
  );

  return {
    matcherVersion: RESUME_JD_MATCHER_VERSION,
    requirements,
    coverage: summarize(input.parsedJob, requirements),
  };
}

export function matchForRequirement(
  result: MatchResult,
  requirementId: string
): RequirementMatch | undefined {
  return result.requirements.find((match) => match.requirementId === requirementId);
}
