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

type ItemCategory = "skill" | "event" | "marker" | "allDay";

const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday",
  hangout: "Hangout",
  trip: "Trip",
  holiday: "Holiday",
  deadline: "Deadline",
  other: "Other",
};

function itemCategory(item: UnifiedTimelineItem): ItemCategory {
  if (item.kind === "scheduleBlock") return "skill";
  if (item.startTime && item.endTime) return "event";
  if (item.startTime) return "marker";
  return "allDay";
}

function categoryLabel(category: ItemCategory): string {
  if (category === "skill") return "Skill";
  if (category === "event") return "Event";
  if (category === "marker") return "Marker";
  return "All-day";
}

function categoryPillStyle(category: ItemCategory) {
  if (category === "skill") return styles.statusIdle;
  if (category === "event") return styles.statusEvent;
  if (category === "marker") return styles.statusMarker;
  return styles.statusAllDay;
}

function timelineAccentStyle(
  item: UnifiedTimelineItem,
  category: ItemCategory,
  blockStatus?: BlockStatus
) {
  if (item.hasConflict) return styles.timelineAccentConflict;

  if (category === "skill") {
    if (blockStatus === "done") return styles.timelineAccentDone;
    if (blockStatus === "behind") return styles.timelineAccentBehind;
    if (blockStatus === "inProgress") return styles.timelineAccentInProgress;
    if (blockStatus === "upcoming") return styles.timelineAccentUpcoming;
    return styles.timelineAccentUpcoming;
  }

  if (category === "event") return styles.timelineAccentEvent;
  if (category === "marker") return styles.timelineAccentMarker;
  return styles.timelineAccentAllDay;
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

function overlapLabel(item: UnifiedTimelineItem): string {
  return item.kind === "scheduleBlock" ? "Overlap (event)" : "Overlap (skill)";
}

function formatTimeLabel(item: UnifiedTimelineItem, category: ItemCategory): string {
  if (category === "event") {
    return `${item.startTime}–${item.endTime}`;
  }
  if (category === "marker") {
    return `${item.startTime} · time set (no end)`;
  }
  return "All-day (no time)";
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
  const category = itemCategory(item);

  return (
    <div
      style={{
        ...styles.timelineRow,
        ...timelineAccentStyle(item, category, blockStatus),
      }}
    >
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              ...styles.statusPill,
              ...styles.categoryPill,
              ...categoryPillStyle(category),
            }}
          >
            {categoryLabel(category)}
          </span>
          <div style={{ fontWeight: 800 }}>
            {formatTimeLabel(item, category)} ·{" "}
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
              {category === "marker" && (
                <> · Doesn&apos;t count as blocked time yet.</>
              )}
            </>
          )}
        </div>

        {item.hasConflict && (
          <div style={styles.helpText}>
            Overlaps a timed item today. Review your schedule.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {item.hasConflict && (
          <span
            style={{
              ...styles.statusPill,
              ...styles.statusOverdue,
            }}
            aria-label={
              isSchedule
                ? "Skill block overlaps a timed event"
                : "Event overlaps a skill block"
            }
          >
            {overlapLabel(item)}
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
