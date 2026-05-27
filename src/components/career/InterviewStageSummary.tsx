import { buildInterviewStageSummary } from "../../core/career";
import type { JobApplication } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type InterviewStageSummaryProps = {
  jobApplications: JobApplication[];
};

export function InterviewStageSummaryBar({ jobApplications }: InterviewStageSummaryProps) {
  const summary = buildInterviewStageSummary(jobApplications);

  if (summary.count === 0) {
    return null;
  }

  const parts = [
    summary.byStage.screening > 0 ? `${summary.byStage.screening} screening` : null,
    summary.byStage.technical > 0 ? `${summary.byStage.technical} technical` : null,
    summary.byStage.onsite > 0 ? `${summary.byStage.onsite} onsite` : null,
  ].filter(Boolean);

  return (
    <section style={styles.dashboardSection} aria-label="Interview pipeline">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Interview pipeline</h2>
      <p style={{ margin: 0, opacity: 0.85 }}>
        {summary.count} active interview stage{summary.count === 1 ? "" : "s"}
        {parts.length > 0 ? `: ${parts.join(" · ")}` : ""}
      </p>
    </section>
  );
}
