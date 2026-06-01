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

type WorkloadMetricProps = {
  value: number;
  label: string;
  helper: string;
};

function scheduleKey(skillId: string, blockId: string): string {
  return `${skillId}:${blockId}`;
}

function WorkloadMetric({ value, label, helper }: WorkloadMetricProps) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{formatMinutes(value)}</div>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.helpText}>{helper}</div>
    </div>
  );
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
      <p style={{ margin: "0 0 12px 0", opacity: 0.8 }}>
        Scheduled skill blocks and life events merged chronologically.
      </p>

      <div
        style={{
          background: "#fafafa",
          border: "1px solid var(--aether-panel-border, #e5e5e5)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
        aria-label="Today workload"
      >
        <h3 style={{ fontWeight: 800, margin: "0 0 4px 0", fontSize: 14 }}>
          Today workload
        </h3>
        <p style={{ ...styles.helpText, margin: "0 0 10px 0" }}>
          These numbers explain how your scheduled skill time interacts with timed events.
          Events without an end time don&apos;t count as blocked.
        </p>

        <div
          style={{
            ...styles.dashboardGrid,
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          }}
          aria-label="Daily workload summary"
        >
          <WorkloadMetric
            value={workload.plannedSkillMinutes}
            label="Planned (skills)"
            helper="From your weekly schedule template."
          />
          <WorkloadMetric
            value={workload.blockedMinutes}
            label="Blocked (events)"
            helper="Timed events only (start + end)."
          />
          <WorkloadMetric
            value={workload.conflictMinutes}
            label="Conflict (skills × events)"
            helper="Minutes where a skill block overlaps a timed event."
          />
          <WorkloadMetric
            value={workload.netAvailableForSkillsMinutes}
            label="Net scheduled (after conflicts)"
            helper="Planned minus conflict minutes."
          />
          <WorkloadMetric
            value={workload.netFreeMinutes}
            label="Free time (after events)"
            helper="24h minus blocked event minutes."
          />
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
