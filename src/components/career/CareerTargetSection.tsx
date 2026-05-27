import { useState } from "react";
import type { CareerTarget, Skill } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { SkillRequirementPicker } from "./SkillRequirementPicker";
import {
  careerTargetFormFromTarget,
  careerTargetPayloadFromForm,
  emptyCareerTargetFormState,
  validateCareerTargetForm,
  type CareerTargetFormState,
} from "./careerTargetFormState";

export type CareerTargetSectionProps = {
  careerTarget: CareerTarget | undefined;
  skills: Skill[];
  onSet: (input: Omit<CareerTarget, "id" | "updatedAtIso">) => void;
  onClear: () => void;
};

export function CareerTargetSection({
  careerTarget,
  skills,
  onSet,
  onClear,
}: CareerTargetSectionProps) {
  const [editing, setEditing] = useState(!careerTarget);
  const [form, setForm] = useState<CareerTargetFormState>(
    careerTarget ? careerTargetFormFromTarget(careerTarget) : emptyCareerTargetFormState()
  );
  const [formError, setFormError] = useState<string | null>(null);

  function startEdit() {
    setForm(careerTarget ? careerTargetFormFromTarget(careerTarget) : emptyCareerTargetFormState());
    setFormError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setFormError(null);
    setForm(careerTarget ? careerTargetFormFromTarget(careerTarget) : emptyCareerTargetFormState());
    setEditing(!careerTarget);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validateCareerTargetForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    onSet(careerTargetPayloadFromForm(form));
    setFormError(null);
    setEditing(false);
  }

  return (
    <section style={styles.dashboardSection} aria-label="Dream job target">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h2 style={{ fontWeight: 800, margin: 0, fontSize: 16 }}>Dream job target</h2>
        {!editing && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={startEdit}>
              {careerTarget ? "Edit target" : "Set target"}
            </button>
            {careerTarget && (
              <button type="button" onClick={onClear}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {!careerTarget && !editing && (
        <p style={{ margin: 0, opacity: 0.8 }}>
          Set a dream job target to see which skills to focus on.
        </p>
      )}

      {!editing && careerTarget && (
        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <strong>{careerTarget.roleTitle}</strong>
            {careerTarget.company && (
              <span style={{ opacity: 0.85 }}> at {careerTarget.company}</span>
            )}
          </div>
          {careerTarget.notes && (
            <p style={{ margin: 0, opacity: 0.85, whiteSpace: "pre-wrap" }}>{careerTarget.notes}</p>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {formError && (
            <div style={styles.errorBox} role="alert">
              {formError}
            </div>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span>Dream role *</span>
            <input
              value={form.roleTitle}
              onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
              placeholder="Staff Software Engineer"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Target company</span>
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="Optional"
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
            />
          </label>

          <SkillRequirementPicker
            skills={skills}
            selectedSkillIds={form.requiredSkillIds}
            requiredSkillsText={form.requiredSkillsText}
            onSelectedSkillIdsChange={(requiredSkillIds) =>
              setForm({ ...form, requiredSkillIds })
            }
            onRequiredSkillsTextChange={(requiredSkillsText) =>
              setForm({ ...form, requiredSkillsText })
            }
            idPrefix="target"
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="submit">Save target</button>
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
