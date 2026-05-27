/**
 * Pure helpers for the Career domain.
 *
 * Future AI extension points (not implemented in v1):
 * - CareerContext bundle for prompts (dream target, active applications, skill gaps, salary ranges)
 * - Job posting paste → structured parse with user confirmation
 * - Cover letter / outreach draft using application notes + company info
 * - Skill gap → learning plan suggestions tied to skill daily goals
 * - Application status nudges ("no update in 14 days")
 * - Board sync (Greenhouse/Lever/LinkedIn) — explicit non-goal for v1
 *
 * Future: buildCareerContext(payload: AppPayload): CareerContext
 */

import type {
  ApplicationStatus,
  CareerTarget,
  JobApplication,
  RemotePolicy,
  Skill,
} from "./model";

export type ResolvedSkillRequirement = {
  skillId: string;
  skillName: string;
};

export type SkillGapSummary = {
  linkedRequirements: ResolvedSkillRequirement[];
  unlinkedText?: string;
  missingSkillIds: string[];
};

export type ApplicationPipelineSummary = {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  activeCount: number;
  recentApplications: JobApplication[];
};

export type ApplicationsSortMode = "recent" | "company" | "status";

export type ApplicationStatusFilter =
  | "all"
  | "saved"
  | "applied"
  | "in-progress"
  | "offer"
  | "closed";

const APPLICATION_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
];

const STATUS_PIPELINE_ORDER: Record<ApplicationStatus, number> = {
  saved: 0,
  applied: 1,
  screening: 2,
  technical: 3,
  onsite: 4,
  offer: 5,
  rejected: 6,
  withdrawn: 7,
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  technical: "Technical",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const REMOTE_POLICY_LABELS: Record<RemotePolicy, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unknown: "Unknown",
};

function emptyStatusCounts(): Record<ApplicationStatus, number> {
  return {
    saved: 0,
    applied: 0,
    screening: 0,
    technical: 0,
    onsite: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
}

export function buildSkillsById(skills: Skill[]): Map<string, Skill> {
  return new Map(skills.map((skill) => [skill.id, skill]));
}

export function resolveRequiredSkills(
  skillIds: string[],
  skillsById: Map<string, Skill>
): SkillGapSummary {
  const linkedRequirements: ResolvedSkillRequirement[] = [];
  const missingSkillIds: string[] = [];

  for (const skillId of skillIds) {
    const skill = skillsById.get(skillId);
    if (skill) {
      linkedRequirements.push({ skillId, skillName: skill.name });
    } else {
      missingSkillIds.push(skillId);
    }
  }

  return { linkedRequirements, missingSkillIds };
}

export function buildDreamJobSkillGap(
  skills: Skill[],
  target: CareerTarget | undefined,
  requiredSkillsText?: string
): SkillGapSummary | null {
  if (!target) return null;

  const skillsById = buildSkillsById(skills);
  const summary = resolveRequiredSkills(target.requiredSkillIds, skillsById);

  const text = target.requiredSkillsText?.trim() || requiredSkillsText?.trim();
  if (text) {
    summary.unlinkedText = text;
  }

  return summary;
}

export function isActiveApplication(status: ApplicationStatus): boolean {
  return status !== "rejected" && status !== "withdrawn" && status !== "offer";
}

export function formatApplicationStatus(status: ApplicationStatus): string {
  return APPLICATION_STATUS_LABELS[status];
}

export function formatSalaryRange(min?: number, max?: number): string | undefined {
  const formatK = (value: number) =>
    value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;

  if (min !== undefined && max !== undefined) {
    return `${formatK(min)}–${formatK(max)}`;
  }
  if (min !== undefined) return `${formatK(min)}+`;
  if (max !== undefined) return `Up to ${formatK(max)}`;
  return undefined;
}

export function formatRemotePolicy(policy: RemotePolicy | undefined): string | undefined {
  if (!policy) return undefined;
  return REMOTE_POLICY_LABELS[policy];
}

export function applicationMatchesQuery(app: JobApplication, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    app.company,
    app.roleTitle,
    app.location ?? "",
    app.notes ?? "",
    app.requiredSkillsText ?? "",
    formatApplicationStatus(app.status),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function matchesStatusFilter(
  status: ApplicationStatus,
  filter: ApplicationStatusFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "saved":
      return status === "saved";
    case "applied":
      return status === "applied";
    case "in-progress":
      return status === "screening" || status === "technical" || status === "onsite";
    case "offer":
      return status === "offer";
    case "closed":
      return status === "rejected" || status === "withdrawn";
  }
}

function compareRecent(a: JobApplication, b: JobApplication): number {
  const aDate = a.appliedDate ?? "";
  const bDate = b.appliedDate ?? "";
  if (aDate !== bDate) {
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate.localeCompare(aDate);
  }
  return b.updatedAtIso.localeCompare(a.updatedAtIso);
}

function compareByCompany(a: JobApplication, b: JobApplication): number {
  const company = a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
  if (company !== 0) return company;
  return a.roleTitle.localeCompare(b.roleTitle, undefined, { sensitivity: "base" });
}

function compareByStatus(a: JobApplication, b: JobApplication): number {
  const statusDiff = STATUS_PIPELINE_ORDER[a.status] - STATUS_PIPELINE_ORDER[b.status];
  if (statusDiff !== 0) return statusDiff;
  return compareRecent(a, b);
}

export function filterAndSortApplications(
  apps: JobApplication[],
  opts: {
    query?: string;
    sortMode: ApplicationsSortMode;
    statusFilter?: ApplicationStatusFilter;
  }
): JobApplication[] {
  const query = opts.query ?? "";
  const statusFilter = opts.statusFilter ?? "all";

  const filtered = apps.filter(
    (app) =>
      applicationMatchesQuery(app, query) && matchesStatusFilter(app.status, statusFilter)
  );

  const sorted = [...filtered];
  switch (opts.sortMode) {
    case "recent":
      sorted.sort(compareRecent);
      break;
    case "company":
      sorted.sort(compareByCompany);
      break;
    case "status":
      sorted.sort(compareByStatus);
      break;
  }

  return sorted;
}

export function buildApplicationPipelineSummary(
  apps: JobApplication[],
  opts?: { recentLimit?: number }
): ApplicationPipelineSummary {
  const byStatus = emptyStatusCounts();
  let activeCount = 0;

  for (const app of apps) {
    byStatus[app.status] += 1;
    if (isActiveApplication(app.status)) {
      activeCount += 1;
    }
  }

  const recentApplications = [...apps]
    .sort(compareRecent)
    .slice(0, opts?.recentLimit ?? 3);

  return {
    total: apps.length,
    byStatus,
    activeCount,
    recentApplications,
  };
}

export function getApplicationStatuses(): ApplicationStatus[] {
  return [...APPLICATION_STATUSES];
}
