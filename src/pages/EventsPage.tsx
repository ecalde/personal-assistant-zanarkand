import { useEffect, useMemo, useRef, useState } from "react";
import { EventRecurrenceFields } from "../components/events/EventRecurrenceFields";
import {
  emptyEventRecurrenceFormState,
  eventRecurrenceFormFromRule,
  eventRecurrenceRuleFromForm,
  formatEventRecurrenceLabel,
  seedWeeklyWeekdays,
  type EventRecurrenceFormState,
  type EventRecurrenceUiMode,
  type RecurrenceEndUiKind,
  validateEventRecurrenceForm,
} from "../components/events/eventRecurrenceFormState";
import { partitionEventsByToday } from "../core/events";
import {
  isRecurringLifeEvent,
  type EventSeriesEditScope,
} from "../core/eventSeries";
import { buildPeopleById, resolveEventPersonLabel } from "../core/people";
import { parseHHMMToMinutes } from "../core/schedule";
import type { EventType, LifeEvent, Person } from "../core/model";
import { styles } from "../ui/appStyles";

export type EventSeriesEditIntent = {
  eventId: string;
  scope: EventSeriesEditScope;
  splitDate: string;
};

export type EventsPageProps = {
  events: LifeEvent[];
  people: Person[];
  initialDraft?: EventFormDraft | null;
  initialSeriesEdit?: EventSeriesEditIntent | null;
  onDraftConsumed?: () => void;
  onSeriesEditConsumed?: () => void;
  onAdd: (input: Omit<LifeEvent, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdate: (event: LifeEvent) => void;
  onUpdateEventSeries: (
    scope: EventSeriesEditScope,
    splitDate: string,
    event: LifeEvent
  ) => void;
  onDelete: (eventId: string) => void;
};

export type EventFormDraft = {
  title?: string;
  date?: string;
  type?: EventType;
  personId?: string;
  personName?: string;
  useCustomPersonName?: boolean;
  notes?: string;
  reminder?: boolean;
  startTime?: string;
  endTime?: string;
};

const EVENT_TYPES: EventType[] = [
  "birthday",
  "hangout",
  "trip",
  "holiday",
  "school",
  "career",
  "work",
  "other",
];

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

function formFromDraft(draft: EventFormDraft): EventFormState {
  return {
    ...emptyFormState(),
    ...draft,
    startTime: draft.startTime ?? "",
    endTime: draft.endTime ?? "",
    personId: draft.personId ?? "",
    personName: draft.personName ?? "",
    useCustomPersonName: draft.useCustomPersonName ?? false,
    notes: draft.notes ?? "",
    reminder: draft.reminder ?? false,
    date: draft.date ?? todayIsoDate(),
    type: draft.type ?? "other",
    title: draft.title ?? "",
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
          <div style={{ ...styles.textSecondary }}>{formatEventSchedule(event)}</div>
          {event.recurrence?.frequency && (
            <div style={{ ...styles.textSecondary }}>{formatEventRecurrenceLabel(event.recurrence)}</div>
          )}
          {personLabel && <div>With {personLabel}</div>}
          {event.notes && <div style={{ ...styles.textSecondary }}>{event.notes}</div>}
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

export default function EventsPage({
  events,
  people,
  initialDraft = null,
  initialSeriesEdit = null,
  onDraftConsumed,
  onSeriesEditConsumed,
  onAdd,
  onUpdate,
  onUpdateEventSeries,
  onDelete,
}: EventsPageProps) {
  const [showForm, setShowForm] = useState(
    () => Boolean(initialDraft) || Boolean(initialSeriesEdit)
  );
  const [editingId, setEditingId] = useState<string | null>(() =>
    initialSeriesEdit ? initialSeriesEdit.eventId : null
  );
  const [form, setForm] = useState<EventFormState>(() => {
    if (initialDraft) return formFromDraft(initialDraft);
    if (initialSeriesEdit) {
      const event = events.find((entry) => entry.id === initialSeriesEdit.eventId);
      if (event) {
        return { ...formFromEvent(event), date: initialSeriesEdit.splitDate };
      }
    }
    return emptyFormState();
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [recurrenceForm, setRecurrenceForm] = useState<EventRecurrenceFormState>(() => {
    if (initialSeriesEdit) {
      const event = events.find((entry) => entry.id === initialSeriesEdit.eventId);
      if (event) return eventRecurrenceFormFromRule(event.date, event.recurrence);
    }
    return emptyEventRecurrenceFormState();
  });
  const recurrenceFormRef = useRef(recurrenceForm);
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);
  const [seriesScope, setSeriesScope] = useState<EventSeriesEditScope>(
    () => initialSeriesEdit?.scope ?? "entire"
  );
  const [seriesSplitDate, setSeriesSplitDate] = useState<string>(
    () => initialSeriesEdit?.splitDate ?? todayIsoDate()
  );

  function setRecurrenceFormState(next: EventRecurrenceFormState) {
    recurrenceFormRef.current = next;
    setRecurrenceForm(next);
  }

  const today = todayIsoDate();
  const peopleById = useMemo(() => buildPeopleById(people), [people]);
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people]
  );

  useEffect(() => {
    if (!initialDraft) return;
    onDraftConsumed?.();
  }, [initialDraft, onDraftConsumed]);

  useEffect(() => {
    if (!initialSeriesEdit) return;
    onSeriesEditConsumed?.();
  }, [initialSeriesEdit, onSeriesEditConsumed]);

  const { upcoming, past } = useMemo(
    () => partitionEventsByToday(events, today),
    [events, today]
  );

  function resetForm() {
    setForm(emptyFormState());
    setRecurrenceFormState(emptyEventRecurrenceFormState());
    setRecurrenceError(null);
    setSeriesScope("entire");
    setSeriesSplitDate(todayIsoDate());
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(emptyFormState());
    setRecurrenceFormState(emptyEventRecurrenceFormState());
    setRecurrenceError(null);
    setSeriesScope("entire");
    setSeriesSplitDate(todayIsoDate());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(
    event: LifeEvent,
    scope: EventSeriesEditScope = "entire",
    splitDate?: string
  ) {
    setForm(formFromEvent(event));
    setRecurrenceFormState(eventRecurrenceFormFromRule(event.date, event.recurrence));
    setRecurrenceError(null);
    setSeriesScope(scope);
    setSeriesSplitDate(splitDate ?? event.date);
    setEditingId(event.id);
    setFormError(null);
    setShowForm(true);
  }

  function handleRecurrenceModeChange(mode: EventRecurrenceUiMode) {
    const next: EventRecurrenceFormState = {
      ...recurrenceFormRef.current,
      mode,
    };
    if (mode === "weekly") {
      next.byWeekdays = seedWeeklyWeekdays(form.date, next.byWeekdays);
    }
    if (mode === "none") {
      next.byWeekdays = [];
      next.dayOfMonth = "";
      next.endKind = "never";
      next.endDate = "";
      next.maxOccurrences = "";
      setRecurrenceError(null);
    }
    setRecurrenceFormState(next);
  }

  function handleRecurrenceEndKindChange(endKind: RecurrenceEndUiKind) {
    setRecurrenceFormState({ ...recurrenceFormRef.current, endKind });
    setRecurrenceError(null);
  }

  function handleRecurrenceFieldBlur() {
    if (recurrenceFormRef.current.mode === "none") return;
    setRecurrenceError(validateEventRecurrenceForm(form.date, recurrenceFormRef.current));
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

    const recurrenceValidationError = validateEventRecurrenceForm(form.date, recurrenceFormRef.current);
    if (recurrenceValidationError) {
      setRecurrenceError(recurrenceValidationError);
      return;
    }

    const recurrence = eventRecurrenceRuleFromForm(form.date, recurrenceFormRef.current);

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
      recurrence,
    };

    if (editingId) {
      const existing = events.find((event) => event.id === editingId);
      if (!existing) {
        setFormError("Could not find that event.");
        return;
      }
      const merged: LifeEvent = { ...existing, ...payload };
      const editingRecurring =
        recurrence !== undefined && recurrenceFormRef.current.mode !== "none";

      if (editingRecurring && isRecurringLifeEvent(existing)) {
        if (seriesScope === "thisAndFuture" && !seriesSplitDate) {
          setFormError("Split date is required for this-and-future edits.");
          return;
        }
        if (seriesScope === "thisOccurrenceOnly" && !initialSeriesEdit?.splitDate) {
          setFormError("Occurrence date is required for this-occurrence-only edits.");
          return;
        }
        const splitDate =
          seriesScope === "thisOccurrenceOnly"
            ? initialSeriesEdit!.splitDate
            : seriesSplitDate;
        onUpdateEventSeries(seriesScope, splitDate, merged);
      } else {
        onUpdate(merged);
      }
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
        <div style={{ ...styles.textSecondary }}>
          Track birthdays, hangouts, trips, holidays, school, career, work, and other important dates.
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
                  onChange={(e) => {
                    const date = e.target.value;
                    setForm((current) => ({ ...current, date }));
                    if (recurrenceFormRef.current.mode === "weekly") {
                      setRecurrenceFormState({
                        ...recurrenceFormRef.current,
                        byWeekdays: seedWeeklyWeekdays(date, recurrenceFormRef.current.byWeekdays),
                      });
                    }
                  }}
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

            <EventRecurrenceFields
              state={recurrenceForm}
              radioGroupName={editingId ? `event-recurrence-edit-${editingId}` : "event-recurrence-create"}
              endRadioGroupName={
                editingId ? `event-recurrence-end-edit-${editingId}` : "event-recurrence-end-create"
              }
              onChange={setRecurrenceFormState}
              onModeChange={handleRecurrenceModeChange}
              onEndKindChange={handleRecurrenceEndKindChange}
              onFieldBlur={handleRecurrenceFieldBlur}
              error={recurrenceError}
            />

            {editingId && recurrenceForm.mode !== "none" ? (
              <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                <legend style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  Edit scope
                </legend>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name={`event-series-scope-${editingId}`}
                    checked={seriesScope === "entire"}
                    onChange={() => setSeriesScope("entire")}
                  />
                  Entire series
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name={`event-series-scope-${editingId}`}
                    checked={seriesScope === "thisAndFuture"}
                    onChange={() => setSeriesScope("thisAndFuture")}
                  />
                  This and future
                </label>
                {initialSeriesEdit?.splitDate ? (
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="radio"
                      name={`event-series-scope-${editingId}`}
                      checked={seriesScope === "thisOccurrenceOnly"}
                      onChange={() => setSeriesScope("thisOccurrenceOnly")}
                    />
                    This occurrence only
                  </label>
                ) : null}
                {seriesScope === "thisAndFuture" ? (
                  <label style={styles.label}>
                    Split from date
                    <input
                      type="date"
                      value={seriesSplitDate}
                      onChange={(e) => setSeriesSplitDate(e.target.value)}
                      style={styles.input}
                    />
                  </label>
                ) : null}
                <p style={{ ...styles.helpText, margin: 0 }}>
                  Entire series updates every occurrence. This and future keeps past
                  occurrences unchanged and starts a new series from the split date.
                  {initialSeriesEdit?.splitDate
                    ? " This occurrence only changes one date and leaves the rest of the series unchanged."
                    : null}
                </p>
              </fieldset>
            ) : null}

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
