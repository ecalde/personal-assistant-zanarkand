import { useMemo, useState } from "react";
import { partitionEventsByToday } from "../core/events";
import { buildPeopleById, resolveEventPersonLabel } from "../core/people";
import { parseHHMMToMinutes } from "../core/schedule";
import type { EventType, LifeEvent, Person } from "../core/model";
import { styles } from "../ui/appStyles";

export type EventsPageProps = {
  events: LifeEvent[];
  people: Person[];
  onAdd: (input: Omit<LifeEvent, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdate: (event: LifeEvent) => void;
  onDelete: (eventId: string) => void;
};

const EVENT_TYPES: EventType[] = [
  "birthday",
  "hangout",
  "trip",
  "holiday",
  "deadline",
  "other",
];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  birthday: "Birthday",
  hangout: "Hangout",
  trip: "Trip",
  holiday: "Holiday",
  deadline: "Deadline",
  other: "Other",
};

type EventFormState = {
  title: string;
  date: string;
  type: EventType;
  startTime: string;
  endTime: string;
  personId: string;
  personName: string;
  useCustomPersonName: boolean;
  notes: string;
  reminder: boolean;
};

function todayIsoDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function emptyFormState(): EventFormState {
  return {
    title: "",
    date: todayIsoDate(),
    type: "other",
    startTime: "",
    endTime: "",
    personId: "",
    personName: "",
    useCustomPersonName: false,
    notes: "",
    reminder: false,
  };
}

function formFromEvent(event: LifeEvent): EventFormState {
  return {
    title: event.title,
    date: event.date,
    type: event.type,
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    personId: event.personId ?? "",
    personName: event.personName ?? "",
    useCustomPersonName: !event.personId && Boolean(event.personName),
    notes: event.notes ?? "",
    reminder: event.reminder,
  };
}

function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventSchedule(event: LifeEvent): string {
  const dateLabel = formatEventDate(event.date);
  if (!event.startTime) return dateLabel;
  if (event.endTime) return `${dateLabel} · ${event.startTime}–${event.endTime}`;
  return `${dateLabel} · ${event.startTime}`;
}

function EventRow({
  event,
  personLabel,
  onEdit,
  onDelete,
}: {
  event: LifeEvent;
  personLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={styles.listRow}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={styles.statusPill}>{EVENT_TYPE_LABELS[event.type]}</span>
            <strong>{event.title}</strong>
            {event.reminder && <span style={styles.streakPill}>Reminder</span>}
          </div>
          <div style={{ opacity: 0.85 }}>{formatEventSchedule(event)}</div>
          {personLabel && <div>With {personLabel}</div>}
          {event.notes && <div style={{ opacity: 0.85 }}>{event.notes}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventsPage({ events, people, onAdd, onUpdate, onDelete }: EventsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyFormState);
  const [formError, setFormError] = useState<string | null>(null);

  const today = todayIsoDate();
  const peopleById = useMemo(() => buildPeopleById(people), [people]);
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people]
  );

  const { upcoming, past } = useMemo(
    () => partitionEventsByToday(events, today),
    [events, today]
  );

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

  function openEditForm(event: LifeEvent) {
    setForm(formFromEvent(event));
    setEditingId(event.id);
    setFormError(null);
    setShowForm(true);
  }

  function handleSubmit() {
    const title = form.title.trim();
    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (!form.date) {
      setFormError("Date is required.");
      return;
    }
    if (!form.type) {
      setFormError("Type is required.");
      return;
    }

    const startTime = form.startTime.trim() || undefined;
    const endTime = form.endTime.trim() || undefined;

    if (endTime && !startTime) {
      setFormError("Start time is required when end time is set.");
      return;
    }
    if (startTime && endTime && parseHHMMToMinutes(endTime) < parseHHMMToMinutes(startTime)) {
      setFormError("End time must be after start time.");
      return;
    }

    const payload = {
      title,
      date: form.date,
      type: form.type,
      startTime,
      endTime,
      personId: !form.useCustomPersonName && form.personId ? form.personId : undefined,
      personName:
        form.useCustomPersonName && form.personName.trim()
          ? form.personName.trim()
          : undefined,
      notes: form.notes.trim() || undefined,
      reminder: form.reminder,
    };

    if (editingId) {
      const existing = events.find((event) => event.id === editingId);
      if (!existing) {
        setFormError("Could not find that event.");
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
          <div style={styles.cardTitle}>Events</div>
          {!showForm && (
            <button type="button" onClick={openCreateForm}>
              Add event
            </button>
          )}
        </div>
        <div style={{ opacity: 0.85 }}>
          Track birthdays, hangouts, trips, holidays, deadlines, and other important dates.
        </div>
      </div>

      {showForm && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>{editingId ? "Edit event" : "Add event"}</div>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={styles.label}>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                placeholder='e.g., "Alex birthday"'
                style={styles.input}
              />
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={styles.label}>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Type
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      type: e.target.value as EventType,
                    }))
                  }
                  style={styles.select}
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {EVENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={styles.label}>
                Start time (optional)
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, startTime: e.target.value }))
                  }
                  style={styles.timeInput}
                />
              </label>

              <label style={styles.label}>
                End time (optional)
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, endTime: e.target.value }))
                  }
                  style={styles.timeInput}
                />
              </label>
            </div>

            <label style={styles.label}>
              Person (optional)
              <select
                value={form.useCustomPersonName ? "__custom__" : form.personId || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "__custom__") {
                    setForm((current) => ({
                      ...current,
                      useCustomPersonName: true,
                      personId: "",
                    }));
                  } else {
                    setForm((current) => ({
                      ...current,
                      useCustomPersonName: false,
                      personId: value,
                      personName: "",
                    }));
                  }
                }}
                style={styles.select}
              >
                <option value="">None</option>
                {sortedPeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
                <option value="__custom__">Custom name…</option>
              </select>
            </label>

            {form.useCustomPersonName && (
              <label style={styles.label}>
                Custom name
                <input
                  value={form.personName}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, personName: e.target.value }))
                  }
                  placeholder='e.g., "Alex"'
                  style={styles.input}
                />
              </label>
            )}

            <label style={styles.label}>
              Notes (optional)
              <input
                value={form.notes}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                placeholder="Any extra details"
                style={styles.input}
              />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.reminder}
                onChange={(e) =>
                  setForm((current) => ({ ...current, reminder: e.target.checked }))
                }
              />
              Reminder
            </label>

            {formError && <div style={styles.errorInline}>{formError}</div>}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSubmit}>
                {editingId ? "Save changes" : "Add event"}
              </button>
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div style={styles.card}>No events yet. Add your first one above.</div>
      ) : (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Upcoming</div>
            {upcoming.length === 0 ? (
              <div>No upcoming events.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {upcoming.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    personLabel={resolveEventPersonLabel(event, peopleById)}
                    onEdit={() => openEditForm(event)}
                    onDelete={() => onDelete(event.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>Past</div>
              <div style={{ display: "grid", gap: 10 }}>
                {past.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    personLabel={resolveEventPersonLabel(event, peopleById)}
                    onEdit={() => openEditForm(event)}
                    onDelete={() => onDelete(event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
