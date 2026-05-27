import type {
  ApplicationStatus,
  JobApplication,
  RemotePolicy,
} from "../../core/model";
import { getApplicationStatuses } from "../../core/career";

export type ApplicationFormState = {
  company: string;
  roleTitle: string;
  status: ApplicationStatus;
  salaryMin: string;
  salaryMax: string;
  location: string;
  remotePolicy: RemotePolicy | "";
  appliedDate: string;
  url: string;
  notes: string;
  requiredSkillIds: string[];
  requiredSkillsText: string;
};

export function emptyApplicationFormState(): ApplicationFormState {
  return {
    company: "",
    roleTitle: "",
    status: "saved",
    salaryMin: "",
    salaryMax: "",
    location: "",
    remotePolicy: "",
    appliedDate: "",
    url: "",
    notes: "",
    requiredSkillIds: [],
    requiredSkillsText: "",
  };
}

export function applicationFormFromApplication(app: JobApplication): ApplicationFormState {
  return {
    company: app.company,
    roleTitle: app.roleTitle,
    status: app.status,
    salaryMin: app.salaryMin !== undefined ? String(app.salaryMin) : "",
    salaryMax: app.salaryMax !== undefined ? String(app.salaryMax) : "",
    location: app.location ?? "",
    remotePolicy: app.remotePolicy ?? "",
    appliedDate: app.appliedDate ?? "",
    url: app.url ?? "",
    notes: app.notes ?? "",
    requiredSkillIds: [...app.requiredSkillIds],
    requiredSkillsText: app.requiredSkillsText ?? "",
  };
}

function parseSalaryField(raw: string, fieldLabel: string): number | undefined | string {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${fieldLabel} must be a positive whole number.`;
  }
  return parsed;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateApplicationForm(form: ApplicationFormState): string | null {
  if (!form.company.trim()) return "Company is required.";
  if (!form.roleTitle.trim()) return "Role title is required.";
  if (!getApplicationStatuses().includes(form.status)) return "Invalid status.";

  const salaryMin = parseSalaryField(form.salaryMin, "Minimum salary");
  if (typeof salaryMin === "string") return salaryMin;
  const salaryMax = parseSalaryField(form.salaryMax, "Maximum salary");
  if (typeof salaryMax === "string") return salaryMax;
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMax < salaryMin) {
    return "Maximum salary must be greater than or equal to minimum salary.";
  }

  const url = form.url.trim();
  if (url && !isValidHttpUrl(url)) {
    return "URL must be a valid http or https link.";
  }

  return null;
}

export function applicationPayloadFromForm(
  form: ApplicationFormState
): Omit<JobApplication, "id" | "createdAtIso" | "updatedAtIso"> {
  const salaryMin = parseSalaryField(form.salaryMin, "Minimum salary");
  const salaryMax = parseSalaryField(form.salaryMax, "Maximum salary");

  return {
    company: form.company.trim(),
    roleTitle: form.roleTitle.trim(),
    status: form.status,
    salaryMin: typeof salaryMin === "number" ? salaryMin : undefined,
    salaryMax: typeof salaryMax === "number" ? salaryMax : undefined,
    location: form.location.trim() || undefined,
    remotePolicy: form.remotePolicy || undefined,
    appliedDate: form.appliedDate.trim() || undefined,
    url: form.url.trim() || undefined,
    notes: form.notes.trim() || undefined,
    requiredSkillIds: [...form.requiredSkillIds],
    requiredSkillsText: form.requiredSkillsText.trim() || undefined,
  };
}
