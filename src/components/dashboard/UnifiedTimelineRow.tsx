import type { BlockStatus } from "../../core/schedule";
import type { UnifiedTimelineItem } from "../../core/timeline";
import { styles } from "../../ui/appStyles";
import { formatMinutes, priorityEmoji } from "../../ui/format";

export type UnifiedTimelineRowProps = {
  item: UnifiedTimelineItem;
  blockStatus?: BlockStatus;
  loggedSoFar?: number;
  onAddSession?: (skillId: string, minutes: number) => void;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday",
  hangout: "Hangout",
  trip: "Trip",
  holiday: "Holiday",
  deadline: "Deadline",
  other: "Other",
};

function timelineAccentStyle(status?: BlockStatus, hasConflict?: boolean) {
  if (hasConflict) return { borderLeftColor: "#e65100" };
  if (status === "done") return styles.timelineAccentDone;
  if (status === "behind") return styles.timelineAccentBehind;
  if (status === "inProgress") return styles.timelineAccentInProgress;
  if (status === "upcoming") return styles.timelineAccentUpcoming;
  return { borderLeftColor: "#90caf9" };
}

function statusPillStyle(status?: BlockStatus) {
  if (status === "done" || status === "inProgress") return styles.statusOnTrack;
  if (status === "behind") return styles.statusOverdue;
  return styles.statusIdle;
}

function statusLabel(status: BlockStatus): string {
  if (status === "done") return "Done";
  if (status === "behind") return "Behind";
  if (status === "inProgress") return "In progress";
  return "Upcoming";
}

function formatTimeLabel(item: UnifiedTimelineItem): string {
  if (item.startTime && item.endTime) {
    return `${item.startTime}–${item.endTime}`;
  }
  if (item.startTime) {
    return `${item.startTime} (no end time)`;
  }
  return "All day";
}

function logSession(
  skillId: string,
  minutes: number,
  onAddSession: (skillId: string, minutes: number) => void
) {
  if (!Number.isInteger(minutes) || minutes <= 0) return;
  onAddSession(skillId, minutes);
}

export function UnifiedTimelineRow({
  item,
  blockStatus,
  loggedSoFar,
  onAddSession,
}: UnifiedTimelineRowProps) {
  const isSchedule = item.kind === "scheduleBlock";

  return (
    <div
      style={{
        ...styles.timelineRow,
        ...timelineAccentStyle(blockStatus, item.hasConflict),
      }}
    >
      <div>
        <div style={{ fontWeight: 800 }}>
          {formatTimeLabel(item)} ·{" "}
          {isSchedule ? (
            <>
              {priorityEmoji(item.skillPriority)} {item.skillName}
            </>
          ) : (
            <>
              {EVENT_TYPE_LABELS[item.eventType] ?? item.eventType}: {item.title}
            </>
          )}
        </div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>
          {isSchedule ? (
            <>
              Block: <b>{formatMinutes(item.plannedMinutes)}</b>
              {loggedSoFar !== undefined && (
                <>
                  {" "}
                  · Logged so far: <b>{formatMinutes(loggedSoFar)}</b>
                </>
              )}
            </>
          ) : (
            <>
              {item.personName ? `With ${item.personName}` : "Life event"}
              {item.durationMinutes !== undefined && (
                <>
                  {" "}
                  · Duration: <b>{formatMinutes(item.durationMinutes)}</b>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {item.hasConflict && (
          <span
            style={{
              ...styles.statusPill,
              ...styles.statusOverdue,
            }}
            aria-label="Schedule conflict"
          >
            Conflict
          </span>
        )}

        {isSchedule && blockStatus && (
          <span style={{ ...styles.statusPill, ...statusPillStyle(blockStatus) }}>
            {statusLabel(blockStatus)}
          </span>
        )}

        {!isSchedule && item.reminder && (
          <span style={styles.streakPill}>Reminder</span>
        )}

        {isSchedule && onAddSession && (
          <>
            <button
              type="button"
              onClick={() => logSession(item.skillId, 15, onAddSession)}
              style={styles.smallBtn}
              aria-label={`Log 15 minutes for ${item.skillName}`}
            >
              +15
            </button>
            <button
              type="button"
              onClick={() => logSession(item.skillId, 30, onAddSession)}
              style={styles.smallBtn}
              aria-label={`Log 30 minutes for ${item.skillName}`}
            >
              +30
            </button>
          </>
        )}
      </div>
    </div>
  );
}
