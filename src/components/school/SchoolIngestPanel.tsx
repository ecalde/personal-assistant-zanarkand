import { useState } from "react";
import type { SchoolCourse, SchoolGradedItem, SchoolReminder } from "../../core/model";
import {
  SCHOOL_REMINDER_KIND_LABELS,
  SCHOOL_REMINDER_KINDS,
  SCHOOL_STAFF_ROLE_LABELS,
  SCHOOL_STAFF_ROLES,
} from "../../core/school";
import {
  SCHOOL_INGEST_MAX_CHARS,
  SCHOOL_PASTE_KIND_LABELS,
  annotateSchoolIngestDuplicates,
  parseSchoolPaste,
  validateSchoolIngestApprovals,
  yearFromCourseTerm,
  type SchoolIngestSuggestion,
  type SchoolPasteKind,
  type SchoolWorkItemSuggestion,
} from "../../core/schoolParse";
import { styles } from "../../ui/appStyles";

export type SchoolIngestPanelProps = {
  course: SchoolCourse;
  reminders: SchoolReminder[];
  gradedItems: SchoolGradedItem[];
  onApply: (suggestions: SchoolIngestSuggestion[]) => void;
};

export function SchoolIngestPanel({
  course,
  reminders,
  gradedItems,
  onApply,
}: SchoolIngestPanelProps) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<SchoolPasteKind | null>(null);
  const [suggestions, setSuggestions] = useState<SchoolIngestSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewing = suggestions !== null;

  function resetReview() {
    setKind(null);
    setSuggestions(null);
    setError(null);
  }

  function parsePaste() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Paste syllabus text, a Canvas table, or load a .txt file.");
      return;
    }
    if (trimmed.length > SCHOOL_INGEST_MAX_CHARS) {
      setError(`Paste is too long. Keep it under ${SCHOOL_INGEST_MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    const result = parseSchoolPaste(trimmed, {
      course,
      reminders,
      gradedItems,
      referenceYear: yearFromCourseTerm(course.term, new Date().getFullYear()),
    });
    if (result.suggestions.length === 0) {
      setKind(null);
      setSuggestions(null);
      setError(
        "Nothing structured was found. Try a Canvas weight table, assignment list, or a syllabus section."
      );
      return;
    }
    setKind(result.kind);
    setSuggestions(result.suggestions);
    setError(null);
  }

  async function loadTextFile(file: File | undefined) {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isTxt = name.endsWith(".txt") || file.type === "text/plain" || file.type === "";
    if (!isTxt) {
      setError("Use a .txt file. PDFs are not supported.");
      return;
    }
    if (file.size > SCHOOL_INGEST_MAX_CHARS) {
      setError(`File is too large. Keep it under ${SCHOOL_INGEST_MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    const contents = await file.text();
    if (contents.length > SCHOOL_INGEST_MAX_CHARS) {
      setError(`File is too large. Keep it under ${SCHOOL_INGEST_MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    setText(contents);
    setError(null);
    resetReview();
  }

  function patchSuggestion(id: string, patch: object) {
    setSuggestions((current) => {
      if (!current) return current;
      const next = current.map((row) =>
        row.id === id ? ({ ...row, ...patch } as SchoolIngestSuggestion) : row
      );
      const annotated = annotateSchoolIngestDuplicates(next, { course, reminders, gradedItems });
      return annotated.map((row) => {
        const previous = next.find((item) => item.id === row.id);
        return previous ? { ...row, selected: previous.selected } : row;
      });
    });
  }

  function approve() {
    if (!suggestions) return;
    const approved = suggestions.filter((row) => row.selected);
    const validationError = validateSchoolIngestApprovals(suggestions);
    if (validationError) {
      setError(validationError);
      return;
    }
    onApply(approved);
    setText("");
    resetReview();
  }

  const selectedCount = suggestions?.filter((row) => row.selected).length ?? 0;

  return (
    <section style={{ display: "grid", gap: 8 }} aria-label={`Paste ingest for ${course.name}`}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Paste ingest</h3>
      <p style={{ ...styles.helpText, margin: 0 }}>
        Paste a Canvas <strong>Group / Weight</strong> table to create grade categories, an assignment
        list for reminders, or syllabus text. Review suggestions before anything is saved. Optional
        .txt files only — no PDF or AI.
      </p>
      {error ? (
        <div style={styles.errorBox} role="alert">
          {error}
        </div>
      ) : null}

      {!reviewing ? (
        <>
          <label style={styles.label}>
            Course text
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              style={{ ...styles.inputFluid, minHeight: 120, resize: "vertical" }}
              placeholder="Paste Canvas Group / Weight tables, assignment lists, or syllabus text"
            />
          </label>
          <label style={styles.label}>
            Load .txt file
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={(event) => {
                void loadTextFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <div>
            <button type="button" onClick={parsePaste} style={styles.actionBtn}>
              Parse text
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...styles.metaText, margin: 0 }}>
            Detected: {kind ? SCHOOL_PASTE_KIND_LABELS[kind] : "Unknown"} · {suggestions.length}{" "}
            suggestion{suggestions.length === 1 ? "" : "s"} · {selectedCount} selected
          </p>
          {suggestions.length > 0 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={() =>
                  setSuggestions((current) => current?.map((row) => ({ ...row, selected: true })) ?? null)
                }
              >
                Select all
              </button>
              <button
                type="button"
                style={styles.ghostBtn}
                onClick={() =>
                  setSuggestions((current) => current?.map((row) => ({ ...row, selected: false })) ?? null)
                }
              >
                Select none
              </button>
            </div>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <IngestSuggestionRow
                  suggestion={suggestion}
                  onPatch={(patch) => patchSuggestion(suggestion.id, patch)}
                />
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={approve} style={styles.actionBtn}>
              Approve selected
            </button>
            <button type="button" onClick={resetReview} style={styles.ghostBtn}>
              Skip
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function IngestSuggestionRow({
  suggestion,
  onPatch,
}: {
  suggestion: SchoolIngestSuggestion;
  onPatch: (patch: object) => void;
}) {
  return (
    <div
      style={{
        ...styles.dashboardSection,
        display: "grid",
        gap: 8,
        ...(suggestion.warning ? styles.statusWarning : {}),
      }}
    >
      <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="checkbox"
          checked={suggestion.selected}
          onChange={(event) => onPatch({ selected: event.target.checked })}
        />
        <strong>{suggestionLabel(suggestion)}</strong>
      </label>
      {suggestion.warning ? <p style={{ ...styles.helpText, margin: 0 }}>{suggestion.warning}</p> : null}
      {suggestion.type === "gradeCategory" ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <label style={styles.label}>
            Category
            <input
              value={suggestion.name}
              onChange={(event) => onPatch({ name: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
          <label style={styles.label}>
            Weight %
            <input
              value={String(suggestion.weightPercent)}
              onChange={(event) => onPatch({ weightPercent: Number(event.target.value) })}
              style={styles.inputFluid}
              inputMode="decimal"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={Boolean(suggestion.extraCredit)}
              onChange={(event) => onPatch({ extraCredit: event.target.checked })}
            />{" "}
            Extra credit
          </label>
        </div>
      ) : null}
      {suggestion.type === "workItem" ? (
        <WorkItemFields suggestion={suggestion} onPatch={onPatch} />
      ) : null}
      {suggestion.type === "staff" ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <label style={styles.label}>
            Role
            <select
              value={suggestion.role}
              onChange={(event) => onPatch({ role: event.target.value as typeof suggestion.role })}
              style={styles.inputFluid}
            >
              {SCHOOL_STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {SCHOOL_STAFF_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Name
            <input
              value={suggestion.name}
              onChange={(event) => onPatch({ name: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
          <label style={styles.label}>
            Email
            <input
              value={suggestion.email ?? ""}
              onChange={(event) => onPatch({ email: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
        </div>
      ) : null}
      {suggestion.type === "officeHours" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={styles.label}>
            Who
            <input
              value={suggestion.who ?? ""}
              onChange={(event) => onPatch({ who: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
          <label style={styles.label}>
            When
            <input
              value={suggestion.whenText}
              onChange={(event) => onPatch({ whenText: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
        </div>
      ) : null}
      {suggestion.type === "latePolicy" ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
            Summary
            <input
              value={suggestion.summary}
              onChange={(event) => onPatch({ summary: event.target.value })}
              style={styles.inputFluid}
            />
          </label>
          <label style={styles.label}>
            Late days
            <input
              value={suggestion.lateDaysAllowed ?? ""}
              onChange={(event) => {
                const value = event.target.value.trim();
                onPatch({ lateDaysAllowed: value ? Number(value) : undefined });
              }}
              style={styles.inputFluid}
              inputMode="numeric"
            />
          </label>
          <label style={styles.label}>
            % per day
            <input
              value={suggestion.deductionPercentPerDay ?? ""}
              onChange={(event) => {
                const value = event.target.value.trim();
                onPatch({ deductionPercentPerDay: value ? Number(value) : undefined });
              }}
              style={styles.inputFluid}
              inputMode="decimal"
            />
          </label>
        </div>
      ) : null}
      {suggestion.type === "extraCreditNotes" || suggestion.type === "scoringNotes" ? (
        <label style={styles.label}>
          Notes
          <textarea
            value={suggestion.notes}
            onChange={(event) => onPatch({ notes: event.target.value })}
            rows={2}
            style={styles.inputFluid}
          />
        </label>
      ) : null}
    </div>
  );
}

function WorkItemFields({
  suggestion,
  onPatch,
}: {
  suggestion: SchoolWorkItemSuggestion;
  onPatch: (patch: object) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <label style={styles.label}>
          Title
          <input
            value={suggestion.title}
            onChange={(event) => onPatch({ title: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          Kind
          <select
            value={suggestion.kind}
            onChange={(event) =>
              onPatch({ kind: event.target.value as SchoolWorkItemSuggestion["kind"] })
            }
            style={styles.inputFluid}
          >
            {SCHOOL_REMINDER_KINDS.map((kindOption) => (
              <option key={kindOption} value={kindOption}>
                {SCHOOL_REMINDER_KIND_LABELS[kindOption]}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          Due date
          <input
            type="date"
            value={suggestion.date ?? ""}
            onChange={(event) => onPatch({ date: event.target.value || undefined })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          Time
          <input
            type="time"
            value={suggestion.startTime ?? ""}
            onChange={(event) => onPatch({ startTime: event.target.value || undefined })}
            style={styles.inputFluid}
          />
        </label>
      </div>
      {suggestion.links.map((link, index) => (
        <div key={`${link.url}-${index}`} style={{ display: "grid", gap: 8 }}>
          <input
            value={link.url}
            placeholder="https://"
            onChange={(event) => {
              const links = [...suggestion.links];
              links[index] = { ...link, url: event.target.value };
              onPatch({ links });
            }}
            style={styles.inputFluid}
          />
          <input
            value={link.label}
            placeholder="Label"
            onChange={(event) => {
              const links = [...suggestion.links];
              links[index] = { ...link, label: event.target.value };
              onPatch({ links });
            }}
            style={styles.inputFluid}
          />
          <button
            type="button"
            style={styles.ghostBtn}
            onClick={() => onPatch({ links: suggestion.links.filter((_, itemIndex) => itemIndex !== index) })}
          >
            Remove link
          </button>
        </div>
      ))}
      <button
        type="button"
        style={styles.ghostBtn}
        onClick={() => onPatch({ links: [...suggestion.links, { url: "", label: "" }] })}
      >
        Add link
      </button>
    </div>
  );
}

function suggestionLabel(suggestion: SchoolIngestSuggestion): string {
  switch (suggestion.type) {
    case "gradeCategory":
      return `Category · ${suggestion.name} ${suggestion.weightPercent}%`;
    case "workItem":
      return `${SCHOOL_REMINDER_KIND_LABELS[suggestion.kind]} · ${suggestion.title}`;
    case "staff":
      return `${SCHOOL_STAFF_ROLE_LABELS[suggestion.role]} · ${suggestion.name}`;
    case "officeHours":
      return `Office hours${suggestion.who ? ` · ${suggestion.who}` : ""}`;
    case "latePolicy":
      return "Late policy";
    case "extraCreditNotes":
      return "Extra credit notes";
    case "scoringNotes":
      return "Scoring notes";
  }
}
