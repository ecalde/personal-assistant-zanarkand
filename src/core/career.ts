/**
 * Pure helpers for the Career domain.
 *
 * Future AI extension points (not implemented in v1):
 * - CareerContext bundle for prompts (dream target, active applications, skill gaps, salary ranges)
 * - Job posting paste → structured parse with user confirmation
 * - Cover letter / outreach draft using application notes + company info
 * - Skill gap → learning plan suggestions tied to skill daily goals
 * - Board sync (Greenhouse/Lever/LinkedIn) — explicit non-goal for v1
 *
 * Future: buildCareerContext(payload: AppPayload): CareerContext
 */

import { daysBetweenDateKeys } from "./events";
import type {
  AppPayload,
  ApplicationInterview,
  ApplicationStatus,
  CareerTarget,
  InterviewFormat,
  InterviewOutcome,
  JobApplication,
  RemotePolicy,
  Skill,
} from "./model";

export const APPLIED_NO_RESPONSE_DAYS = 14;
export const STUCK_IN_STAGE_DAYS = 21;

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

export type ApplicationsSortMode = "recent" | "company" | "status" | "needsAttention";

export type ApplicationStatusFilter =
  | "all"
  | "saved"
  | "applied"
  | "in-progress"
  | "offer"
  | "closed"
  | "needs-attention";

export type ApplicationAttentionReason =
  | "saved_not_applied"
  | "no_response"
  | "stuck_in_stage";

export type ApplicationAttentionStatus = {
  application: JobApplication;
  reasons: ApplicationAttentionReason[];
  daysSinceApplied: number | null;
  daysInStage: number | null;
  priority: number;
};

export type InterviewStageSummary = {
  count: number;
  byStage: Pick<Record<ApplicationStatus, number>, "screening" | "technical" | "onsite">;
  applications: JobApplication[];
};

export type SkillGapPriorityItem =
  | { kind: "linked"; skillId: string; skillName: string; skillPriority?: number }
  | { kind: "unlinked"; label: string };

export type QuickStatusAction = {
  label: string;
  nextStatus: ApplicationStatus;
  setAppliedDateToday?: boolean;
};

export type StatusBadgeVariant = "neutral" | "positive" | "warning" | "overdue";

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

const INTERVIEW_STATUSES: ApplicationStatus[] = ["screening", "technical", "onsite"];

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

const ATTENTION_REASON_PRIORITY: Record<ApplicationAttentionReason, number> = {
  stuck_in_stage: 3,
  no_response: 2,
  saved_not_applied: 1,
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

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On-site",
  other: "Other",
};

export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function getInterviewStageStatuses(): Array<
  NonNullable<ApplicationInterview["stage"]>
> {
  return ["screening", "technical", "onsite"];
}

export function isInterviewStageStatus(status: ApplicationStatus): boolean {
  return INTERVIEW_STATUSES.includes(status);
}

export function resolveInterviewStage(
  interview: ApplicationInterview,
  application: JobApplication
): NonNullable<ApplicationInterview["stage"]> | ApplicationStatus {
  if (interview.stage) return interview.stage;
  if (INTERVIEW_STATUSES.includes(application.status)) {
    return application.status;
  }
  return "screening";
}

export function formatInterviewStageLabel(
  interview: ApplicationInterview,
  application: JobApplication
): string {
  const stage = resolveInterviewStage(interview, application);
  return APPLICATION_STATUS_LABELS[stage];
}

export function formatInterviewHeadline(
  application: JobApplication,
  interview: ApplicationInterview
): string {
  return `${application.company} — ${formatInterviewStageLabel(interview, application)} interview`;
}

export function isInterviewVisibleOnCalendar(interview: ApplicationInterview): boolean {
  return interview.outcome !== "cancelled";
}

export function compareApplicationInterviews(
  a: ApplicationInterview,
  b: ApplicationInterview
): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const startA = a.startTime ?? "99:99";
  const startB = b.startTime ?? "99:99";
  return startA.localeCompare(startB);
}

export function sortApplicationInterviews(
  interviews: ApplicationInterview[]
): ApplicationInterview[] {
  return [...interviews].sort(compareApplicationInterviews);
}

export type ScheduledInterviewItem = {
  application: JobApplication;
  interview: ApplicationInterview;
};

export function collectScheduledInterviews(
  applications: JobApplication[],
  startDate: string,
  endDate: string
): ScheduledInterviewItem[] {
  const items: ScheduledInterviewItem[] = [];

  for (const application of applications) {
    for (const interview of application.interviews ?? []) {
      if (!isInterviewVisibleOnCalendar(interview)) continue;
      if (interview.date < startDate || interview.date > endDate) continue;
      items.push({ application, interview });
    }
  }

  return items.sort((a, b) => {
    const byDate = compareApplicationInterviews(a.interview, b.interview);
    if (byDate !== 0) return byDate;
    return a.application.company.localeCompare(b.application.company);
  });
}

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

