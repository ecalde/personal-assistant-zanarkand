import { useMemo, useState } from "react";
import { eventsForPerson, filterAndSortPeople, type PeopleSortMode } from "../core/people";
import type { EventType, LifeEvent, Person } from "../core/model";
import { formatLocalDateKey } from "../core/timeline";
import { PersonCard } from "../components/people/PersonCard";
import { PersonForm } from "../components/people/PersonForm";
import { PeopleToolbar } from "../components/people/PeopleToolbar";
import {
  emptyPersonFormState,
  personFormFromPerson,
  personPayloadFromForm,
  validatePersonForm,
  type PersonFormState,
} from "../components/people/personFormState";
import { styles } from "../ui/appStyles";

export type LinkedEventPreset = {
  type: EventType;
  title: string;
  date?: string;
};

export type PeoplePageProps = {
  people: Person[];
  events: LifeEvent[];
  onAdd: (input: Omit<Person, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdate: (person: Person) => void;
  onDelete: (personId: string) => void;
  onCreateLinkedEvent: (personId: string, preset: LinkedEventPreset) => void;
};

export default function PeoplePage({
  people,
  events,
  onAdd,
  onUpdate,
  onDelete,
  onCreateLinkedEvent,
}: PeoplePageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonFormState>(emptyPersonFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<PeopleSortMode>("name");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const todayKey = formatLocalDateKey(new Date());

  const filteredPeople = useMemo(
    () =>
      filterAndSortPeople(people, {
        query,
        sortMode,
        todayKey,
      }),
    [people, query, sortMode, todayKey]
  );

  const visiblePeople = useMemo(() => {
    if (!editingId) return filteredPeople;
    if (filteredPeople.some((person) => person.id === editingId)) return filteredPeople;
    const editingPerson = people.find((person) => person.id === editingId);
    if (!editingPerson) return filteredPeople;
    return [editingPerson, ...filteredPeople];
  }, [editingId, filteredPeople, people]);

  function resetForm() {
    setForm(emptyPersonFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setForm(emptyPersonFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(person: Person) {
    setForm(personFormFromPerson(person));
    setEditingId(person.id);
    setExpandedId(person.id);
    setFormError(null);
    setShowForm(false);
  }

  function handleSubmit() {
    const validationError = validatePersonForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = personPayloadFromForm(form);

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

  function handleContactedToday(person: Person) {
    onUpdate({ ...person, lastContactDate: todayKey });
  }

  function handleCreateLinkedEvent(person: Person) {
    onCreateLinkedEvent(person.id, {
      type: "hangout",
      title: `Hangout with ${person.name}`,
      date: todayKey,
    });
  }

  function handleToggleExpand(personId: string) {
    if (editingId === personId) {
      resetForm();
      setExpandedId(personId);
      return;
    }
    setExpandedId((current) => (current === personId ? null : personId));
  }

  const creating = showForm && !editingId;

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
          <div>
            <div style={{ ...styles.cardTitle, marginBottom: 4 }}>People</div>
            <div style={styles.textSecondary}>
              Track friends and family — birthdays, preferences, gift ideas, and check-in reminders.
            </div>
          </div>
          {!creating && (
            <button type="button" onClick={openCreateForm} style={styles.actionBtn}>
              Add person
            </button>
          )}
        </div>

        {people.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <PeopleToolbar
              query={query}
              sortMode={sortMode}
              visibleCount={filteredPeople.length}
              totalCount={people.length}
              onQueryChange={setQuery}
              onSortModeChange={setSortMode}
            />
          </div>
        )}
      </div>

      {creating && (
        <PersonForm
          editing={false}
          form={form}
          formError={formError}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={resetForm}
        />
      )}

      {people.length === 0 ? (
        <div style={styles.card}>
          <div style={{ marginBottom: 12 }}>
            No people yet. Add someone you want to stay in touch with — birthdays, gift ideas,
            and check-in reminders live here.
          </div>
          {!creating && (
            <button type="button" onClick={openCreateForm} style={styles.actionBtn}>
              Add your first person
            </button>
          )}
        </div>
      ) : filteredPeople.length === 0 && !editingId ? (
        <div style={styles.card}>
          <div style={styles.helpText}>
            No matches for &ldquo;{query.trim()}&rdquo;. Try a name, nickname, relationship, or
            note keyword.
          </div>
        </div>
      ) : (
        <div style={styles.peopleGalleryGrid}>
          {visiblePeople.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              todayKey={todayKey}
              linkedEvents={eventsForPerson(events, person.id)}
              expanded={expandedId === person.id && editingId !== person.id}
              editing={editingId === person.id}
              editForm={
                editingId === person.id ? (
                  <PersonForm
                    editing
                    embedded
                    form={form}
                    formError={formError}
                    onChange={setForm}
                    onSubmit={handleSubmit}
                    onCancel={resetForm}
                  />
                ) : undefined
              }
              onToggleExpand={() => handleToggleExpand(person.id)}
              onContactedToday={() => handleContactedToday(person)}
              onCreateLinkedEvent={() => handleCreateLinkedEvent(person)}
              onEdit={() => openEditForm(person)}
              onDelete={() => {
                if (editingId === person.id) resetForm();
                onDelete(person.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
