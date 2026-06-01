import { buildSkillGapPriorityList } from "../../core/career";
import type { CareerTarget, Skill } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type SkillGapPanelProps = {
  skills: Skill[];
  careerTarget: CareerTarget | undefined;
};

export function SkillGapPanel({ skills, careerTarget }: SkillGapPanelProps) {
  if (!careerTarget) return null;

  const priorityItems = buildSkillGapPriorityList(skills, careerTarget);

  if (priorityItems.length === 0) {
    return (
      <section style={styles.dashboardSection} aria-label="Skill gap summary">
        <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Skill focus</h2>
        <p style={{ margin: 0, ...styles.textMuted }}>
          Add required skills to your dream job target to see what to focus on.
        </p>
      </section>
    );
  }

  return (
    <section style={styles.dashboardSection} aria-label="Skill gap summary">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Skill focus</h2>
      <p style={{ margin: "0 0 12px 0", ...styles.textMuted }}>
        Priority skills for your dream role — tracked skills first, then additional requirements.
      </p>

      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
        {priorityItems.map((item, index) => (
          <li key={item.kind === "linked" ? item.skillId : `${item.label}-${index}`}>
            {item.kind === "linked" ? (
              <span>
                <strong>{item.skillName}</strong>
                {item.skillPriority !== undefined && (
                  <span style={{ ...styles.textMuted, fontSize: 13 }}> · priority {item.skillPriority}</span>
                )}
              </span>
            ) : (
              <span>
                {item.label}
                <span style={{ ...styles.textMuted, fontSize: 13 }}> · not yet in tracker</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
