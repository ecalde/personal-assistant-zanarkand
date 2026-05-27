import {
  buildApplicationsNeedingAttention,
  formatAttentionReasonLabel,
  type ApplicationAttentionStatus,
} from "../../core/career";
import type { JobApplication } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type NeedsAttentionSectionProps = {
  jobApplications: JobApplication[];
  todayKey: string;
  limit?: number;
};

export function NeedsAttentionSection({
  jobApplications,
  todayKey,
  limit = 5,
}: NeedsAttentionSectionProps) {
  const items = buildApplicationsNeedingAttention(jobApplications, todayKey, { limit });

  if (items.length === 0) {
    return null;
  }

  return (
    <section style={styles.dashboardSection} aria-label="Applications needing attention">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Needs attention</h2>
      <p style={{ margin: "0 0 12px 0", opacity: 0.8 }}>
        Saved roles, stale applications, and interview stages that may need a follow-up.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <AttentionRow key={item.application.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function AttentionRow({ item }: { item: ApplicationAttentionStatus }) {
  return (
    <div style={styles.listRow}>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <strong>
          {item.application.company} — {item.application.roleTitle}
        </strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {item.reasons.map((reason) => (
            <span
              key={reason}
              style={{
                ...styles.statusPill,
                ...(reason === "stuck_in_stage" || reason === "no_response"
                  ? styles.statusOverdue
                  : styles.statusIdle),
              }}
            >
              {formatAttentionReasonLabel(reason, item)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
