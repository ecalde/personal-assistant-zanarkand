import { useMemo } from "react";
import type { SkillDayRow } from "../../core/dashboardStats";
import type { SkillProgression } from "../../core/progression";
import type { Priority } from "../../core/model";
import { styles } from "../../ui/appStyles";
import { SkillProgressRow } from "./SkillProgressRow";

export type SkillProgressSectionProps = {
  rows: SkillDayRow[];
  progressionsBySkillId?: Record<string, SkillProgression>;
};

function sortRows(rows: SkillDayRow[]): SkillDayRow[] {
  const pr = (p?: Priority) => (p ?? 999);
  return [...rows].sort((a, b) => {
    const ap = pr(a.skill.priority);
    const bp = pr(b.skill.priority);
    if (ap !== bp) return ap - bp;
    return a.skill.name.localeCompare(b.skill.name);
  });
}

export function SkillProgressSection({ rows, progressionsBySkillId }: SkillProgressSectionProps) {
  const sortedRows = useMemo(() => sortRows(rows), [rows]);

  return (
    <section style={styles.dashboardSection} aria-label="All skills today">
      <h2 style={{ fontWeight: 800, margin: "0 0 6px 0", fontSize: 16 }}>All skills today</h2>

      {sortedRows.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.8 }}>No skills to show.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {sortedRows.map((row) => (
            <SkillProgressRow
              key={row.skill.id}
              row={row}
              progression={progressionsBySkillId?.[row.skill.id]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
