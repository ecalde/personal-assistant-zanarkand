import {
  APPLICATION_STATUS_LABELS,
  buildApplicationPipelineSummary,
  formatApplicationStatus,
} from "../../core/career";
import type { ApplicationStatus, JobApplication } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type CareerPipelineSectionProps = {
  jobApplications: JobApplication[];
};

const PIPELINE_STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
];

function formatAppliedDate(dateKey: string | undefined): string | undefined {
  if (!dateKey) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function CareerPipelineSection({ jobApplications }: CareerPipelineSectionProps) {
  if (jobApplications.length === 0) {
    return null;
  }

  const summary = buildApplicationPipelineSummary(jobApplications, { recentLimit: 3 });

  return (
    <section style={styles.dashboardSection} aria-label="Career pipeline">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Career pipeline</h2>
      <p style={{ margin: "0 0 12px 0", opacity: 0.8 }}>
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
                      opacity: 0.85,
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
