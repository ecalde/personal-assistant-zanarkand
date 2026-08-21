import { useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatMuscleName, suggestMuscles } from "../../core/muscles";
import { styles } from "../../ui/appStyles";

export type MuscleTargetPickerProps = {
  value: string[];
  onChange: (next: string[]) => void;
};

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  border: "1px solid var(--aether-border, #ddd)",
  background: "var(--aether-surface-sunken, #f6f7f9)",
  color: "var(--aether-text, inherit)",
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 8px",
};

export function MuscleTargetPicker({ value, onChange }: MuscleTargetPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listId = useId();

  const suggestions = useMemo(
    () => suggestMuscles(query, { excludeIds: value, limit: 8 }),
    [query, value]
  );

  const showList = open && suggestions.length > 0;

  function addMuscle(id: string) {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    setOpen(false);
    setHighlightIndex(0);
  }

  function removeMuscle(id: string) {
    onChange(value.filter((item) => item !== id));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !query && value.length > 0) {
      removeMuscle(value[value.length - 1]!);
      return;
    }

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
        addMuscle(selected.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {value.length > 0 && (
        <div style={chipRow}>
          {value.map((id) => (
            <span key={id} style={chip}>
              {formatMuscleName(id)}
              <button
                type="button"
                aria-label={`Remove ${formatMuscleName(id)}`}
                onClick={() => removeMuscle(id)}
                style={{
                  ...styles.ghostBtn,
                  padding: 0,
                  minWidth: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

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
        onKeyDown={handleKeyDown}
        placeholder='Target muscles (optional) — e.g. "quads", "calf"'
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        style={styles.inputCompact}
      />

      {showList && (
        <ul id={listId} role="listbox" style={styles.personSuggestList}>
          {suggestions.map((item, index) => {
            const active = index === highlightIndex;
            const viaAlias =
              item.matchedVia.toLowerCase() !== item.name.toLowerCase()
                ? item.matchedVia
                : null;
            return (
              <li key={item.id} role="presentation">
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
                  onClick={() => addMuscle(item.id)}
                >
                  <span style={{ fontWeight: 700 }}>{item.name}</span>
                  <span style={{ ...styles.textMuted, fontSize: 12, marginLeft: 8 }}>
                    {item.kind === "group" ? "group" : "muscle"}
                    {viaAlias ? ` · matched “${viaAlias}”` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