function isoToDateKey(iso: string): string | null {
  const dateKey = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function daysSinceDateKey(fromKey: string, todayKey: string): number | null {
  return daysBetweenDateKeys(fromKey, todayKey);
}

function maxAttentionReasonPriority(reasons: ApplicationAttentionReason[]): number {
  return Math.max(...reasons.map((reason) => ATTENTION_REASON_PRIORITY[reason]));
}

function computeAttentionPriority(status: ApplicationAttentionStatus): number {
  const reasonScore = maxAttentionReasonPriority(status.reasons) * 1000;
  const daysScore =
    Math.max(status.daysInStage ?? 0, status.daysSinceApplied ?? 0) * 10;
  return reasonScore + daysScore;
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

export function buildSkillGapPriorityList(
  skills: Skill[],
  target: CareerTarget | undefined
): SkillGapPriorityItem[] {
  if (!target) return [];

  const skillsById = buildSkillsById(skills);
  const items: SkillGapPriorityItem[] = [];

  const linked = target.requiredSkillIds
    .map((skillId) => skillsById.get(skillId))
    .filter((skill): skill is Skill => skill !== undefined)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const skill of linked) {
    items.push({
      kind: "linked",
      skillId: skill.id,
      skillName: skill.name,
      skillPriority: skill.priority,
    });
  }

  const text = target.requiredSkillsText?.trim();
  if (text) {
    for (const part of text.split(/[,;\n]+/)) {
      const label = part.trim();
      if (label) {
        items.push({ kind: "unlinked", label });
      }
    }
  }

  return items;
}

export function getApplicationAttentionStatus(
  app: JobApplication,
  todayKey: string
): ApplicationAttentionStatus | null {
  if (!isActiveApplication(app.status) && app.status !== "saved") {
    return null;
  }

  const reasons: ApplicationAttentionReason[] = [];
  let daysSinceApplied: number | null = null;
  let daysInStage: number | null = null;

  if (app.status === "saved") {
    reasons.push("saved_not_applied");
  }

  if (app.status === "applied" && app.appliedDate) {
    daysSinceApplied = daysSinceDateKey(app.appliedDate, todayKey);
    if (daysSinceApplied !== null && daysSinceApplied >= APPLIED_NO_RESPONSE_DAYS) {
      reasons.push("no_response");
    }
  }

  if (INTERVIEW_STATUSES.includes(app.status)) {
    const stageDateKey = isoToDateKey(app.updatedAtIso);
    if (stageDateKey) {
      daysInStage = daysSinceDateKey(stageDateKey, todayKey);
      if (daysInStage !== null && daysInStage >= STUCK_IN_STAGE_DAYS) {
        reasons.push("stuck_in_stage");
      }
    }
  }

  if (reasons.length === 0) {
    return null;
  }

  const status: ApplicationAttentionStatus = {
    application: app,
    reasons,
    daysSinceApplied,
    daysInStage,
    priority: 0,
  };
  status.priority = computeAttentionPriority(status);
  return status;
}

export function sortApplicationsByAttentionPriority(
  items: ApplicationAttentionStatus[]
): ApplicationAttentionStatus[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const company = a.application.company.localeCompare(b.application.company, undefined, {
      sensitivity: "base",
    });
    if (company !== 0) return company;
    return a.application.roleTitle.localeCompare(b.application.roleTitle, undefined, {
      sensitivity: "base",
    });
  });
}

