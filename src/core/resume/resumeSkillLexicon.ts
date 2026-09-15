/**
 * Resume skill lexicon (Phase 3C).
 *
 * Data plus tests, never a model (architecture §28). This is the only place a
 * technology name can enter the fact ledger, and it takes **no job-description
 * input**: a term that is not written on the resume can never be detected from
 * a JD. Alias groups also give Phase 5D the "REST APIs" ≈ "RESTful services"
 * synonym table it needs.
 *
 * Detection is intentionally high precision. Ambiguous bare words ("go", "r",
 * "spark", "js") are left out rather than manufacturing facts a resume does not
 * support — a missed synonym shows up as a coverage gap, an invented one would
 * become false evidence.
 */

import type { FactType } from "./resumeModel";

/** Lexicon hits are concrete technologies or named methodologies. */
export type LexiconFactType = Extract<FactType, "technology" | "skill_phrase">;

export type LexiconEntry = {
  /** Display form used as the fact's canonical name. */
  canonical: string;
  type: LexiconFactType;
  /** Normalized surface forms; longest match wins. */
  aliases: readonly string[];
};

export const RESUME_SKILL_LEXICON: readonly LexiconEntry[] = [
  { canonical: "Python", type: "technology", aliases: ["python", "python3"] },
  {
    canonical: "REST API",
    type: "technology",
    aliases: [
      "rest api",
      "rest apis",
      "restful api",
      "restful apis",
      "restful services",
      "restful web services",
      "rest services",
      "rest web services",
      "restful",
      "rest",
    ],
  },
  { canonical: "GraphQL", type: "technology", aliases: ["graphql"] },
  { canonical: "gRPC", type: "technology", aliases: ["grpc"] },
  { canonical: "AWS", type: "technology", aliases: ["aws", "amazon web services"] },
  { canonical: "Azure", type: "technology", aliases: ["azure", "microsoft azure"] },
  {
    canonical: "Google Cloud",
    type: "technology",
    aliases: ["gcp", "google cloud", "google cloud platform"],
  },
  { canonical: "Docker", type: "technology", aliases: ["docker"] },
  { canonical: "Kubernetes", type: "technology", aliases: ["kubernetes", "k8s"] },
  { canonical: "Terraform", type: "technology", aliases: ["terraform"] },
  { canonical: "Linux", type: "technology", aliases: ["linux", "unix"] },
  { canonical: "Bash", type: "technology", aliases: ["bash", "shell scripting"] },
  { canonical: "SQL", type: "technology", aliases: ["sql"] },
  { canonical: "PostgreSQL", type: "technology", aliases: ["postgresql", "postgres"] },
  { canonical: "MySQL", type: "technology", aliases: ["mysql"] },
  { canonical: "MongoDB", type: "technology", aliases: ["mongodb"] },
  { canonical: "Redis", type: "technology", aliases: ["redis"] },
  { canonical: "Elasticsearch", type: "technology", aliases: ["elasticsearch"] },
  { canonical: "Kafka", type: "technology", aliases: ["kafka", "apache kafka"] },
  { canonical: "Snowflake", type: "technology", aliases: ["snowflake"] },
  { canonical: "Airflow", type: "technology", aliases: ["airflow", "apache airflow"] },
  { canonical: "Spark", type: "technology", aliases: ["apache spark", "pyspark"] },
  { canonical: "Git", type: "technology", aliases: ["git"] },
  { canonical: "GitHub Actions", type: "technology", aliases: ["github actions"] },
  { canonical: "Jenkins", type: "technology", aliases: ["jenkins"] },
  { canonical: "JavaScript", type: "technology", aliases: ["javascript"] },
  { canonical: "TypeScript", type: "technology", aliases: ["typescript"] },
  { canonical: "React", type: "technology", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "Vue", type: "technology", aliases: ["vue.js", "vuejs"] },
  { canonical: "Angular", type: "technology", aliases: ["angular"] },
  { canonical: "Node.js", type: "technology", aliases: ["node.js", "nodejs", "node js"] },
  { canonical: "Java", type: "technology", aliases: ["java"] },
  { canonical: "C#", type: "technology", aliases: ["c#", "csharp"] },
  { canonical: "C++", type: "technology", aliases: ["c++"] },
  { canonical: "Go", type: "technology", aliases: ["golang"] },
  { canonical: "Ruby", type: "technology", aliases: ["ruby", "ruby on rails"] },
  { canonical: "PHP", type: "technology", aliases: ["php"] },
  { canonical: "Rust", type: "technology", aliases: ["rust"] },
  { canonical: "Swift", type: "technology", aliases: ["swift"] },
  { canonical: "Kotlin", type: "technology", aliases: ["kotlin"] },
  { canonical: "Django", type: "technology", aliases: ["django"] },
  { canonical: "Flask", type: "technology", aliases: ["flask"] },
  { canonical: "Spring Boot", type: "technology", aliases: ["spring boot"] },
  { canonical: ".NET", type: "technology", aliases: [".net", "asp.net", "dotnet"] },
  { canonical: "pandas", type: "technology", aliases: ["pandas"] },
  { canonical: "NumPy", type: "technology", aliases: ["numpy"] },
  { canonical: "TensorFlow", type: "technology", aliases: ["tensorflow"] },
  { canonical: "PyTorch", type: "technology", aliases: ["pytorch"] },
  { canonical: "Tableau", type: "technology", aliases: ["tableau"] },
  { canonical: "Power BI", type: "technology", aliases: ["power bi"] },
  { canonical: "Jira", type: "technology", aliases: ["jira"] },
  { canonical: "Selenium", type: "technology", aliases: ["selenium"] },
  { canonical: "Salesforce", type: "technology", aliases: ["salesforce"] },
  {
    canonical: "CI/CD",
    type: "skill_phrase",
    aliases: ["ci/cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"],
  },
  {
    canonical: "Microservices",
    type: "skill_phrase",
    aliases: ["microservices", "microservice architecture"],
  },
  { canonical: "Agile", type: "skill_phrase", aliases: ["agile"] },
  { canonical: "Scrum", type: "skill_phrase", aliases: ["scrum"] },
  { canonical: "Machine Learning", type: "skill_phrase", aliases: ["machine learning"] },
  { canonical: "Data Pipelines", type: "skill_phrase", aliases: ["data pipelines", "etl"] },
];

