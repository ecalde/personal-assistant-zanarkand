import type { Skill } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type SkillRequirementPickerProps = {
  skills: Skill[];
  selectedSkillIds: string[];
  requiredSkillsText: string;
  onSelectedSkillIdsChange: (ids: string[]) => void;
  onRequiredSkillsTextChange: (text: string) => void;
  idPrefix: string;
};

export function SkillRequirementPicker({
  skills,
  selectedSkillIds,
  requiredSkillsText,
  onSelectedSkillIdsChange,
  onRequiredSkillsTextChange,
  idPrefix,
}: SkillRequirementPickerProps) {
  function toggleSkill(skillId: string) {
    if (selectedSkillIds.includes(skillId)) {
      onSelectedSkillIdsChange(selectedSkillIds.filter((id) => id !== skillId));
      return;
    }
    onSelectedSkillIdsChange([...selectedSkillIds, skillId]);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Required skills (from tracker)</div>
        {skills.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
            No skills in your tracker yet. Add skills on the Skills page, or list requirements below.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {skills.map((skill) => {
              const checked = selectedSkillIds.includes(skill.id);
              const checkboxId = `${idPrefix}-skill-${skill.id}`;
              return (
                <label
                  key={skill.id}
                  htmlFor={checkboxId}
                  style={{
                    ...styles.statusPill,
                    ...(checked ? styles.statusIdle : {}),
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSkill(skill.id)}
                  />
                  {skill.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 700 }}>Additional requirements (free text)</span>
        <textarea
          value={requiredSkillsText}
          onChange={(e) => onRequiredSkillsTextChange(e.target.value)}
          rows={3}
          placeholder="e.g. Kubernetes, system design, distributed systems"
          style={{ width: "100%", resize: "vertical" }}
        />
      </label>
    </div>
  );
}
