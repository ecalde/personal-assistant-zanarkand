import { aggregateProgressTarget, type SkillDayRow } from "../../core/dashboardStats";
import { styles } from "../../ui/appStyles";
import { formatMinutes } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";

export type TodayHeroProps = {
  rows: SkillDayRow[];
  totalMinutesToday: number;
  /** `compact` stacks stats vertically for the desktop right rail; `wide` is the full-width mobile layout. */
  layout?: "wide" | "compact";
};

export function TodayHero({ rows, totalMinutesToday, layout = "wide" }: TodayHeroProps) {
  const isCompact = layout === "compact";
  if (rows.length === 0) {
    return (
      <section style={{ ...styles.dashboardSection, marginBottom: 12 }} aria-label="Today">
        <h2 style={{ fontWeight: 800, margin: "0 0 8px 0", fontSize: 18 }}>Today</h2>
        <p style={{ margin: 0, ...styles.textMuted }}>Add skills to track your daily progress.</p>
      </section>
    );
  }

  const onTrackCount = rows.filter((r) => r.status === "onTrack").length;
  const overdueCount = rows.filter((r) => r.status === "overdue").length;
  const idleCount = rows.filter((r) => r.status === "idle").length;
  const aggregateTarget = aggregateProgressTarget(rows);

  const progressLabel =
    aggregateTarget > 0
      ? `Today: ${formatMinutes(totalMinutesToday)} of ${formatMinutes(aggregateTarget)}`
      : `Today: ${formatMinutes(totalMinutesToday)} logged (no daily targets set)`;

  return (
    <section
      style={{
        ...styles.dashboardSection,
        marginBottom: isCompact ? 0 : 12,
        display: "grid",
        gap: 12,
      }}
      aria-label="Today"
    >
      <h2 style={{ fontWeight: 800, margin: 0, fontSize: 18 }}>Today</h2>

      <div style={isCompact ? styles.dashboardRailStatGrid : styles.dashboardGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatMinutes(totalMinutesToday)}</div>
          <div style={styles.statLabel}>Logged today</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statValue}>{onTrackCount}</div>
          <div style={styles.statLabel}>On track</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statValue}>{overdueCount}</div>
          <div style={styles.statLabel}>Overdue</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statValue}>{idleCount}</div>
          <div style={styles.statLabel}>Idle</div>
        </div>
      </div>

      <ProgressBar value={totalMinutesToday} max={aggregateTarget} label={progressLabel} />
    </section>
  );
}
