import { styles } from "../../ui/appStyles";
import { SCHOOL_STAFF_ROLE_LABELS, SCHOOL_STAFF_ROLES } from "../../core/school";
import type { SchoolCourseFormState } from "./schoolCourseFormState";
import { emptyOfficeHoursFormRow, emptyStaffFormRow } from "./schoolCourseFormState";
import { SchoolGradeCategoriesFields } from "./SchoolGradeCategoriesFields";

const TIMEZONE_SUGGESTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "UTC",
  "Europe/London",
];

export type SchoolCourseFormProps = {
  form: SchoolCourseFormState;
  formError: string | null;
  editing: boolean;
  onChange: (form: SchoolCourseFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function SchoolCourseForm({
  form,
  formError,
  editing,
  onChange,
  onSubmit,
  onCancel,
}: SchoolCourseFormProps) {
  function patch(partial: Partial<SchoolCourseFormState>) {
    onChange({ ...form, ...partial });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ ...styles.dashboardSection, display: "grid", gap: 12 }}
    >
      <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>
        {editing ? "Edit course" : "Add course"}
      </h2>
      {formError ? (
        <div style={styles.errorBox} role="alert">
          {formError}
        </div>
      ) : null}

      <label style={styles.label}>
        Name *
        <input
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
          style={styles.input}
          required
        />
      </label>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <label style={styles.label}>
          Code
          <input
            value={form.code}
            onChange={(event) => patch({ code: event.target.value })}
            style={styles.input}
            placeholder="CS 1332"
          />
        </label>
        <label style={styles.label}>
          Term
          <input
            value={form.term}
            onChange={(event) => patch({ term: event.target.value })}
            style={styles.input}
            placeholder="Fall 2026"
          />
        </label>
      </div>
      <label style={styles.label}>
        Timezone
        <input
          value={form.timezone}
          onChange={(event) => patch({ timezone: event.target.value })}
          style={styles.input}
          list="school-timezone-suggestions"
        />
        <datalist id="school-timezone-suggestions">
          {TIMEZONE_SUGGESTIONS.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </label>
      <label style={styles.label}>
        Notes
        <textarea
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={2}
        />
      </label>

      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Staff</legend>
        {form.staff.map((row, index) => (
          <div key={row.id} style={{ display: "grid", gap: 8 }}>
            <select
              value={row.role}
              onChange={(event) => {
                const staff = [...form.staff];
                staff[index] = { ...row, role: event.target.value as typeof row.role };
                patch({ staff });
              }}
              style={styles.input}
            >
              {SCHOOL_STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {SCHOOL_STAFF_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <input
              value={row.name}
              placeholder="Name"
              onChange={(event) => {
                const staff = [...form.staff];
                staff[index] = { ...row, name: event.target.value };
                patch({ staff });
              }}
              style={styles.input}
            />
            <input
              value={row.email}
              placeholder="Email"
              onChange={(event) => {
                const staff = [...form.staff];
                staff[index] = { ...row, email: event.target.value };
                patch({ staff });
              }}
              style={styles.input}
            />
            <button
              type="button"
              onClick={() => patch({ staff: form.staff.filter((item) => item.id !== row.id) })}
            >
              Remove staff
            </button>
          </div>
        ))}
        <button type="button" onClick={() => patch({ staff: [...form.staff, emptyStaffFormRow()] })}>
          Add staff
        </button>
      </fieldset>

      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Office hours</legend>
        {form.officeHours.map((row, index) => (
          <div key={row.id} style={{ display: "grid", gap: 8 }}>
            <input
              value={row.who}
              placeholder="Who"
              onChange={(event) => {
                const officeHours = [...form.officeHours];
                officeHours[index] = { ...row, who: event.target.value };
                patch({ officeHours });
              }}
              style={styles.input}
            />
            <input
              value={row.whenText}
              placeholder="When (e.g. Tue 2–4pm ET)"
              onChange={(event) => {
                const officeHours = [...form.officeHours];
                officeHours[index] = { ...row, whenText: event.target.value };
                patch({ officeHours });
              }}
              style={styles.input}
            />
            <input
              value={row.locationOrLink}
              placeholder="Location or link"
              onChange={(event) => {
                const officeHours = [...form.officeHours];
                officeHours[index] = { ...row, locationOrLink: event.target.value };
                patch({ officeHours });
              }}
              style={styles.input}
            />
            <button
              type="button"
              onClick={() =>
                patch({ officeHours: form.officeHours.filter((item) => item.id !== row.id) })
              }
            >
              Remove office hours
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({ officeHours: [...form.officeHours, emptyOfficeHoursFormRow()] })
          }
        >
          Add office hours
        </button>
      </fieldset>

      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Late policy</legend>
        <input
          value={form.lateSummary}
          placeholder="Summary"
          onChange={(event) => patch({ lateSummary: event.target.value })}
          style={styles.input}
        />
        <input
          value={form.lateDaysAllowed}
          placeholder="Late days allowed"
          onChange={(event) => patch({ lateDaysAllowed: event.target.value })}
          style={styles.input}
        />
        <input
          value={form.deductionPercentPerDay}
          placeholder="Deduction % per day"
          onChange={(event) => patch({ deductionPercentPerDay: event.target.value })}
          style={styles.input}
        />
        <textarea
          value={form.lateNotes}
          placeholder="Notes"
          onChange={(event) => patch({ lateNotes: event.target.value })}
          rows={2}
        />
      </fieldset>

      <label style={styles.label}>
        Extra credit notes
        <textarea
          value={form.extraCreditNotes}
          onChange={(event) => patch({ extraCreditNotes: event.target.value })}
          rows={2}
        />
      </label>
      <label style={styles.label}>
        Scoring notes
        <textarea
          value={form.scoringNotes}
          onChange={(event) => patch({ scoringNotes: event.target.value })}
          rows={2}
        />
      </label>

      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 700 }}>Grade categories</legend>
        <SchoolGradeCategoriesFields
          rows={form.gradeCategories}
          onChange={(gradeCategories) => patch({ gradeCategories })}
        />
      </fieldset>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit">{editing ? "Save course" : "Add course"}</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
