import type { UpcomingBirthdayItem, PersonFollowUpItem } from "../../core/people";
import { styles } from "../../ui/appStyles";

export type PeopleRemindersSectionProps = {
  birthdays: UpcomingBirthdayItem[];
  followUps: PersonFollowUpItem[];
  birthdayWindowDays: number;
};

function formatBirthdayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function PeopleRemindersSection({
  birthdays,
  followUps,
  birthdayWindowDays,
}: PeopleRemindersSectionProps) {
  if (birthdays.length === 0 && followUps.length === 0) {
    return null;
  }

  return (
    <section style={styles.dashboardSection} aria-label="People reminders">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>People reminders</h2>
      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>
        Birthdays in the next {birthdayWindowDays} days and contacts to follow up with.
      </p>

      {birthdays.length > 0 && (
        <div style={{ marginBottom: followUps.length > 0 ? 12 : 0 }}>
          <h3 style={{ fontWeight: 700, margin: "0 0 8px 0", fontSize: 14 }}>Upcoming birthdays</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {birthdays.map((item) => (
              <div key={item.person.id} style={styles.listRow}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <strong>{item.person.name}</strong>
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
                    <span>{formatBirthdayDate(item.nextDateKey)}</span>
                    <span style={{ ...styles.statusPill, ...styles.statusIdle }}>
                      {item.urgencyLabel}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {followUps.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 700, margin: "0 0 8px 0", fontSize: 14 }}>Needs follow-up</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {followUps.map((item) => (
              <div key={item.person.id} style={styles.listRow}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <strong>{item.person.name}</strong>
                  <div style={{ ...styles.textSecondary, fontSize: 13 }}>
                    Last contact {item.daysSinceContact} days ago · every {item.cadenceDays} days
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
