import {
  buildSkillsById,
  formatApplicationStatus,
  formatAttentionReasonLabel,
  formatRemotePolicy,
  formatSalaryRange,
  getApplicationAttentionStatus,
  resolveRequiredSkills,
  type QuickStatusAction,
} from "../../core/career";
import type { JobApplication, Skill } from "../../core/model";
import { ApplicationQuickActions } from "./ApplicationQuickActions";
import { ApplicationStatusBadge } from "./ApplicationStatusBadge";
import { styles } from "../../ui/appStyles";

export type ApplicationCardProps = {
  application: JobApplication;
  skills: Skill[];
  todayKey: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickAction: (action: QuickStatusAction) => void;
};

function formatAppliedDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ApplicationCard({
  application,
  skills,
  todayKey,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onQuickAction,
}: ApplicationCardProps) {
  const salary = formatSalaryRange(application.salaryMin, application.salaryMax);
  const remote = formatRemotePolicy(application.remotePolicy);
  const skillsById = buildSkillsById(skills);
  const skillSummary = resolveRequiredSkills(application.requiredSkillIds, skillsById);
  const attention = getApplicationAttentionStatus(application, todayKey);

  const summaryParts = [
    salary,
    remote,
    application.location,
    application.appliedDate ? `Applied ${formatAppliedDate(application.appliedDate)}` : undefined,
    attention?.daysInStage !== null && attention?.daysInStage !== undefined
      ? `In ${formatApplicationStatus(application.status).toLowerCase()} ${attention.daysInStage} days`
      : undefined,
  ].filter(Boolean);

  return (
    <article style={styles.listRow}>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <strong>{application.company}</strong>
            <div style={{ opacity: 0.9 }}>{application.roleTitle}</div>
          </div>
          <ApplicationStatusBadge status={application.status} attention={attention} />
        </div>

        {attention && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {attention.reasons.map((reason) => (
              <span
                key={reason}
                style={{
                  ...styles.statusPill,
                  ...(reason === "stuck_in_stage" || reason === "no_response"
                    ? styles.statusOverdue
                    : styles.statusIdle),
                }}
              >
                {formatAttentionReasonLabel(reason, attention)}
              </span>
            ))}
          </div>
        )}

        {summaryParts.length > 0 && (
          <div style={{ opacity: 0.85, fontSize: 13 }}>{summaryParts.join(" · ")}</div>
        )}

        <ApplicationQuickActions status={application.status} onQuickAction={onQuickAction} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={onToggleExpand}>
            {expanded ? "Hide details" : "Details"}
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>

        {expanded && (
          <div style={{ display: "grid", gap: 10, paddingTop: 4 }}>
            {application.notes && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Notes</div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", opacity: 0.9 }}>
                  {application.notes}
                </p>
              </div>
            )}

            {application.url && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Link</div>
                <a href={application.url} target="_blank" rel="noreferrer noopener">
                  {application.url}
                </a>
              </div>
            )}

            {(skillSummary.linkedRequirements.length > 0 || application.requiredSkillsText) && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Required skills</div>
                {skillSummary.linkedRequirements.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {skillSummary.linkedRequirements.map((req) => (
                      <span
                        key={req.skillId}
                        style={{ ...styles.statusPill, ...styles.statusIdle }}
                      >
                        {req.skillName}
                      </span>
                    ))}
                  </div>
                )}
                {application.requiredSkillsText && (
                  <p style={{ margin: 0, opacity: 0.85, fontSize: 13, whiteSpace: "pre-wrap" }}>
                    {application.requiredSkillsText}
                  </p>
                )}
              </div>
            )}

            {!application.notes &&
              !application.url &&
              skillSummary.linkedRequirements.length === 0 &&
              !application.requiredSkillsText && (
                <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
                  No extra details yet. Edit to add notes, a link, or required skills.
                </p>
              )}
          </div>
        )}
      </div>
    </article>
  );
}
