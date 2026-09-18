/**
 * Optional Career application link for a resume job session (Phase 9D).
 * Soft FK only: stores `application_id` on `resume_job_sessions`. Does not
 * copy company/title into `job_applications` and does not rewrite the DOCX.
 */

export type ResumeApplicationLinkOption = {
  id: string;
  company: string;
  roleTitle: string;
};

export const RESUME_APPLICATION_LINK_NONE = "";

export function resumeApplicationLinkLabel(option: ResumeApplicationLinkOption): string {
  const company = option.company.trim() || "Untitled company";
  const role = option.roleTitle.trim() || "Untitled role";
  return `${company} — ${role}`;
}

export function parseResumeApplicationLinkSelectValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === RESUME_APPLICATION_LINK_NONE ? null : trimmed;
}

export function resumeApplicationLinkSelectValue(applicationId: string | null): string {
  return applicationId ?? RESUME_APPLICATION_LINK_NONE;
}

/** Keep a previously saved id visible even if the Career row is gone. */
export function resumeApplicationLinkOptions(
  applications: ResumeApplicationLinkOption[],
  selectedId: string | null
): ResumeApplicationLinkOption[] {
  const seen = new Set<string>();
  const out: ResumeApplicationLinkOption[] = [];
  for (const app of applications) {
    if (seen.has(app.id)) continue;
    seen.add(app.id);
    out.push(app);
  }
  if (selectedId && !seen.has(selectedId)) {
    out.push({
      id: selectedId,
      company: "Linked application",
      roleTitle: "no longer in Career list",
    });
  }
  return out;
}
