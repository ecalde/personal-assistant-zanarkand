import {
  APPLICATION_STATUS_LABELS,
  REMOTE_POLICY_LABELS,
  getApplicationStatuses,
} from "../../core/career";
import type { RemotePolicy, Skill } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { SkillRequirementPicker } from "./SkillRequirementPicker";
import { ApplicationInterviewsSection } from "./ApplicationInterviewsSection";
import type { ApplicationFormState } from "./applicationFormState";
import { isInterviewStageStatus } from "../../core/career";

export type ApplicationFormProps = {
  form: ApplicationFormState;
  skills: Skill[];
  formError: string | null;
  editing: boolean;
  onChange: (form: ApplicationFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ApplicationForm({
  form,
  skills,
  formError,
  editing,
  onChange,
  onSubmit,
  onCancel,
}: ApplicationFormProps) {
  function patch(partial: Partial<ApplicationFormState>) {
    onChange({ ...form, ...partial });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ ...styles.dashboardSection, display: "grid", gap: 12 }}
    >
      <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>
        {editing ? "Edit application" : "Add application"}
      </h2>

      {formError && (
        <div style={styles.errorBox} role="alert">
          {formError}
        </div>
      )}

      <label style={{ display: "grid", gap: 4 }}>
        <span>Company *</span>
        <input
          value={form.company}
          onChange={(e) => patch({ company: e.target.value })}
          required
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Role title *</span>
        <input
          value={form.roleTitle}
          onChange={(e) => patch({ roleTitle: e.target.value })}
          required
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Status</span>
        <select
          value={form.status}
          onChange={(e) => patch({ status: e.target.value as ApplicationFormState["status"] })}
        >
          {getApplicationStatuses().map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        }}
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span>Salary min (USD)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.salaryMin}
            onChange={(e) => patch({ salaryMin: e.target.value })}
            placeholder="120000"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Salary max (USD)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.salaryMax}
            onChange={(e) => patch({ salaryMax: e.target.value })}
            placeholder="160000"
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Location</span>
        <input
          value={form.location}
          onChange={(e) => patch({ location: e.target.value })}
          placeholder="San Francisco, CA"
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Remote policy</span>
        <select
          value={form.remotePolicy}
          onChange={(e) =>
            patch({ remotePolicy: e.target.value as RemotePolicy | "" })
          }
        >
          <option value="">Not specified</option>
          {(Object.keys(REMOTE_POLICY_LABELS) as RemotePolicy[]).map((policy) => (
            <option key={policy} value={policy}>
              {REMOTE_POLICY_LABELS[policy]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Date applied</span>
        <input
          type="date"
          value={form.appliedDate}
          onChange={(e) => patch({ appliedDate: e.target.value })}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Posting URL</span>
        <input
          type="url"
          value={form.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="https://…"
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>Notes</span>
        <textarea
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
        />
      </label>

      <SkillRequirementPicker
        skills={skills}
        selectedSkillIds={form.requiredSkillIds}
        requiredSkillsText={form.requiredSkillsText}
        onSelectedSkillIdsChange={(requiredSkillIds) => patch({ requiredSkillIds })}
        onRequiredSkillsTextChange={(requiredSkillsText) => patch({ requiredSkillsText })}
        idPrefix="application"
      />

      <ApplicationInterviewsSection
        application={{
          id: "draft",
          company: form.company,
          roleTitle: form.roleTitle,
          status: form.status,
          requiredSkillIds: form.requiredSkillIds,
          interviews: [],
          createdAtIso: "",
          updatedAtIso: "",
        }}
        interviews={form.interviews}
        onChange={(interviews) => patch({ interviews })}
        showPrompt={isInterviewStageStatus(form.status)}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="submit">{editing ? "Save changes" : "Add application"}</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
