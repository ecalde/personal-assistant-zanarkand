/**
 * Deterministic job-description parser (Phase 5C).
 *
 * Architecture §22 steps 1–3 only: Unicode-normalize, split sections/bullets,
 * required vs preferred phrases, skill lexicon + aliases, years, degrees, and a
 * salience heuristic. There is no LLM pass here (Wave 6), no matcher (5D), and
 * no coverage UI (5E). Skills that are not written in the JD cannot appear.
 *
 * The JD is untrusted data (RES-SEC-002). Nothing in this module logs it.
 * Oversized pastes fail closed at the 100k cap (Phase 10A) before extract.
 */

import type {
  ParsedJobDescription,
  Requirement,
  RequirementCategory,
  RequirementPriority,
} from "./resumeModel";
import {
  findLexiconMatches,
  lexiconEntryForTerm,
  normalizeLexiconTerm,
  type LexiconMatch,
} from "./resumeSkillLexicon";
import { assertResumeJobDescriptionWithinCap } from "./resumeLimits";
import { normalizeDocumentTextForComparison } from "./resumeUnicode";

/** Bump when the deterministic extract shape or rules change. */
export const RESUME_JD_PARSER_VERSION = "jd-parse-1";

export type ParseJobDescriptionOptions = {
  /** Prefer the session form; parse fills these only as a draft. */
  jobTitle?: string;
  company?: string;
};

type JdSectionKind =
  | "required"
  | "preferred"
  | "qualifications"
  | "responsibilities"
  | "education"
  | "skip"
  | "body";

type Candidate = {
  text: string;
  section: JdSectionKind;
  /** 0 = first candidate in document order. */
  order: number;
};

const BULLET_PREFIX =
  /^(?:[\u2022\u2023\u25e6\u2043\u2219•●○■▪◦●∙·]|[-*–—]|\d+[.)]|[a-z][.)])\s+/i;

const LABELED_FIELD = /^(company|employer|job title|title|role|position|location)\s*:\s*(.+)$/i;

/**
 * Exact-line headings. A requirement line like "Must have Kubernetes" is not a
 * heading — only the whole line matching these labels is.
 */
const SECTION_HEADINGS: ReadonlyArray<{ kind: JdSectionKind; pattern: RegExp }> = [
  {
    kind: "required",
    pattern:
      /^(?:required(?: qualifications?| skills?)?|requirements?|minimum qualifications?|basic qualifications?|must[- ]haves?|what we require)$/,
  },
  {
    kind: "preferred",
    pattern:
      /^(?:nice[- ]to[- ]haves?|preferred(?: qualifications?| skills?)?|bonus(?: points?)?|optional(?: qualifications?| skills?)?|plus(?:es)?)$/,
  },
  {
    kind: "qualifications",
    pattern: /^qualifications?$/,
  },
  {
    kind: "responsibilities",
    pattern:
      /^(?:responsibilities|duties|what you(?:'|’)(?:ll| will) do|the role|about (?:the|this) role)$/,
  },
  {
    kind: "education",
    pattern: /^(?:education|educational requirements?|degrees?)$/,
  },
  {
    kind: "skip",
    pattern:
      /^(?:benefits|perks|compensation|what we offer|about (?:us|the company|the team)|how to apply|equal opportunity(?: employer)?|eeo|diversity|privacy)$/,
  },
];

const PREFERRED_CUE =
  /\bnice[\s-]+to[\s-]+have\b|\bpreferred\b|\ba plus\b|\bis a plus\b/i;
const REQUIRED_CUE = /\brequired\b|\bmust(?:[\s-]+have)?\b|\bminimum\b/i;

const YEARS_PATTERN = /\b\d+(?:\s*[-–—]\s*\d+)?\+?\s+years?\b/gi;
const DEGREE_PATTERN = new RegExp(
  "(?<![A-Za-z])(?:b\\.?s\\.?|b\\.?a\\.?|b\\.?sc\\.?|m\\.?s\\.?|m\\.?a\\.?|m\\.?eng\\.?|mba|ph\\.?d\\.?|" +
    "bachelor(?:'s)?(?: of [a-z ]+)?|master(?:'s)?(?: of [a-z ]+)?|associate(?:'s)? degree|doctorate)(?![A-Za-z])",
  "gi"
);
const SENIORITY_PATTERN =
  /\b(intern|junior|mid-level|mid level|mid|senior|staff|principal|lead)\b/i;
const LOCATION_REMOTE = /\b(remote|hybrid|on[- ]site|onsite)\b/i;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 100) / 100;
}

function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX, "").trim();
}

function headingKind(line: string): JdSectionKind | null {
  const normalized = line.replace(/[:.]\s*$/, "").trim().toLowerCase();
  if (!normalized) return null;
  for (const { kind, pattern } of SECTION_HEADINGS) {
    if (pattern.test(normalized)) return kind;
  }
  return null;
}

function defaultPriorityForSection(section: JdSectionKind): RequirementPriority {
  if (section === "required") return "required";
  if (section === "preferred") return "preferred";
  return "unspecified";
}

