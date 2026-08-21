import { useId, useState, type KeyboardEvent } from "react";
import { filterPeopleByIdentityQuery } from "../../core/people";
import type { Person } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type EventPeoplePickerProps = {
  people: Person[];
  personIds: string[];
  personName: string;
  useCustomPersonName: boolean;
  onChange: (next: {
    personIds: string[];
    personName: string;
    useCustomPersonName: boolean;
  }) => void;
};

function personOptionLabel(person: Person): string {
  let label = person.name;
  if (person.nickname) label += ` (${person.nickname})`;
  if (person.relationship) label += ` · ${person.relationship}`;
  return label;
}

export function EventPeoplePicker({
  people,
  personIds,
  personName,
  useCustomPersonName,
  onChange,
}: EventPeoplePickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listId = useId();

  const selected = people.filter((person) => personIds.includes(person.id));
  const remaining = people.filter((person) => !personIds.includes(person.id));
  const matches = filterPeopleByIdentityQuery(remaining, query);
  const typedQuery = query.trim();
  const showSuggestions = open && typedQuery.length > 0 && matches.length > 0;

  function removePerson(personId: string) {
    onChange({
      personIds: personIds.filter((id) => id !== personId),
      personName,
      useCustomPersonName: false,
    });
  }

  function addPerson(personId: string) {
    if (!personId || personIds.includes(personId)) return;
    onChange({
      personIds: [...personIds, personId],
      personName: "",
      useCustomPersonName: false,
    });
    setQuery("");
    setOpen(false);
    setHighlightIndex(0);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) {
      if (event.key === "ArrowDown" && matches.length > 0 && typedQuery) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => (current + 1) % matches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => (current - 1 + matches.length) % matches.length);
      return;
    }

    if (event.key === "Enter") {
      const person = matches[highlightIndex];
      if (person) {
        event.preventDefault();
        addPerson(person.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {selected.map((person) => (
            <span key={person.id} style={{ ...styles.statusPill, display: "inline-flex", gap: 6 }}>
              {person.name}
              <button
                type="button"
                onClick={() => removePerson(person.id)}
                style={styles.ghostBtn}
                aria-label={`Remove ${person.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {remaining.length > 0 && (
        <label style={styles.label}>
          Find person
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlightIndex(0);
            }}
            onFocus={() => {
              setOpen(true);
              setHighlightIndex(0);
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Type a name, nickname, or relationship"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={listId}
            style={styles.inputCompact}
          />
        </label>
      )}

      {showSuggestions && (
        <ul id={listId} role="listbox" style={styles.personSuggestList}>
          {matches.map((person, index) => {
            const active = index === highlightIndex;
            return (
              <li key={person.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  style={{
                    ...styles.personSuggestItem,
                    ...(active ? styles.personSuggestItemActive : {}),
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => addPerson(person.id)}
                >
                  {personOptionLabel(person)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {typedQuery.length > 0 && matches.length === 0 && remaining.length > 0 && (
        <div style={styles.helpText}>
          No people match &ldquo;{typedQuery}&rdquo;. Scroll the list below, or use Custom name.
        </div>
      )}

      <label style={styles.label}>
        {selected.length > 0 ? "Or pick from the list" : "People (optional)"}
        <select
          value={useCustomPersonName ? "__custom__" : ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "__custom__") {
              onChange({ personIds: [], personName, useCustomPersonName: true });
              setQuery("");
              return;
            }
            if (value === "__none__") {
              onChange({ personIds: [], personName: "", useCustomPersonName: false });
              setQuery("");
              return;
            }
            if (!value) return;
            addPerson(value);
          }}
          style={styles.select}
        >
          <option value="">
            {remaining.length === 0 && !useCustomPersonName ? "No more people" : "Scroll names…"}
          </option>
          {useCustomPersonName && <option value="__none__">None</option>}
          {remaining.map((person) => (
            <option key={person.id} value={person.id}>
              {personOptionLabel(person)}
            </option>
          ))}
          {selected.length === 0 && <option value="__custom__">Custom name…</option>}
        </select>
      </label>

      {useCustomPersonName && (
        <label style={styles.label}>
          Custom name
          <input
            value={personName}
            onChange={(e) =>
              onChange({
                personIds: [],
                personName: e.target.value,
                useCustomPersonName: true,
              })
            }
            placeholder='e.g., "Alex"'
            style={styles.input}
          />
        </label>
      )}
    </div>
  );
}
