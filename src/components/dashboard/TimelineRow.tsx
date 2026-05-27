import type { TimelineItem } from "../../core/dashboardStats";
import type { BlockStatus } from "../../core/schedule";
import { styles } from "../../ui/appStyles";
import { formatMinutes, priorityEmoji } from "../../ui/format";

export type TimelineRowProps = {
  item: TimelineItem;
  onAddSession: (skillId: string, minutes: number) => void;
};

function timelineAccentStyle(status: BlockStatus) {
  if (status === "done") return styles.timelineAccentDone;
  if (status === "behind") return styles.timelineAccentBehind;
  if (status === "inProgress") return styles.timelineAccentInProgress;
  return styles.timelineAccentUpcoming;
}

function statusPillStyle(status: BlockStatus) {
  if (status === "done" || status === "inProgress") return styles.statusOnTrack;
  if (status === "behind") return styles.statusOverdue;
  return styles.statusIdle;
}

function statusLabel(status: BlockStatus): string {
  if (status === "done") return "✅ Done";
  if (status === "behind") return "🔴 Behind";
  if (status === "inProgress") return "🟢 In progress";
  return "⏳ Upcoming";
}

function logSession(skillId: string, minutes: number, onAddSession: (skillId: string, minutes: number) => void) {
  if (!Number.isInteger(minutes) || minutes <= 0) return;
  onAddSession(skillId, minutes);
}

export function TimelineRow({ item, onAddSession }: TimelineRowProps) {
  const { skill, block, startTime, endTime, loggedSoFar, status } = item;

  return (
    <div style={{ ...styles.timelineRow, ...timelineAccentStyle(status) }}>
      <div>
        <div style={{ fontWeight: 800 }}>
          {startTime}–{endTime} · {priorityEmoji(skill.priority)} {skill.name}
        </div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          Block: <b>{formatMinutes(block.minutes)}</b> · Logged so far:{" "}
          <b>{formatMinutes(loggedSoFar)}</b>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ ...styles.statusPill, ...statusPillStyle(status) }}>{statusLabel(status)}</span>

        <button
          type="button"
          onClick={() => logSession(skill.id, 15, onAddSession)}
          style={styles.smallBtn}
          aria-label={`Log 15 minutes for ${skill.name}`}
        >
          +15
        </button>

        <button
          type="button"
          onClick={() => logSession(skill.id, 30, onAddSession)}
          style={styles.smallBtn}
          aria-label={`Log 30 minutes for ${skill.name}`}
        >
          +30
        </button>
      </div>
    </div>
  );
}