function detectPriority(text: string, section: JdSectionKind): RequirementPriority {
  const preferred = PREFERRED_CUE.test(text);
  const required = REQUIRED_CUE.test(text);
  if (preferred && !required) return "preferred";
  if (required && !preferred) return "required";
  if (required && preferred) {
    // Mixed clause: "must" wins so a must-have is never downranked. Callers
    // should have split mixed sentences already.
    return "required";
  }
  return defaultPriorityForSection(section);
}

/**
 * Split a line that names both a must-have and a nice-to-have into two clauses
 * so Terraform in "Must have Kubernetes. Nice to have Terraform." is preferred.
 */
function splitMixedPriorityClauses(text: string): string[] {
  const preferredAt = text.search(PREFERRED_CUE);
  const requiredAt = text.search(REQUIRED_CUE);
  if (preferredAt < 0 || requiredAt < 0) return [text];
  const splitAt = Math.max(preferredAt, requiredAt);
  if (splitAt === 0) {
    const other = Math.min(preferredAt, requiredAt) === 0 ? Math.max(preferredAt, requiredAt) : -1;
    if (other <= 0) return [text];
    const left = text.slice(0, other).trim();
    const right = text.slice(other).trim();
    return [left, right].filter((part) => part.length > 0);
  }
  const left = text.slice(0, splitAt).replace(/[.;,:\s]+$/, "").trim();
  const right = text.slice(splitAt).trim();
  if (!left || !right) return [text];
  return [left, right];
}

const ABBREV_DOT = "{{DOT}}";

function protectAbbreviations(text: string): string {
  return text.replace(/\b(e\.g|i\.e|etc|u\.s|u\.k)\./gi, (match) => match.replaceAll(".", ABBREV_DOT));
}

function restoreAbbreviations(text: string): string {
  return text.replaceAll(ABBREV_DOT, ".");
}