/**
 * Casefold for comparison. Keeps `+ # . /` because they carry meaning in
 * technology names (`C++`, `C#`, `Node.js`, `CI/CD`).
 */
export function normalizeLexiconTerm(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9+#./]+/, "")
    .replace(/[^a-z0-9+#]+$/, "")
    .trim();
}

export type LexiconMatch = {
  canonical: string;
  type: LexiconFactType;
  /** Surface text exactly as it appears in the document. */
  verbatim: string;
  start: number;
  end: number;
};

/**
 * Word-ish boundaries. Letters, digits, `+` and `#` may not touch a match, so
 * "rest" does not fire inside "restore" and "java" does not fire inside
 * "javascript", while "REST APIs," and "C++." still match.
 */
const BOUNDARY_PREFIX = "(?<![A-Za-z0-9+#])";
const BOUNDARY_SUFFIX = "(?![A-Za-z0-9+#])";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CompiledAlias = { entry: LexiconEntry; pattern: RegExp };

const COMPILED_ALIASES: CompiledAlias[] = RESUME_SKILL_LEXICON.flatMap((entry) =>
  entry.aliases.map((alias) => ({
    entry,
    // A literal space in an alias matches any run of whitespace in the document.
    pattern: new RegExp(
      `${BOUNDARY_PREFIX}${escapeRegExp(alias).replace(/ /g, "\\s+")}${BOUNDARY_SUFFIX}`,
      "gi"
    ),
  }))
);

const ENTRY_BY_ALIAS: Map<string, LexiconEntry> = new Map(
  RESUME_SKILL_LEXICON.flatMap((entry) =>
    [...entry.aliases, entry.canonical].map(
      (alias) => [normalizeLexiconTerm(alias), entry] as const
    )
  )
);

/** Lexicon entry for a single term (alias or canonical name), else null. */
export function lexiconEntryForTerm(term: string): LexiconEntry | null {
  return ENTRY_BY_ALIAS.get(normalizeLexiconTerm(term)) ?? null;
}

/**
 * Every lexicon hit in `text`, in document order. Overlaps resolve
 * longest-first, so "REST APIs" yields one REST API match instead of also
 * reporting the shorter "REST" alias inside it.
 */
export function findLexiconMatches(text: string): LexiconMatch[] {
  const found: LexiconMatch[] = [];
  for (const { entry, pattern } of COMPILED_ALIASES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({
        canonical: entry.canonical,
        type: entry.type,
        verbatim: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept: LexiconMatch[] = [];
  let consumedUpTo = -1;
  for (const candidate of found) {
    if (candidate.start < consumedUpTo) continue;
    kept.push(candidate);
    consumedUpTo = candidate.end;
  }
  return kept;
}
