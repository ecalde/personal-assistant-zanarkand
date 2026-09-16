/**
 * Style lint + unicode pipeline for suggestion outputs (Phase 6E).
 *
 * Architecture §25 steps 6–7, §31 forbidden recommendations, RES-STY-001,
 * RES-ATS-002, RES-UNI-001. After schema + grounding, generated wording is
 * sanitized (`resumeUnicode`) then judged here. Layout estimate and Ollama
 * chat belong to later phases. Do not log resume or JD text.
 *
 * Failed lint means the suggestion is not Acceptable (architecture §25).
 * This phase does not retry the model or rewrite meaning — it reports codes
 * a later generator can feed back as a regeneration constraint.
 */

import { FORBIDDEN_HIDDEN_ATS_TRICKS } from "./resumeLlmPrompts";
import {
  sanitizeGeneratedTextWithChanges,
  type SanitizedGeneratedText,
} from "./resumeUnicode";

export const RESUME_STYLE_LINT_VERSION = "resume-style-lint-1";

export type ResumeStyleLintCode =
  | "empty"
  | "em_dash"
  | "banned_phrase"
  | "first_person"
  | "adjective_pileup"
  | "hidden_ats";

export type ResumeStyleLintFinding = {
  code: ResumeStyleLintCode;
  /**
   * Stable token from our lists (banned word, trick phrase, pronoun).
   * Never the full suggestion, resume, or JD.
   */
  token?: string;
};

export type ResumeStyleLintResult = {
  ok: boolean;
  findings: ResumeStyleLintFinding[];
};

export type PreparedSuggestionText = {
  text: string;
  sanitation: SanitizedGeneratedText;
  lint: ResumeStyleLintResult;
};

const EM_DASH = "\u2014";

/** Buzzwords the named 6E gate calls out; keep this list small and exact. */
const BANNED_PHRASES = [
  "leveraged",
  "leverage",
  "leveraging",
  "utilized",
  "utilize",
  "utilizing",
  "synergy",
  "synergies",
  "synergistic",
  "results-driven",
  "thought leader",
  "thought-leader",
  "go-getter",
  "rockstar",
  "ninja",
  "guru",
  "wheelhouse",
  "move the needle",
  "best of breed",
  "best-of-breed",
  "value-add",
  "circle back",
] as const;

const FIRST_PERSON_TOKENS = [
  "i",
  "i'm",
  "i’ve",
  "i've",
  "i’d",
  "i'd",
  "me",
  "my",
  "mine",
  "myself",
  "we",
  "we're",
  "we’re",
  "we've",
  "we’ve",
  "we'd",
  "we’d",
  "our",
  "ours",
  "ourselves",
] as const;

/**
 * Consecutive fluff adjectives (architecture §25 “adjective pile-up”).
 * Three or more in a row is the fail threshold.
 */
const FLUFF_ADJECTIVES = new Set([
  "dynamic",
  "passionate",
  "innovative",
  "motivated",
  "driven",
  "results-driven",
  "synergistic",
  "proactive",
  "seasoned",
  "proven",
  "strategic",
  "robust",
  "creative",
  "enthusiastic",
  "dedicated",
  "hardworking",
  "hard-working",
  "self-starter",
  "detail-oriented",
  "team-oriented",
  "goal-oriented",
  "visionary",
  "transformative",
]);

const HIDDEN_ATS_PHRASES: readonly string[] = [
  ...FORBIDDEN_HIDDEN_ATS_TRICKS,
  "w:vanish",
  "hidden text",
  "white-text",
  "font-size: 1",
  "font-size:1",
  "color: white",
  "color:white",
  "color:#fff",
  "color: #fff",
  "color:#ffffff",
  "off page",
  "keyword stuffing",
];

function wordBoundaryPattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

function collectPhraseHits(
  text: string,
  phrases: readonly string[],
  code: ResumeStyleLintCode
): ResumeStyleLintFinding[] {
  const findings: ResumeStyleLintFinding[] = [];
  const seen = new Set<string>();
  for (const phrase of phrases) {
    if (!wordBoundaryPattern(phrase).test(text)) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ code, token: phrase });
  }
  return findings;
}

function collectHiddenAts(text: string): ResumeStyleLintFinding[] {
  const findings: ResumeStyleLintFinding[] = [];
  const folded = text.toLowerCase();
  const seen = new Set<string>();
  for (const phrase of HIDDEN_ATS_PHRASES) {
    const needle = phrase.toLowerCase();
    if (!folded.includes(needle)) continue;
    if (seen.has(needle)) continue;
    seen.add(needle);
    findings.push({ code: "hidden_ats", token: phrase });
  }
  return findings;
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9’'-]+/i)
    .map((word) => word.replace(/^['’-]+|['’-]+$/g, ""))
    .filter((word) => word.length > 0);
}

function collectAdjectivePileup(text: string): ResumeStyleLintFinding[] {
  const words = tokenizeWords(text);
  let run = 0;
  for (const word of words) {
    if (FLUFF_ADJECTIVES.has(word)) {
      run += 1;
      if (run >= 3) {
        return [{ code: "adjective_pileup" }];
      }
    } else {
      run = 0;
    }
  }
  return [];
}

/**
 * Judge already-sanitized suggestion wording. En dash date ranges (U+2013)
 * are allowed; em dash (U+2014) is not.
 */
export function lintSuggestionText(text: string): ResumeStyleLintResult {
  const findings: ResumeStyleLintFinding[] = [];
  if (text.length === 0) {
    findings.push({ code: "empty" });
    return { ok: false, findings };
  }
  if (text.includes(EM_DASH)) {
    findings.push({ code: "em_dash" });
  }
  findings.push(...collectPhraseHits(text, BANNED_PHRASES, "banned_phrase"));
  findings.push(...collectPhraseHits(text, FIRST_PERSON_TOKENS, "first_person"));
  findings.push(...collectAdjectivePileup(text));
  findings.push(...collectHiddenAts(text));
  return { ok: findings.length === 0, findings };
}

/**
 * Unicode sanitation then style lint. Call this on LLM `proposedText` after
 * schema validation (and independently of grounding). ZWSP and other `Cf`
 * characters are stripped here so they cannot survive as keyword stuffing.
 */
export function prepareSuggestionText(rawProposedText: string): PreparedSuggestionText {
  const sanitation = sanitizeGeneratedTextWithChanges(rawProposedText);
  return {
    text: sanitation.text,
    sanitation,
    lint: lintSuggestionText(sanitation.text),
  };
}

export { BANNED_PHRASES };
