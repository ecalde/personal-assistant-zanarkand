import { styles } from "../../ui/appStyles";
import type { PersonFormState } from "./personFormState";

export type PersonFormProps = {
  editing: boolean;
  form: PersonFormState;
  formError: string | null;
  onChange: (next: PersonFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function PersonForm({
  editing,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{editing ? "Edit person" : "Add person"}</div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Name
          <input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder='e.g., "Alex"'
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Nickname (optional)
          <input
            value={form.nickname}
            onChange={(e) => onChange({ ...form, nickname: e.target.value })}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Relationship (optional)
          <input
            value={form.relationship}
            onChange={(e) => onChange({ ...form, relationship: e.target.value })}
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
              onChange={(e) => onChange({ ...form, birthdayMonth: e.target.value })}
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
              onChange={(e) => onChange({ ...form, birthdayDay: e.target.value })}
              placeholder="DD"
              style={styles.input}
            />
          </label>
        </div>

        <label style={styles.label}>
          Likes (optional)
          <textarea
            value={form.likes}
            onChange={(e) => onChange({ ...form, likes: e.target.value })}
            rows={2}
            style={{ ...styles.input, resize: "vertical" }}
          />
        </label>

        <label style={styles.label}>
          Dislikes (optional)
          <textarea
            value={form.dislikes}
            onChange={(e) => onChange({ ...form, dislikes: e.target.value })}
            rows={2}
            style={{ ...styles.input, resize: "vertical" }}
          />
        </label>

        <label style={styles.label}>
          Gift ideas (optional)
          <textarea
            value={form.giftIdeas}
            onChange={(e) => onChange({ ...form, giftIdeas: e.target.value })}
            rows={2}
            style={{ ...styles.input, resize: "vertical" }}
          />
        </label>

        <label style={styles.label}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
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
              onChange={(e) => onChange({ ...form, lastContactDate: e.target.value })}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Contact cadence (days, optional)
            <input
              type="number"
              min={1}
              value={form.contactCadenceDays}
              onChange={(e) => onChange({ ...form, contactCadenceDays: e.target.value })}
              placeholder="e.g., 14"
              style={styles.input}
            />
          </label>
        </div>

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit}>
            {editing ? "Save changes" : "Add person"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
