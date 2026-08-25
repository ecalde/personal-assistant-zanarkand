import { styles } from "../../ui/appStyles";
import {
  SCHOOL_REMINDER_KIND_LABELS,
  SCHOOL_REMINDER_KINDS,
} from "../../core/school";
import type { SchoolReminderFormState } from "./schoolReminderFormState";
import { emptyLinkFormRow } from "./schoolReminderFormState";

export type SchoolReminderFormProps = {
  form: SchoolReminderFormState;
  formError: string | null;
  editing: boolean;
  dueCaption?: string;
  onChange: (form: SchoolReminderFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function SchoolReminderForm({
  form,
  formError,
  editing,
  dueCaption,
  onChange,
  onSubmit,
  onCancel,
}: SchoolReminderFormProps) {
  function patch(partial: Partial<SchoolReminderFormState>) {
    onChange({ ...form, ...partial });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: "grid", gap: 8 }}
    >
      <h3 style={{ fontWeight: 800, margin: 0, fontSize: 13 }}>
        {editing ? "Edit reminder" : "Add reminder"}
      </h3>
      {formError ? (
        <div style={styles.errorBox} role="alert">
          {formError}
        </div>
      ) : null}

      <label style={styles.label}>
        Kind
        <select
          value={form.kind}
          onChange={(event) =>
            patch({ kind: event.target.value as SchoolReminderFormState["kind"] })
          }
          style={styles.input}
        >
          {SCHOOL_REMINDER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SCHOOL_REMINDER_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.label}>
        Title *
        <input
          value={form.title}
          onChange={(event) => patch({ title: event.target.value })}
          style={styles.input}
          required
        />
      </label>
      <label style={styles.label}>
        Due date *
        <input
          type="date"
          value={form.date}
          onChange={(event) => patch({ date: event.target.value })}
          style={styles.input}
          required
        />
      </label>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}
      >
        <label style={styles.label}>
          Start time
          <input
            type="time"
            value={form.startTime}
            onChange={(event) => patch({ startTime: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          End time
          <input
            type="time"
            value={form.endTime}
            onChange={(event) => patch({ endTime: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
      </div>
      {dueCaption ? <p style={{ ...styles.helpText, margin: 0 }}>{dueCaption}</p> : null}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}
      >
        <label style={styles.label}>
          Opens date
          <input
            type="date"
            value={form.openDate}
            onChange={(event) => patch({ openDate: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          Opens time
          <input
            type="time"
            value={form.openTime}
            onChange={(event) => patch({ openTime: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          Closes date
          <input
            type="date"
            value={form.closeDate}
            onChange={(event) => patch({ closeDate: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
        <label style={styles.label}>
          Closes time
          <input
            type="time"
            value={form.closeTime}
            onChange={(event) => patch({ closeTime: event.target.value })}
            style={styles.inputFluid}
          />
        </label>
      </div>

      <label style={styles.label}>
        Notes
        <textarea
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={2}
        />
      </label>

      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Links</legend>
        {form.links.map((row, index) => (
          <div key={row.id} style={{ display: "grid", gap: 8 }}>
            <input
              value={row.url}
              placeholder="https://"
              onChange={(event) => {
                const links = [...form.links];
                links[index] = { ...row, url: event.target.value };
                patch({ links });
              }}
              style={styles.inputFluid}
            />
            <input
              value={row.label}
              placeholder="Label (optional)"
              onChange={(event) => {
                const links = [...form.links];
                links[index] = { ...row, label: event.target.value };
                patch({ links });
              }}
              style={styles.inputFluid}
            />
            <button
              type="button"
              onClick={() => patch({ links: form.links.filter((item) => item.id !== row.id) })}
            >
              Remove link
            </button>
          </div>
        ))}
        <button type="button" onClick={() => patch({ links: [...form.links, emptyLinkFormRow()] })}>
          Add link
        </button>
      </fieldset>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit">{editing ? "Save reminder" : "Add reminder"}</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
