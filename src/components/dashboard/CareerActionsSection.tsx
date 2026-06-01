import {
  APPLICATION_STATUS_LABELS,
  buildApplicationPipelineSummary,
  buildApplicationsNeedingAttention,
  buildInterviewStageSummary,
  countSavedApplications,
  formatAttentionReasonLabel,
  formatApplicationStatus,
} from "../../core/career";
import type { JobApplication } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CareerActionsSectionProps = {
  jobApplications: JobApplication[];
  todayKey: string;
  onOpenCareer?: () => void;
};

function formatAppliedDate(dateKey: string | undefined): string | undefined {
  if (!dateKey) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function CareerActionsSection({
  jobApplications,
  todayKey,
  onOpenCareer,
}: CareerActionsSectionProps) {
  if (jobApplications.length === 0) {
    return null;
  }

  const summary = buildApplicationPipelineSummary(jobApplications, { recentLimit: 3 });
  const attentionItems = buildApplicationsNeedingAttention(jobApplications, todayKey, { limit: 3 });
  const interviewSummary = buildInterviewStageSummary(jobApplications);
  const savedCount = countSavedApplications(jobApplications);
  const savedApps = jobApplications.filter((app) => app.status === "saved").slice(0, 2);

  const PIPELINE_STATUSES = [
    "saved",
    "applied",
    "screening",
    "technical",
    "onsite",
    "offer",
  ] as const;

  return (
    <section style={styles.dashboardSection} aria-label="Career actions">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Career actions</h2>
        {onOpenCareer && (
          <button type="button" onClick={onOpenCareer}>
            View career
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>
        {summary.activeCount} active application{summary.activeCount === 1 ? "" : "s"} of{" "}
        {summary.total} total.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PIPELINE_STATUSES.map((status) => {
          const count = summary.byStatus[status];
          if (count === 0) return null;
          return (
            <span key={status} style={{ ...styles.statusPill, ...styles.statusIdle }}>
              {APPLICATION_STATUS_LABELS[status]}: {count}
            </span>
          );
        })}
      </div>

      {savedCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontWeight: 700, margin: "0 0 8px 0", fontSize: 14 }}>
            Saved to apply ({savedCount})
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            {savedApps.map((app) => (
              <div key={app.id} style={styles.listRow}>
                <strong>
                  {app.company} — {app.roleTitle}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {attentionItems.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontWeight: 700, margin: "0 0 8px 0", fontSize: 14 }}>Needs attention</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {attentionItems.map((item) => (
              <div key={item.application.id} style={styles.listRow}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <strong>
                    {item.application.company} — {item.application.roleTitle}
                  </strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, ...styles.textSecondary }}>
                    {item.reasons.map((reason) => (
                      <span key={reason} style={{ ...styles.statusPill, ...styles.statusOverdue }}>
                        {formatAttentionReasonLabel(reason, item)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {interviewSummary.count > 0 && (
        <p style={{ margin: "0 0 12px 0", ...styles.textSecondary, fontSize: 13 }}>
          Interview pipeline: {interviewSummary.byStage.screening} screening ·{" "}
          {interviewSummary.byStage.technical} technical · {interviewSummary.byStage.onsite} onsite
        </p>
      )}

      {summary.recentApplications.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <h3 style={{ fontWeight: 700, margin: 0, fontSize: 14 }}>Recent applications</h3>
          {summary.recentApplications.map((app) => {
            const applied = formatAppliedDate(app.appliedDate);
            return (
              <div key={app.id} style={styles.listRow}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <strong>
                    {app.company} — {app.roleTitle}
                  </strong>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      ...styles.textSecondary,
                      fontSize: 13,
                    }}
                  >
                    {applied && <span>{applied}</span>}
                    <span style={{ ...styles.statusPill, ...styles.statusIdle }}>
                      {formatApplicationStatus(app.status)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
