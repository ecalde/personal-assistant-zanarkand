import {
  SUPPLEMENT_FORM_LABELS,
  SUPPLEMENT_FORM_VALUES,
  SUPPLEMENT_UNIT_LABELS,
  SUPPLEMENT_UNIT_VALUES,
} from "../../core/supplements";
import { styles } from "../../ui/appStyles";
import type { SupplementProtocolFormState } from "./supplementProtocolFormState";

export type SupplementProtocolFormProps = {
  editing: boolean;
  form: SupplementProtocolFormState;
  formError: string | null;
  onChange: (next: SupplementProtocolFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function SupplementProtocolForm({
  editing,
  form,
  formError,
  onChange,
  onSubmit,
  onCancel,
}: SupplementProtocolFormProps) {
  function patch(partial: Partial<SupplementProtocolFormState>) {
    onChange({ ...form, ...partial });
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>
        {editing ? "Edit supplement protocol" : "Add supplement protocol"}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={styles.label}>
          Name
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder='e.g., "Creatine"'
            style={styles.input}
          />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ ...styles.label, minWidth: 120, flex: "1 1 140px" }}>
            Unit
            <select
              value={form.unit}
              onChange={(e) =>
                patch({ unit: e.target.value as SupplementProtocolFormState["unit"] })
              }
              style={styles.input}
            >
              {SUPPLEMENT_UNIT_VALUES.map((unit) => (
                <option key={unit} value={unit}>
                  {SUPPLEMENT_UNIT_LABELS[unit]}
                </option>
              ))}
            </select>
          </label>

          <label style={{ ...styles.label, minWidth: 140, flex: "1 1 160px" }}>
            Form (optional)
            <select
              value={form.form}
              onChange={(e) =>
                patch({ form: e.target.value as SupplementProtocolFormState["form"] })
              }
              style={styles.input}
            >
              <option value="">None</option>
              {SUPPLEMENT_FORM_VALUES.map((value) => (
                <option key={value} value={value}>
                  {SUPPLEMENT_FORM_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={styles.label}>
          Start date
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
            style={styles.input}
          />
        </label>

        <fieldset
          style={{
            margin: 0,
            padding: 0,
            border: "none",
            display: "grid",
            gap: 12,
          }}
        >
          <legend style={{ ...styles.textSecondary, fontWeight: 700, padding: 0 }}>
            Maintenance
          </legend>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ ...styles.label, minWidth: 120, flex: "1 1 140px" }}>
              Amount per dose
              <input
                value={form.maintenanceAmount}
                onChange={(e) => patch({ maintenanceAmount: e.target.value })}
                inputMode="decimal"
                placeholder="5"
                style={styles.input}
              />
            </label>
            <label style={{ ...styles.label, minWidth: 140, flex: "1 1 160px" }}>
              Doses per day
              <input
                value={form.maintenanceDosesPerDay}
                onChange={(e) => patch({ maintenanceDosesPerDay: e.target.value })}
                inputMode="numeric"
                placeholder="1"
                style={styles.input}
              />
            </label>
          </div>
        </fieldset>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.includeLoading}
            onChange={(e) => {
              const includeLoading = e.target.checked;
              patch({
                includeLoading,
                loadingAmount:
                  includeLoading && !form.loadingAmount.trim()
                    ? form.maintenanceAmount
                    : form.loadingAmount,
              });
            }}
          />
          Include a loading phase
        </label>

        {form.includeLoading && (
          <fieldset
            style={{
              margin: 0,
              padding: 0,
              border: "none",
              display: "grid",
              gap: 12,
            }}
          >
            <legend style={{ ...styles.textSecondary, fontWeight: 700, padding: 0 }}>
              Loading
            </legend>
            <div style={{ ...styles.helpText }}>
              Maintenance starts the day after loading ends. Example: 7 days at 5 g × 4,
              then 5 g × 1.
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ ...styles.label, minWidth: 120, flex: "1 1 120px" }}>
                Duration (days)
                <input
                  value={form.loadingDurationDays}
                  onChange={(e) => patch({ loadingDurationDays: e.target.value })}
                  inputMode="numeric"
                  placeholder="7"
                  style={styles.input}
                />
              </label>
              <label style={{ ...styles.label, minWidth: 120, flex: "1 1 140px" }}>
                Amount per dose
                <input
                  value={form.loadingAmount}
                  onChange={(e) => patch({ loadingAmount: e.target.value })}
                  inputMode="decimal"
                  placeholder="5"
                  style={styles.input}
                />
              </label>
              <label style={{ ...styles.label, minWidth: 140, flex: "1 1 160px" }}>
                Doses per day
                <input
                  value={form.loadingDosesPerDay}
                  onChange={(e) => patch({ loadingDosesPerDay: e.target.value })}
                  inputMode="numeric"
                  placeholder="4"
                  style={styles.input}
                />
              </label>
            </div>
          </fieldset>
        )}

        <label style={styles.label}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            style={styles.input}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => patch({ active: e.target.checked })}
          />
          Active
        </label>

        {formError && <div style={styles.errorInline}>{formError}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSubmit}>
            {editing ? "Save protocol" : "Add protocol"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