export function buildApplicationsNeedingAttention(
  apps: JobApplication[],
  todayKey: string,
  opts?: { limit?: number }
): ApplicationAttentionStatus[] {
  const items = apps
    .map((app) => getApplicationAttentionStatus(app, todayKey))
    .filter((item): item is ApplicationAttentionStatus => item !== null);

  const sorted = sortApplicationsByAttentionPriority(items);
  const limit = opts?.limit;
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

export function buildInterviewStageSummary(apps: JobApplication[]): InterviewStageSummary {
  const byStage = { screening: 0, technical: 0, onsite: 0 };
  const applications: JobApplication[] = [];

  for (const app of apps) {
    if (app.status === "screening") {
      byStage.screening += 1;
      applications.push(app);
    } else if (app.status === "technical") {
      byStage.technical += 1;
      applications.push(app);
    } else if (app.status === "onsite") {
      byStage.onsite += 1;
      applications.push(app);
    }
  }

  return {
    count: byStage.screening + byStage.technical + byStage.onsite,
    byStage,
    applications,
  };
}

export function formatAttentionReasonLabel(
  reason: ApplicationAttentionReason,
  status: ApplicationAttentionStatus
): string {
  switch (reason) {
    case "saved_not_applied":
      return "Ready to apply";
    case "no_response":
      return status.daysSinceApplied !== null
        ? `No response in ${status.daysSinceApplied} days`
        : "No response yet";
    case "stuck_in_stage":
      return status.daysInStage !== null
        ? `Stuck in ${formatApplicationStatus(status.application.status).toLowerCase()} ${status.daysInStage} days`
        : `Stuck in ${formatApplicationStatus(status.application.status).toLowerCase()}`;
  }
}

export function getStatusBadgeVariant(
  status: ApplicationStatus,
  attention: ApplicationAttentionStatus | null
): StatusBadgeVariant {
  if (attention?.reasons.includes("stuck_in_stage") || attention?.reasons.includes("no_response")) {
    return "overdue";
  }
  if (attention?.reasons.includes("saved_not_applied")) {
    return "warning";
  }
  if (status === "offer") {
    return "positive";
  }
  if (status === "rejected" || status === "withdrawn") {
    return "neutral";
  }
  return "neutral";
}

export function getQuickStatusActions(status: ApplicationStatus): QuickStatusAction[] {
  switch (status) {
    case "saved":
      return [{ label: "Mark applied", nextStatus: "applied", setAppliedDateToday: true }];
    case "applied":
      return [{ label: "Move to screening", nextStatus: "screening" }];
    case "screening":
      return [{ label: "Move to technical", nextStatus: "technical" }];
    case "technical":
      return [{ label: "Move to onsite", nextStatus: "onsite" }];
    case "onsite":
      return [
        { label: "Mark offer", nextStatus: "offer" },
        { label: "Rejected", nextStatus: "rejected" },
        { label: "Withdrawn", nextStatus: "withdrawn" },
      ];
    default:
      return [];
  }
}

export function getSecondaryQuickStatusActions(
  status: ApplicationStatus
): QuickStatusAction[] {
  if (status === "offer" || status === "rejected" || status === "withdrawn" || status === "saved") {
    return [];
  }
  if (status === "onsite") {
    return [];
  }
  return [
    { label: "Rejected", nextStatus: "rejected" },
    { label: "Withdrawn", nextStatus: "withdrawn" },
  ];
}

export function applyQuickStatusTransition(
  app: JobApplication,
  action: QuickStatusAction,
  todayKey: string
): JobApplication {
  const next: JobApplication = {
    ...app,
    status: action.nextStatus,
  };

  if (action.setAppliedDateToday && !next.appliedDate) {
    next.appliedDate = todayKey;
  }

  return next;
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
  filter: ApplicationStatusFilter,
  app: JobApplication,
  todayKey?: string
): boolean {
  if (filter === "needs-attention") {
    if (!todayKey) return false;
    return getApplicationAttentionStatus(app, todayKey) !== null;
  }

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
    default:
      return true;
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

function compareByAttention(
  a: JobApplication,
  b: JobApplication,
  todayKey: string
): number {
  const aAttention = getApplicationAttentionStatus(a, todayKey);
  const bAttention = getApplicationAttentionStatus(b, todayKey);

  if (aAttention && bAttention) {
    return bAttention.priority - aAttention.priority;
  }
  if (aAttention && !bAttention) return -1;
  if (!aAttention && bAttention) return 1;
  return compareRecent(a, b);
}

export function filterAndSortApplications(
  apps: JobApplication[],
  opts: {
    query?: string;
    sortMode: ApplicationsSortMode;
    statusFilter?: ApplicationStatusFilter;
    todayKey?: string;
  }
): JobApplication[] {
  const query = opts.query ?? "";
  const statusFilter = opts.statusFilter ?? "all";
  const todayKey = opts.todayKey;

  const filtered = apps.filter(
    (app) =>
      applicationMatchesQuery(app, query) &&
      matchesStatusFilter(app.status, statusFilter, app, todayKey)
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
    case "needsAttention":
      if (todayKey) {
        sorted.sort((a, b) => compareByAttention(a, b, todayKey));
      } else {
        sorted.sort(compareRecent);
      }
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

export function countSavedApplications(apps: JobApplication[]): number {
  return apps.filter((app) => app.status === "saved").length;
}

/** Removes a single skill id from career entities (used when deleting that skill). */
export function stripSkillIdFromCareerPayload(
  payload: AppPayload,
  skillId: string
): Pick<AppPayload, "jobApplications" | "careerTarget"> {
  const jobApplications = (payload.jobApplications ?? []).map((app) => ({
    ...app,
    requiredSkillIds: app.requiredSkillIds.filter((id) => id !== skillId),
  }));

  let careerTarget = payload.careerTarget;
  if (careerTarget) {
    careerTarget = {
      ...careerTarget,
      requiredSkillIds: careerTarget.requiredSkillIds.filter((id) => id !== skillId),
    };
  }

  return { jobApplications, careerTarget };
}

/** Strips requiredSkillIds that no longer exist in payload.skills (legacy/orphan cleanup). */
export function stripUnknownSkillIdsFromCareer(
  payload: AppPayload
): Pick<AppPayload, "jobApplications" | "careerTarget"> {
  const skillIds = new Set(payload.skills.map((s) => s.id));

  const jobApplications = (payload.jobApplications ?? []).map((app) => ({
    ...app,
    requiredSkillIds: app.requiredSkillIds.filter((id) => skillIds.has(id)),
  }));

  let careerTarget = payload.careerTarget;
  if (careerTarget) {
    careerTarget = {
      ...careerTarget,
      requiredSkillIds: careerTarget.requiredSkillIds.filter((id) => skillIds.has(id)),
    };
  }

  return { jobApplications, careerTarget };
}
