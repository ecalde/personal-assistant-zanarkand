import type { EventType, Person } from "../../core/model";
import type { UpcomingEventItem } from "../../core/events";
import { buildPeopleById, resolveEventPersonLabel } from "../../core/people";
import { styles } from "../../ui/appStyles";

export type UpcomingEventsSectionProps = {
  items: UpcomingEventItem[];
  windowDays: number;
  people?: Person[];
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  birthday: "Birthday",
  hangout: "Hangout",
  trip: "Trip",
  holiday: "Holiday",
  school: "School",
  career: "Career",
  work: "Work",
  other: "Other",
};

function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatEventTime(event: UpcomingEventItem["event"]): string | null {
  if (!event.startTime) return null;
  if (event.endTime) return `${event.startTime}–${event.endTime}`;
  return event.startTime;
}

function UpcomingEventRow({
  item,
  peopleById,
}: {
  item: UpcomingEventItem;
  peopleById: Map<string, Person>;
}) {
  const { event, urgencyLabel } = item;
  const dateLabel = formatEventDate(event.date);
  const timeLabel = formatEventTime(event);
  const personLabel = resolveEventPersonLabel(event, peopleById);

  return (
    <div style={styles.listRow}>
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={styles.statusPill}>{EVENT_TYPE_LABELS[event.type]}</span>
          <strong>{event.title}</strong>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            ...styles.textSecondary,
            fontSize: 13,
          }}
        >
          <span>
            {dateLabel}
            {timeLabel ? ` · ${timeLabel}` : ""}
          </span>
          <span style={{ ...styles.statusPill, ...styles.statusIdle }}>{urgencyLabel}</span>
          {event.reminder && <span style={styles.streakPill}>Reminder</span>}
        </div>

        {personLabel && <div style={{ fontSize: 13 }}>With {personLabel}</div>}
      </div>
    </div>
  );
}

export function UpcomingEventsSection({
  items,
  windowDays,
  people = [],
}: UpcomingEventsSectionProps) {
  const peopleById = buildPeopleById(people);

  return (
    <section style={styles.dashboardSection} aria-label="Upcoming events">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Upcoming events</h2>
      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>Next {windowDays} days.</p>

      {items.length === 0 ? (
        <p style={{ margin: 0, ...styles.textMuted }}>No upcoming events.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item) => (
            <UpcomingEventRow key={item.event.id} item={item} peopleById={peopleById} />
          ))}
        </div>
      )}
    </section>
  );
}
