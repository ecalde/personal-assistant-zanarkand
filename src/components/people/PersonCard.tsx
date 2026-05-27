import {
  getPersonBirthdayStatus,
  getPersonFollowUpStatus,
} from "../../core/people";
import type { LifeEvent, Person } from "../../core/model";
import { PersonLinkedEvents } from "./PersonLinkedEvents";
import { PersonPreferenceSection } from "./PersonPreferenceSection";
import { styles } from "../../ui/appStyles";

function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBirthdayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type PersonCardProps = {
  person: Person;
  todayKey: string;
  linkedEvents: LifeEvent[];
  expanded: boolean;
  onToggleExpand: () => void;
  onContactedToday: () => void;
  onCreateLinkedEvent: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function PersonCard({
  person,
  todayKey,
  linkedEvents,
  expanded,
  onToggleExpand,
  onContactedToday,
  onCreateLinkedEvent,
  onEdit,
  onDelete,
}: PersonCardProps) {
  const birthdayStatus = getPersonBirthdayStatus(person, todayKey);
  const followUpStatus = getPersonFollowUpStatus(person, todayKey);
  const contactedToday = person.lastContactDate === todayKey;

  const hasPreferences = Boolean(
    person.likes || person.dislikes || person.giftIdeas || person.notes
  );

  let summaryLine = "No contact tracking yet.";
  if (person.lastContactDate && person.contactCadenceDays) {
    summaryLine = `Last contact ${formatShortDate(person.lastContactDate)} · every ${person.contactCadenceDays} days`;
  } else if (person.lastContactDate) {
    summaryLine = `Last contact ${formatShortDate(person.lastContactDate)}`;
  } else if (person.contactCadenceDays) {
    summaryLine = `Check in every ${person.contactCadenceDays} days`;
  }

  return (
    <div style={{ ...styles.listRow, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
          <strong>{person.name}</strong>
          {person.nickname && (
            <span style={{ opacity: 0.85, fontSize: 13 }}>({person.nickname})</span>
          )}
          {person.relationship && (
            <span style={styles.statusPill}>{person.relationship}</span>
          )}
        </div>

        {(birthdayStatus || followUpStatus) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {birthdayStatus && (
              <span style={{ ...styles.statusPill, ...styles.statusIdle }}>
                Birthday {formatBirthdayDate(birthdayStatus.nextDateKey)} ·{" "}
                {birthdayStatus.urgencyLabel}
              </span>
            )}
            {followUpStatus?.needsFollowUp && (
              <span style={{ ...styles.statusPill, ...styles.statusOverdue }}>
                Needs follow-up
                {followUpStatus.daysOverdue > 0
                  ? ` · ${followUpStatus.daysOverdue} days overdue`
                  : ""}
              </span>
            )}
            {followUpStatus && !followUpStatus.needsFollowUp && (
              <span style={{ ...styles.statusPill, ...styles.statusIdle }}>
                Due in {followUpStatus.cadenceDays - followUpStatus.daysSinceContact} days
              </span>
            )}
          </div>
        )}

        <div style={{ opacity: 0.85, fontSize: 13 }}>{summaryLine}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={onToggleExpand}>
            {expanded ? "Hide" : "Details"}
          </button>
          {contactedToday ? (
            <span style={styles.streakPillMuted}>Contacted today</span>
          ) : (
            <button type="button" onClick={onContactedToday}>
              Contacted today
            </button>
          )}
          <button type="button" onClick={onCreateLinkedEvent}>
            Add event
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {!hasPreferences && (
            <div style={styles.helpText}>
              No preferences saved yet. Edit to add likes, gift ideas, or notes.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <PersonPreferenceSection title="Likes" content={person.likes} />
            <PersonPreferenceSection title="Dislikes" content={person.dislikes} />
            <PersonPreferenceSection title="Gift ideas" content={person.giftIdeas} />
            <PersonPreferenceSection title="Notes" content={person.notes} />
          </div>

          <PersonLinkedEvents linkedEvents={linkedEvents} />
        </div>
      )}
    </div>
  );
}
