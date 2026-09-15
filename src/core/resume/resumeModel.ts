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

export type ResumeExtractedStructure = {
  mentionIndex: DocumentMention[];
  graph?: unknown;
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

export type ResumeJobSession = {
  id: string;
  userId: string;
  resumeId: string;
  resumeVersionId: string;
  company: string;
  jobTitle: string;
  jobDescriptionText: string;
  parsedJob: ParsedJobDescription | null;
  matchResult: unknown | null;
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

export function isFactProvenance(value: unknown): value is FactProvenance {
  return isAllowlisted(value, FACT_PROVENANCES);
}

export function isFactType(value: unknown): value is FactType {
  return isAllowlisted(value, FACT_TYPES);
}

export function isResumeSourceKind(value: unknown): value is ResumeSourceKind {
  return isAllowlisted(value, RESUME_SOURCE_KINDS);
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
