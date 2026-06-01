import type { LifeEvent } from "../../core/model";
import { styles } from "../../ui/appStyles";

function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type PersonLinkedEventsProps = {
  linkedEvents: LifeEvent[];
};

export function PersonLinkedEvents({ linkedEvents }: PersonLinkedEventsProps) {
  return (
    <div style={{ ...styles.dashboardSection, minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Linked events</div>
      {linkedEvents.length === 0 ? (
        <div style={{ fontSize: 13, ...styles.textSecondary }}>
          No linked events. Use Add event to plan a hangout or birthday.
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {linkedEvents.map((event) => (
            <li key={event.id} style={{ marginBottom: 4 }}>
              {event.title} · {formatEventDate(event.date)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
