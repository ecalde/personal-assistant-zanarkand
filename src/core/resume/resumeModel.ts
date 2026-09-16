/**
 * Resume domain types. Isolated from AppPayload (architecture §33).
 * Persistence, mappers, and UI belong to later phases.
 */

function isAllowlisted<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export const FACT_PROVENANCES = [
  "imported_source",
  "grounded_ai_transformation",
  "user_added_unverified",
  "user_verified",
] as const;

export type FactProvenance = (typeof FACT_PROVENANCES)[number];

export const FACT_TYPES = [
  "employer",
  "job_title",
  "date_range",
  "degree",
  "certification",
  "technology",
  "skill_phrase",
  "responsibility",
  "metric",
  "project",
  "leadership",
  "domain",
  "clearance",
] as const;

export type FactType = (typeof FACT_TYPES)[number];

export type ResumeFact = {
  id: string;
  type: FactType;
  verbatim: string;
  normalized: string;
  sourceBlockIds: string[];
  provenance: FactProvenance;
  inheritedFromFactIds: string[];
  presentInWorkingDocument: boolean;
  firstSeenVersionId: string;
  verifiedAtIso?: string;
};

export type ResumeFactLedger = {
  facts: ResumeFact[];
};

export type DocumentMention = {
  normalized: string;
  type: FactType;
  blockId: string;
  verbatim: string;
};

export const RESUME_SOURCE_KINDS = ["upload", "edit", "tailor", "duplicate"] as const;

export type ResumeSourceKind = (typeof RESUME_SOURCE_KINDS)[number];

export const ATS_WARNING_CODES = [
  "no_selectable_text",
  "table_layout",
  "text_box_content",
  "multi_column_section",
  "multiple_sections",
  "contact_only_in_header_footer",
  "image_without_alt_text",
  "nonstandard_bullet_font",
  "reading_order_uncertain",
  "broken_hyperlink",
] as const;

export type AtsWarningCode = (typeof ATS_WARNING_CODES)[number];

/**
 * `warning` = a documented parser failure mode is present. `info` = a
 * structure worth knowing about that often parses fine. Neither is a verdict.
 */
export type AtsWarningSeverity = "info" | "warning";

export type ResumeAtsWarning = {
  code: AtsWarningCode;
  severity: AtsWarningSeverity;
  /** How many offending structures were found (1 when counting is meaningless). */
  occurrences: number;
  message: string;
};

/**
 * Deliberately just a warning list. No aggregate number belongs here: an
 * "ATS score" is forbidden by ADR-014 / RES-ATS-001.
 */
export type ResumeAtsReport = {
  warnings: ResumeAtsWarning[];
};

/** Secondary block map entry (architecture §19.2). */
export type ResumeBlockMapEntry = {
  /** Stable UUID (bookmark name without the `pa_` prefix). */
  blockId: string;
  /** Full bookmark name written into the DOCX (`pa_<uuid>`). */
  bookmarkName: string;
  /** Zero-based document reading order of the paragraph. */
  order: number;
};

/** One formatting-homogeneous run as persisted on the version row. */
export type ResumeStructureRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font: string | null;
  sizePt: number | null;
  hyperlinkRelId: string | null;
};

export type ResumeStructureBlock = {
  order: number;
  text: string;
  blockId: string | null;
  bookmarkName: string | null;
  runs: ResumeStructureRun[];
};

/**
 * Persisted projection of the Phase 3A block graph. Structure only — the DOCX
 * bytes stay in Storage and are never encoded into this jsonb.
 */
export type ResumeStructureGraph = {
  blocks: ResumeStructureBlock[];
};

export type ResumeExtractedStructure = {
  mentionIndex: DocumentMention[];
  graph?: ResumeStructureGraph;
  blockMap?: ResumeBlockMapEntry[];
  atsWarnings?: ResumeAtsWarning[];
};

export type Resume = {
  id: string;
  userId: string;
  name: string;
  sourceFilename: string;
  isDefault: boolean;
  activeVersionId: string | null;
  importFactLedger: ResumeFactLedger;
  createdAtIso: string;
  updatedAtIso: string;
};

export type ResumeVersion = {
  id: string;
  userId: string;
  resumeId: string;
  parentVersionId: string | null;
  versionN: number;
  label: string | null;
  sourceKind: ResumeSourceKind;
  originalStoragePath: string;
  workingStoragePath: string;
  /** SHA-256 of the **working** bytes (architecture §33). The original object's digest lives in `originalStoragePath`. */
  sha256: string;
  extractedStructure: ResumeExtractedStructure;
  pageCountEstimated: number | null;
  createdAtIso: string;
};

export const JOB_SESSION_RETENTIONS = ["until_replaced"] as const;

export type JobSessionRetention = (typeof JOB_SESSION_RETENTIONS)[number];

export const REQUIREMENT_PRIORITIES = ["required", "preferred", "unspecified"] as const;

export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

