import type { TimelineItem } from "../../core/dashboardStats";
import { styles } from "../../ui/appStyles";
import { TimelineRow } from "./TimelineRow";

export type TimelineSectionProps = {
  timelineItems: TimelineItem[];
  onAddSession: (skillId: string, minutes: number) => void;
};

export function TimelineSection({ timelineItems, onAddSession }: TimelineSectionProps) {
  return (
    <section style={styles.dashboardSection} aria-label="Today's timeline">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Today’s timeline</h2>
      <p style={{ margin: "0 0 10px 0", opacity: 0.8 }}>
        Your scheduled blocks for today, sorted by time (based on your weekly template).
      </p>

      {timelineItems.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.8 }}>No schedule blocks for today.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {timelineItems.map((item) => (
            <TimelineRow
              key={`${item.skill.id}:${item.block.id}`}
              item={item}
              onAddSession={onAddSession}
            />
          ))}
        </div>
      )}
    </section>
  );
}
