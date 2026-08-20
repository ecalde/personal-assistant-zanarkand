import type { CSSProperties } from "react";
import { styles } from "../../ui/appStyles";
import type { PersonFormState } from "./personFormState";

export type PersonFormProps = {
  editing: boolean;
  embedded?: boolean;
  form: PersonFormState;
  formError: string | null;
  onChange: (next: PersonFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const fieldLabel: CSSProperties = { ...styles.label, minWidth: 0 };
const fieldInput: CSSProperties = { ...styles.inputCompact };
const fieldTextarea: CSSProperties = { ...styles.inputCompact, resize: "vertical", minHeight: 72 };

export function PersonForm({
  editing,
  embedded = false,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  const heading = editing ? "Edit person" : "Add person";

  const fields = (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={styles.personFormGrid}>
        <label style={fieldLabel}>
          Name
          <input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder='e.g., "Alex"'
            style={fieldInput}
          />
        </label>

        <label style={fieldLabel}>
          Nickname (optional)
          <input
            value={form.nickname}
            onChange={(e) => onChange({ ...form, nickname: e.target.value })}
            style={fieldInput}
          />
        </label>

        <label style={fieldLabel}>
          Relationship (optional)
          <input
            value={form.relationship}
            onChange={(e) => onChange({ ...form, relationship: e.target.value })}
            placeholder='e.g., "friend", "family"'
            style={fieldInput}
          />
        </label>
      </div>

      <div style={styles.personFormGrid}>
        <label style={fieldLabel}>
          Birthday month
          <input
            type="number"
            min={1}
            max={12}
            value={form.birthdayMonth}
            onChange={(e) => onChange({ ...form, birthdayMonth: e.target.value })}
            placeholder="MM"
            style={fieldInput}
          />
        </label>
        <label style={fieldLabel}>
          Birthday day
          <input
            type="number"
            min={1}
            max={31}
            value={form.birthdayDay}
            onChange={(e) => onChange({ ...form, birthdayDay: e.target.value })}
            placeholder="DD"
            style={fieldInput}
          />
        </label>
        <label style={fieldLabel}>
          Last contact date (optional)
          <input
            type="date"
            value={form.lastContactDate}
            onChange={(e) => onChange({ ...form, lastContactDate: e.target.value })}
            style={fieldInput}
          />
        </label>
        <label style={fieldLabel}>
          Contact cadence (days, optional)
          <input
            type="number"
            min={1}
            value={form.contactCadenceDays}
            onChange={(e) => onChange({ ...form, contactCadenceDays: e.target.value })}
            placeholder="e.g., 14"
            style={fieldInput}
          />
        </label>
      </div>

      <div style={styles.personFormTextGrid}>
        <label style={fieldLabel}>
          Likes (optional)
          <textarea
            value={form.likes}
            onChange={(e) => onChange({ ...form, likes: e.target.value })}
            rows={3}
            style={fieldTextarea}
          />
        </label>
        <label style={fieldLabel}>
          Dislikes (optional)
          <textarea
            value={form.dislikes}
            onChange={(e) => onChange({ ...form, dislikes: e.target.value })}
            rows={3}
            style={fieldTextarea}
          />
        </label>
        <label style={fieldLabel}>
          Gift ideas (optional)
          <textarea
            value={form.giftIdeas}
            onChange={(e) => onChange({ ...form, giftIdeas: e.target.value })}
            rows={3}
            style={fieldTextarea}
          />
        </label>
        <label style={fieldLabel}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            rows={3}
            style={fieldTextarea}
          />
        </label>
      </div>

      {formError && <div style={styles.errorInline}>{formError}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onSubmit} style={styles.actionBtn}>
          {editing ? "Save changes" : "Add person"}
        </button>
        <button type="button" onClick={onCancel} style={styles.ghostBtn}>
          Cancel
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{heading}</div>
        {fields}
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{heading}</div>
      {fields}
    </div>
  );
}