function splitSentences(text: string): string[] {
  const protectedText = protectAbbreviations(text);
  const parts = protectedText.split(/(?<=[.!?])\s+(?=[A-Z("])/);
  return parts.map((part) => restoreAbbreviations(part).trim()).filter((part) => part.length > 0);
}

function labeledField(line: string): { key: string; value: string } | null {
  const match = LABELED_FIELD.exec(line);
  if (!match) return null;
  return { key: match[1].toLowerCase(), value: match[2].trim() };
}

function collectCandidates(normalizedText: string): {
  candidates: Candidate[];
  labeled: { jobTitle?: string; company?: string; location?: string };
} {
  const labeled: { jobTitle?: string; company?: string; location?: string } = {};
  const candidates: Candidate[] = [];
  let section: JdSectionKind = "body";

  const rawLines = normalizedText.split("\n");
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = headingKind(line);
    if (heading) {
      section = heading;
      continue;
    }

    const field = labeledField(line);
    if (field) {
      if (field.key === "company" || field.key === "employer") labeled.company = field.value;
      else if (field.key === "location") labeled.location = field.value;
      else labeled.jobTitle = field.value;
      continue;
    }

    if (section === "skip") continue;

    const isBullet = BULLET_PREFIX.test(line);
    const withoutBullet = stripBullet(line);
    if (!withoutBullet) continue;

    const sentences = splitSentences(withoutBullet);
    const pieces = sentences.length > 0 ? sentences : [withoutBullet];
    for (const piece of pieces) {
      for (const clause of splitMixedPriorityClauses(piece)) {
        const text = clause.replace(/[.]+$/, "").trim();
        if (!text) continue;
        const hasExtractable =
          PREFERRED_CUE.test(text) ||
          REQUIRED_CUE.test(text) ||
          YEARS_PATTERN.test(text) ||
          DEGREE_PATTERN.test(text) ||
          findLexiconMatches(text).length > 0;
        YEARS_PATTERN.lastIndex = 0;
        DEGREE_PATTERN.lastIndex = 0;
        const keepStructuredLeftover =
          section === "required" ||
          section === "preferred" ||
          section === "qualifications" ||
          section === "education";
        const keep =
          hasExtractable ||
          keepStructuredLeftover ||
          (section === "responsibilities" && isBullet);
        if (!keep) continue;
        candidates.push({ text, section, order: candidates.length });
      }
    }
  }

  return { candidates, labeled };
}

function yearsMatches(text: string): string[] {
  YEARS_PATTERN.lastIndex = 0;
  return [...text.matchAll(YEARS_PATTERN)].map((match) => match[0].replace(/\s+/g, " ").toLowerCase());
}

function degreeMatches(text: string): string[] {
  DEGREE_PATTERN.lastIndex = 0;
  return [...text.matchAll(DEGREE_PATTERN)].map((match) => match[0].replace(/\s+/g, " ").toLowerCase());
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function aliasesForMatches(matches: readonly LexiconMatch[]): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const entry = lexiconEntryForTerm(match.canonical);
    if (!entry) continue;
    const canonicalNorm = normalizeLexiconTerm(entry.canonical);
    for (const alias of entry.aliases) {
      if (alias === canonicalNorm || seen.has(alias)) continue;
      seen.add(alias);
      aliases.push(alias);
    }
  }
  return aliases;
}

function categoryForCandidate(
  candidate: Candidate,
  matches: readonly LexiconMatch[],
  years: readonly string[],
  degrees: readonly string[]
): RequirementCategory {
  if (years.length > 0) return "years";
  if (degrees.length > 0) return "education";
  if (candidate.section === "responsibilities") return "responsibility";
  if (matches.length > 0) return "skill";
  if (candidate.section === "education") return "education";
  if (
    candidate.section === "required" ||
    candidate.section === "preferred" ||
    candidate.section === "qualifications"
  ) {
    return "qualification";
  }
  return "other";
}

function salienceFor(
  candidate: Candidate,
  priority: RequirementPriority,
  termRepeatMax: number,
  total: number
): number {
  let score = 0.35;
  if (priority === "required") score += 0.25;
  else if (priority === "preferred") score += 0.05;
  if (candidate.section === "required") score += 0.15;
  if (REQUIRED_CUE.test(candidate.text)) score += 0.1;
  if (total > 0 && candidate.order < total * 0.25) score += 0.1;
  if (termRepeatMax > 1) score += 0.05;
  return clamp01(score);
}

function firstSeniority(text: string): string | null {
  const match = SENIORITY_PATTERN.exec(text);
  if (!match) return null;
  const value = match[1].toLowerCase();
  if (value === "mid-level" || value === "mid level") return "mid";
  return value;
}

function firstRemoteLocation(text: string): string | null {
  const match = LOCATION_REMOTE.exec(text);
  return match ? match[1].toLowerCase().replace(/\s+/g, "-") : null;
}

/**
 * Structured extract of a pasted job description. `rawText` is the original
 * paste; parsing runs on a comparison-normalized copy so ZWSP/NBSP cannot
 * hide a term, without folding the JD into a single line.
 */
export function parseJobDescription(
  text: string,
  options: ParseJobDescriptionOptions = {}
): ParsedJobDescription {
  assertResumeJobDescriptionWithinCap(text);
  const rawText = text;
  const normalized = normalizeDocumentTextForComparison(text);
  const { candidates, labeled } = collectCandidates(normalized);

  const lexiconByCandidate = candidates.map((candidate) => findLexiconMatches(candidate.text));
  const termCounts = new Map<string, number>();
  for (const matches of lexiconByCandidate) {
    for (const match of matches) {
      const key = normalizeLexiconTerm(match.canonical);
      termCounts.set(key, (termCounts.get(key) ?? 0) + 1);
    }
  }

  const requirements: Requirement[] = candidates.map((candidate, index) => {
    const matches = lexiconByCandidate[index] ?? [];
    const years = yearsMatches(candidate.text);
    const degrees = degreeMatches(candidate.text);
    const priority = detectPriority(candidate.text, candidate.section);
    const normalizedTerms = uniqueStrings([
      ...matches.map((match) => normalizeLexiconTerm(match.canonical)),
      ...years,
      ...degrees,
    ]);
    const termRepeatMax = Math.max(0, ...normalizedTerms.map((term) => termCounts.get(term) ?? 0));
    return {
      id: `req-${index + 1}`,
      text: candidate.text,
      category: categoryForCandidate(candidate, matches, years, degrees),
      priority,
      normalizedTerms,
      aliases: aliasesForMatches(matches),
      salience: salienceFor(candidate, priority, termRepeatMax, candidates.length),
    };
  });

  const parsed: ParsedJobDescription = {
    domainTags: [],
    requirements,
    rawText,
    parserVersion: RESUME_JD_PARSER_VERSION,
  };

  const jobTitle = options.jobTitle?.trim() || labeled.jobTitle;
  if (jobTitle) parsed.jobTitle = jobTitle;

  const company = options.company?.trim() || labeled.company;
  if (company) parsed.company = company;

  const location = labeled.location || firstRemoteLocation(normalized) || undefined;
  if (location) parsed.location = location;

  const userTitle = options.jobTitle?.trim();
  if (userTitle) {
    const fromUserTitle = firstSeniority(userTitle);
    if (fromUserTitle) parsed.seniority = { value: fromUserTitle, basis: "explicit" };
  } else if (labeled.jobTitle) {
    const fromLabeledTitle = firstSeniority(labeled.jobTitle);
    if (fromLabeledTitle) parsed.seniority = { value: fromLabeledTitle, basis: "explicit" };
  } else {
    const openingLines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 3)
      .join("\n");
    const openingSeniority = firstSeniority(openingLines);
    if (openingSeniority) parsed.seniority = { value: openingSeniority, basis: "inferred" };
  }

  return parsed;
}

/** First requirement whose normalized terms or aliases include `term`. */
export function requirementMentioning(parsed: ParsedJobDescription, term: string): Requirement | undefined {
  const needle = normalizeLexiconTerm(term);
  return parsed.requirements.find(
    (requirement) =>
      requirement.normalizedTerms.includes(needle) || requirement.aliases.includes(needle)
  );
}
