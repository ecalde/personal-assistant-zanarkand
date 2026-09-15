import { describe, expect, it } from "vitest";
import {
  RESUME_SKILL_LEXICON,
  findLexiconMatches,
  lexiconEntryForTerm,
  normalizeLexiconTerm,
} from "./resumeSkillLexicon";

describe("normalizeLexiconTerm", () => {
  it("casefolds and collapses whitespace while keeping meaningful symbols", () => {
    expect(normalizeLexiconTerm("  REST   APIs ")).toBe("rest apis");
    expect(normalizeLexiconTerm("Node.js")).toBe("node.js");
    expect(normalizeLexiconTerm("C++")).toBe("c++");
    expect(normalizeLexiconTerm("C#")).toBe("c#");
    expect(normalizeLexiconTerm("CI/CD")).toBe("ci/cd");
    expect(normalizeLexiconTerm(".NET,")).toBe(".net");
  });
});

describe("RESUME_SKILL_LEXICON data hygiene", () => {
  it("stores every alias in normalized form", () => {
    for (const entry of RESUME_SKILL_LEXICON) {
      for (const alias of entry.aliases) {
        expect(normalizeLexiconTerm(alias)).toBe(alias);
      }
    }
  });

  it("never maps one alias to two entries", () => {
    const owners = new Map<string, string>();
    for (const entry of RESUME_SKILL_LEXICON) {
      for (const alias of entry.aliases) {
        const previous = owners.get(alias);
        expect(previous, `alias "${alias}" is claimed by ${previous} and ${entry.canonical}`)
          .toBeUndefined();
        owners.set(alias, entry.canonical);
      }
    }
  });

  it("knows Kubernetes, so its absence from a resume is a real absence", () => {
    expect(lexiconEntryForTerm("Kubernetes")?.canonical).toBe("Kubernetes");
    expect(lexiconEntryForTerm("k8s")?.canonical).toBe("Kubernetes");
  });
});

describe("findLexiconMatches", () => {
  it("prefers the longest alias so REST APIs is one REST API hit", () => {
    const matches = findLexiconMatches("Built REST APIs for inventory sync using Python and AWS.");
    expect(matches.map((match) => match.canonical)).toEqual(["REST API", "Python", "AWS"]);

    const rest = matches[0];
    expect(rest?.verbatim).toBe("REST APIs");
    expect(rest?.type).toBe("technology");
  });

  it("treats REST synonyms as the same canonical technology", () => {
    for (const phrase of ["RESTful services", "REST APIs", "restful web services"]) {
      const matches = findLexiconMatches(`Experience with ${phrase} in production.`);
      expect(matches.map((match) => match.canonical)).toEqual(["REST API"]);
    }
  });

  it("respects word boundaries instead of matching inside longer words", () => {
    expect(findLexiconMatches("Restored backups and reduced unrest.")).toEqual([]);
    expect(findLexiconMatches("Wrote JavaScript services.").map((m) => m.canonical)).toEqual([
      "JavaScript",
    ]);
    expect(findLexiconMatches("Wrote Java services.").map((m) => m.canonical)).toEqual(["Java"]);
  });

  it("matches symbol-bearing names and multiword aliases", () => {
    const matches = findLexiconMatches("C++, C#, Node.js, CI/CD, and Amazon Web Services.");
    expect(matches.map((match) => match.canonical)).toEqual([
      "C++",
      "C#",
      "Node.js",
      "CI/CD",
      "AWS",
    ]);
  });

  it("reports matches in document order with usable offsets", () => {
    const text = "Python then Docker";
    const matches = findLexiconMatches(text);
    expect(matches.map((match) => text.slice(match.start, match.end))).toEqual([
      "Python",
      "Docker",
    ]);
  });

  it("finds nothing in text that names no known technology", () => {
    expect(findLexiconMatches("Mentored two junior engineers on review habits.")).toEqual([]);
  });
});
