import type { BlockStatus } from "../../core/schedule";
import type { DailyWorkloadTotals, UnifiedTimelineItem } from "../../core/timeline";
import { styles } from "../../ui/appStyles";
import { formatMinutes } from "../../ui/format";
import { UnifiedTimelineRow } from "./UnifiedTimelineRow";

export type ScheduleBlockEnrichment = {
  blockStatus: BlockStatus;
  loggedSoFar: number;
};

export type UnifiedTimelineSectionProps = {
  items: UnifiedTimelineItem[];
  workload: DailyWorkloadTotals;
  scheduleEnrichmentByKey?: Record<string, ScheduleBlockEnrichment>;
  onAddSession: (skillId: string, minutes: number) => void;
};

function scheduleKey(skillId: string, blockId: string): string {
  return `${skillId}:${blockId}`;
}

export function UnifiedTimelineSection({
  items,
  workload,
  scheduleEnrichmentByKey = {},
  onAddSession,
}: UnifiedTimelineSectionProps) {
  return (
    <section style={styles.dashboardSection} aria-label="Unified timeline">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>
        Today&apos;s timeline
      </h2>
      <p style={{ margin: "0 0 10px 0", opacity: 0.8 }}>
        Scheduled skill blocks and life events merged chronologically.
      </p>

      <div
        style={{
          ...styles.dashboardGrid,
          marginBottom: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        }}
        aria-label="Daily workload summary"
      >
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatMinutes(workload.plannedSkillMinutes)}</div>
          <div style={styles.statLabel}>Planned skills</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatMinutes(workload.blockedMinutes)}</div>
          <div style={styles.statLabel}>Blocked by events</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatMinutes(workload.conflictMinutes)}</div>
          <div style={styles.statLabel}>Conflicts</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>
            {formatMinutes(workload.netAvailableForSkillsMinutes)}
          </div>
          <div style={styles.statLabel}>Net available</div>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.8 }}>
          No schedule blocks or events for today.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) => {
            const enrichment =
              item.kind === "scheduleBlock"
                ? scheduleEnrichmentByKey[scheduleKey(item.skillId, item.blockId)]
                : undefined;

            return (
              <UnifiedTimelineRow
                key={
                  item.kind === "scheduleBlock"
                    ? `schedule:${item.skillId}:${item.blockId}`
                    : `event:${item.eventId}`
                }
                item={item}
                blockStatus={enrichment?.blockStatus}
                loggedSoFar={enrichment?.loggedSoFar}
                onAddSession={item.kind === "scheduleBlock" ? onAddSession : undefined}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
