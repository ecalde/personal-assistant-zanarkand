import { buildDreamJobSkillGap } from "../../core/career";
import type { CareerTarget, Skill } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type SkillGapPanelProps = {
  skills: Skill[];
  careerTarget: CareerTarget | undefined;
};

export function SkillGapPanel({ skills, careerTarget }: SkillGapPanelProps) {
  const gap = buildDreamJobSkillGap(skills, careerTarget);
  if (!gap) return null;

  const hasContent =
    gap.linkedRequirements.length > 0 ||
    gap.missingSkillIds.length > 0 ||
    Boolean(gap.unlinkedText);

  if (!hasContent) {
    return (
      <section style={styles.dashboardSection} aria-label="Skill gap summary">
        <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Skill focus</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Add required skills to your dream job target to see what to focus on.
        </p>
      </section>
    );
  }

  return (
    <section style={styles.dashboardSection} aria-label="Skill gap summary">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>Skill focus</h2>
      <p style={{ margin: "0 0 12px 0", opacity: 0.8 }}>
        Skills linked to your dream job target and additional requirements.
      </p>

      {gap.linkedRequirements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Tracked skills</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {gap.linkedRequirements.map((req) => (
              <span key={req.skillId} style={{ ...styles.statusPill, ...styles.statusIdle }}>
                {req.skillName}
              </span>
            ))}
          </div>
        </div>
      )}

      {gap.missingSkillIds.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Missing skill links</div>
          <p style={{ margin: 0, opacity: 0.85, fontSize: 13 }}>
            {gap.missingSkillIds.length} linked skill
            {gap.missingSkillIds.length === 1 ? "" : "s"} no longer in your tracker. Edit the
            target to update.
          </p>
        </div>
      )}

      {gap.unlinkedText && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>Not yet in tracker</div>
          <p style={{ margin: 0, opacity: 0.85, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {gap.unlinkedText}
          </p>
        </div>
      )}
    </section>
  );
}