export const REQUIREMENT_CATEGORIES = [
  "skill",
  "language",
  "framework",
  "tool",
  "responsibility",
  "qualification",
  "education",
  "years",
  "domain",
  "seniority",
  "other",
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export type Requirement = {
  id: string;
  text: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  normalizedTerms: string[];
  aliases: string[];
  salience: number;
};

export type ParsedJobDescription = {
  jobTitle?: string;
  company?: string;
  location?: string;
  seniority?: { value: string; basis: "explicit" | "inferred" };
  domainTags: { value: string; basis: "explicit" | "inferred" }[];
  requirements: Requirement[];
  rawText: string;
  parserVersion: string;
};

export const REQUIREMENT_MATCH_STATUSES = [
  "explicit",
  "semantic_supported",
  "on_page_unverified",
  "uncertain",
  "absent",
  "contradicted",
] as const;

export type RequirementMatchStatus = (typeof REQUIREMENT_MATCH_STATUSES)[number];

/** One JD requirement vs the resume (architecture §24). */
export type RequirementMatch = {
  requirementId: string;
  status: RequirementMatchStatus;
  /** Allowed-evidence fact ids. Empty for absent / on-page-unverified. */
  evidenceFactIds: string[];
  /** Working-document blocks where the term appears, including unverified. */
  mentionBlockIds: string[];
  /** JD or resume surface that produced the match, when any. */
  matchedTerm: string | null;
};

/**
 * Honest coverage math (architecture §31). Ratios are 0–1, not an ATS score.
 * There is deliberately no single overall "job match" number here.
 */
export type MatchCoverageSummary = {
  requiredTotal: number;
  requiredExplicitCount: number;
  requiredExplicitCoverage: number;
  preferredTotal: number;
  preferredExplicitCount: number;
  preferredExplicitCoverage: number;
  semanticSupportedCount: number;
  missingRequiredIds: string[];
  uncertainIds: string[];
  onPageUnverifiedIds: string[];
  contradictedIds: string[];
  responsibilityTotal: number;
  responsibilityAlignedCount: number;
  responsibilityAlignment: number;
};

export type MatchResult = {
  matcherVersion: string;
  requirements: RequirementMatch[];
  coverage: MatchCoverageSummary;
};

export type ResumeJobSession = {
  id: string;
  userId: string;
  resumeId: string;
  resumeVersionId: string;
  company: string;
  jobTitle: string;
  jobDescriptionText: string;
  parsedJob: ParsedJobDescription | null;
  matchResult: MatchResult | null;
  retention: JobSessionRetention;
  /** Soft link to Career JobApplication.id; do not import model.ts. */
  applicationId: string | null;
  archivedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export const SUGGESTION_TRANSFORMATION_TYPES = [
  "terminology_alignment",
  "reorder_emphasis",
  "concise",
  "split",
  "other",
] as const;

export type SuggestionTransformationType = (typeof SUGGESTION_TRANSFORMATION_TYPES)[number];

export const SUGGESTION_FACTUALITY_STATUSES = [
  "grounded",
  "rejected_ungrounded",
  "needs_user",
] as const;

export type SuggestionFactualityStatus = (typeof SUGGESTION_FACTUALITY_STATUSES)[number];

export const SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "stale",
  "applied",
  "blocked_formatting",
] as const;

export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const LAYOUT_STATUSES = [
  "fits",
  "near_limit",
  "wraps",
  "line_count_changed",
  "page_count_changed",
  "indeterminate",
] as const;

export type LayoutStatus = (typeof LAYOUT_STATUSES)[number];

export type LayoutReport = {
  status: LayoutStatus;
  estimatedLineCount?: number;
  estimatedPageCount?: number;
  characterCount?: number;
  stale?: boolean;
};

export type SuggestionGeneration = {
  pipelineVersion: string;
  promptVersion: string;
  model: string;
  quantization?: string;
};

export type ResumeSuggestion = {
  id: string;
  sourceBlockId: string;
  originalText: string;
  originalTextHash: string;
  proposedText: string;
  targetRequirementIds: string[];
  evidenceIds: string[];
  evidenceQuotes: string[];
  reasoning: string;
  transformationType: SuggestionTransformationType;
  confidence: number;
  factualityStatus: SuggestionFactualityStatus;
  layoutConstraint: LayoutReport;
  status: SuggestionStatus;
  generation: SuggestionGeneration;
};

/** Persisted suggestion row (architecture §33 `resume_suggestions`). */
export type ResumeSuggestionRecord = ResumeSuggestion & {
  userId: string;
  sessionId: string;
  resumeId: string;
  resumeVersionId: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export function isFactProvenance(value: unknown): value is FactProvenance {
  return isAllowlisted(value, FACT_PROVENANCES);
}

export function isFactType(value: unknown): value is FactType {
  return isAllowlisted(value, FACT_TYPES);
}

export function isResumeSourceKind(value: unknown): value is ResumeSourceKind {
  return isAllowlisted(value, RESUME_SOURCE_KINDS);
}

export function isAtsWarningCode(value: unknown): value is AtsWarningCode {
  return isAllowlisted(value, ATS_WARNING_CODES);
}

export function isAtsWarningSeverity(value: unknown): value is AtsWarningSeverity {
  return isAllowlisted(value, ["info", "warning"] as const);
}

export function isJobSessionRetention(value: unknown): value is JobSessionRetention {
  return isAllowlisted(value, JOB_SESSION_RETENTIONS);
}

export function isRequirementPriority(value: unknown): value is RequirementPriority {
  return isAllowlisted(value, REQUIREMENT_PRIORITIES);
}

export function isRequirementCategory(value: unknown): value is RequirementCategory {
  return isAllowlisted(value, REQUIREMENT_CATEGORIES);
}

export function isRequirementMatchStatus(value: unknown): value is RequirementMatchStatus {
  return isAllowlisted(value, REQUIREMENT_MATCH_STATUSES);
}

export function isSuggestionTransformationType(
  value: unknown
): value is SuggestionTransformationType {
  return isAllowlisted(value, SUGGESTION_TRANSFORMATION_TYPES);
}

export function isSuggestionFactualityStatus(
  value: unknown
): value is SuggestionFactualityStatus {
  return isAllowlisted(value, SUGGESTION_FACTUALITY_STATUSES);
}

export function isSuggestionStatus(value: unknown): value is SuggestionStatus {
  return isAllowlisted(value, SUGGESTION_STATUSES);
}

export function isLayoutStatus(value: unknown): value is LayoutStatus {
  return isAllowlisted(value, LAYOUT_STATUSES);
}
