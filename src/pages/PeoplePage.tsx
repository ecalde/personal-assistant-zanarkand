import { useMemo, useState } from "react";
import {
  eventsForPerson,
  getNextBirthdayDateKey,
  sortPeopleByName,
  sortPeopleByUpcomingBirthday,
} from "../core/people";
import type { LifeEvent, Person } from "../core/model";
import { formatLocalDateKey } from "../core/timeline";
import { styles } from "../ui/appStyles";

export type PeoplePageProps = {
  people: Person[];
  events: LifeEvent[];
  onAdd: (input: Omit<Person, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdate: (person: Person) => void;
  onDelete: (personId: string) => void;
};

type PersonFormState = {
  name: string;
  nickname: string;
  birthdayMonth: string;
  birthdayDay: string;
  relationship: string;
  likes: string;
  dislikes: string;
  giftIdeas: string;
  notes: string;
  lastContactDate: string;
  contactCadenceDays: string;
};

type SortMode = "name" | "birthday";

function emptyFormState(): PersonFormState {
  return {
    name: "",
    nickname: "",
    birthdayMonth: "",
    birthdayDay: "",
    relationship: "",
    likes: "",
    dislikes: "",
    giftIdeas: "",
    notes: "",
    lastContactDate: "",
    contactCadenceDays: "",
  };
}

function birthdayMonthDayFromForm(form: PersonFormState): string | undefined {
  const month = form.birthdayMonth.trim();
  const day = form.birthdayDay.trim();
  if (!month || !day) return undefined;
  return `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formFromPerson(person: Person): PersonFormState {
  const [month = "", day = ""] = person.birthdayMonthDay?.split("-") ?? [];
  return {
    name: person.name,
    nickname: person.nickname ?? "",
    birthdayMonth: month,
    birthdayDay: day,
    relationship: person.relationship ?? "",
    likes: person.likes ?? "",
    dislikes: person.dislikes ?? "",
    giftIdeas: person.giftIdeas ?? "",
    notes: person.notes ?? "",
    lastContactDate: person.lastContactDate ?? "",
    contactCadenceDays:
      person.contactCadenceDays !== undefined ? String(person.contactCadenceDays) : "",
  };
}

function formatBirthdayLabel(person: Person, todayKey: string): string | null {
  const nextDate = getNextBirthdayDateKey(person, todayKey);
  if (!nextDate) return null;
  const [year, month, day] = nextDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PersonRow({
  person,
  todayKey,
  linkedEvents,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: {
  person: Person;
  todayKey: string;
  linkedEvents: LifeEvent[];
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const birthdayLabel = formatBirthdayLabel(person, todayKey);

  return (
    <div style={styles.listRow}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong>{person.name}</strong>
            {person.nickname && (
              <span style={{ opacity: 0.85, fontSize: 13 }}>({person.nickname})</span>
            )}
            {person.relationship && (
              <span style={styles.statusPill}>{person.relationship}</span>
            )}
          </div>
          {birthdayLabel && (
            <div style={{ opacity: 0.85, fontSize: 13 }}>Next birthday: {birthdayLabel}</div>
          )}
          {person.lastContactDate && person.contactCadenceDays && (
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Last contact: {formatEventDate(person.lastContactDate)} · every{" "}
              {person.contactCadenceDays} days
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "start", flexWrap: "wrap" }}>
          <button type="button" onClick={onToggleExpand}>
            {expanded ? "Hide" : "Details"}
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
        <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
          {person.likes && (
            <div>
              <b>Likes:</b> {person.likes}
            </div>
          )}
          {person.dislikes && (
            <div>
              <b>Dislikes:</b> {person.dislikes}
            </div>
          )}
          {person.giftIdeas && (
            <div>
              <b>Gift ideas:</b> {person.giftIdeas}
            </div>
          )}
          {person.notes && (
            <div>
              <b>Notes:</b> {person.notes}
            </div>
          )}
          <div>
            <b>Linked events:</b>{" "}
            {linkedEvents.length === 0 ? (
              "None yet."
            ) : (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {linkedEvents.map((event) => (
                  <li key={event.id}>
                    {event.title} · {formatEventDate(event.date)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PeoplePage({
  people,
  events,
  onAdd,
  onUpdate,
  onDelete,
}: PeoplePageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonFormState>(emptyFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const todayKey = formatLocalDateKey(new Date());

  const sortedPeople = useMemo(() => {
    if (sortMode === "birthday") {
      return sortPeopleByUpcomingBirthday(people, todayKey);
    }
    return sortPeopleByName(people);
  }, [people, sortMode, todayKey]);

  function resetForm() {
    setForm(emptyFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(emptyFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(person: Person) {
    setForm(formFromPerson(person));
    setEditingId(person.id);
    setFormError(null);
    setShowForm(true);
  }

  function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }

    const month = form.birthdayMonth.trim();
    const day = form.birthdayDay.trim();
    if ((month && !day) || (!month && day)) {
      setFormError("Enter both birthday month and day, or leave both empty.");
      return;
    }

    const cadenceRaw = form.contactCadenceDays.trim();
    let contactCadenceDays: number | undefined;
    if (cadenceRaw) {
      const parsed = Number(cadenceRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setFormError("Contact cadence must be a positive whole number.");
        return;
      }
      contactCadenceDays = parsed;
    }

    const payload = {
      name,
      nickname: form.nickname.trim() || undefined,
      birthdayMonthDay: birthdayMonthDayFromForm(form),
      relationship: form.relationship.trim() || undefined,
      likes: form.likes.trim() || undefined,
      dislikes: form.dislikes.trim() || undefined,
      giftIdeas: form.giftIdeas.trim() || undefined,
      notes: form.notes.trim() || undefined,
      lastContactDate: form.lastContactDate.trim() || undefined,
      contactCadenceDays,
    };

    if (editingId) {
      const existing = people.find((person) => person.id === editingId);
      if (!existing) {
        setFormError("Could not find that person.");
        return;
      }
      onUpdate({ ...existing, ...payload });
    } else {
      onAdd(payload);
    }

    resetForm();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={styles.cardTitle}>People</div>
          {!showForm && (
            <button type="button" onClick={openCreateForm}>
              Add person
            </button>
          )}
        </div>
        <div style={{ opacity: 0.85 }}>
          Track friends and family — birthdays, preferences, gift ideas, and check-in reminders.
        </div>
      </div>

      {showForm && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>{editingId ? "Edit person" : "Add person"}</div>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={styles.label}>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                placeholder='e.g., "Alex"'
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Nickname (optional)
              <input
                value={form.nickname}
                onChange={(e) =>
                  setForm((current) => ({ ...current, nickname: e.target.value }))
                }
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              Relationship (optional)
              <input
                value={form.relationship}
                onChange={(e) =>
                  setForm((current) => ({ ...current, relationship: e.target.value }))
                }
                placeholder='e.g., "friend", "family"'
                style={styles.input}
              />
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={styles.label}>
                Birthday month
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={form.birthdayMonth}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, birthdayMonth: e.target.value }))
                  }
                  placeholder="MM"
                  style={styles.input}
                />
              </label>
              <label style={styles.label}>
                Birthday day
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.birthdayDay}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, birthdayDay: e.target.value }))
                  }
                  placeholder="DD"
                  style={styles.input}
                />
              </label>
            </div>

            <label style={styles.label}>
              Likes (optional)
              <textarea
                value={form.likes}
                onChange={(e) => setForm((current) => ({ ...current, likes: e.target.value }))}
                rows={2}
                style={{ ...styles.input, resize: "vertical" }}
              />
            </label>

            <label style={styles.label}>
              Dislikes (optional)
              <textarea
                value={form.dislikes}
                onChange={(e) =>
                  setForm((current) => ({ ...current, dislikes: e.target.value }))
                }
                rows={2}
                style={{ ...styles.input, resize: "vertical" }}
              />
            </label>

            <label style={styles.label}>
              Gift ideas (optional)
              <textarea
                value={form.giftIdeas}
                onChange={(e) =>
                  setForm((current) => ({ ...current, giftIdeas: e.target.value }))
                }
                rows={2}
                style={{ ...styles.input, resize: "vertical" }}
              />
            </label>

            <label style={styles.label}>
              Notes (optional)
              <textarea
                value={form.notes}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                rows={2}
                style={{ ...styles.input, resize: "vertical" }}
              />
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={styles.label}>
                Last contact date (optional)
                <input
                  type="date"
                  value={form.lastContactDate}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, lastContactDate: e.target.value }))
                  }
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Contact cadence (days, optional)
                <input
                  type="number"
                  min={1}
                  value={form.contactCadenceDays}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      contactCadenceDays: e.target.value,
                    }))
                  }
                  placeholder="e.g., 14"
                  style={styles.input}
                />
              </label>
            </div>

            {formError && <div style={styles.errorInline}>{formError}</div>}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSubmit}>
                {editingId ? "Save changes" : "Add person"}
              </button>
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {people.length === 0 ? (
        <div style={styles.card}>No people yet. Add your first contact above.</div>
      ) : (
        <div style={styles.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={styles.cardTitle}>Your people</div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              Sort by
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                style={styles.select}
              >
                <option value="name">Name</option>
                <option value="birthday">Upcoming birthday</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {sortedPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                todayKey={todayKey}
                linkedEvents={eventsForPerson(events, person.id)}
                expanded={expandedId === person.id}
                onToggleExpand={() =>
                  setExpandedId((current) => (current === person.id ? null : person.id))
                }
                onEdit={() => openEditForm(person)}
                onDelete={() => onDelete(person.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
