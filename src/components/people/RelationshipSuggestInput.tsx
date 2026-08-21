import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { suggestRelationshipNames } from "../../core/people";
import { styles } from "../../ui/appStyles";

export type RelationshipSuggestInputProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export function RelationshipSuggestInput({
  value,
  options,
  onChange,
}: RelationshipSuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listId = useId();

  const suggestions = useMemo(
    () => suggestRelationshipNames(options, value),
    [options, value]
  );

  const showList = open && suggestions.length > 0;
  const typedPrefix = value.trim();

  function selectSuggestion(name: string) {
    onChange(name);
    setOpen(false);
    setHighlightIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter") {
      const selected = suggestions[highlightIndex];
      if (selected) {
        event.preventDefault();
        selectSuggestion(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlightIndex(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlightIndex(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder='e.g., "friend", "family"'
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        style={styles.inputCompact}
      />
      {showList && (
        <ul id={listId} role="listbox" style={styles.personSuggestList}>
          {suggestions.map((name, index) => {
            const active = index === highlightIndex;
            const prefixLength = Math.min(typedPrefix.length, name.length);
            return (
              <li key={name} role="presentation">
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
                  onClick={() => selectSuggestion(name)}
                >
                  {prefixLength > 0 ? (
                    <>
                      <span>{name.slice(0, prefixLength)}</span>
                      <span style={{ fontWeight: 700 }}>{name.slice(prefixLength)}</span>
                    </>
                  ) : (
                    name
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
