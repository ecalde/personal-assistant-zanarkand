import type { QuestInstance } from "../../core/progressionModel";
import { styles } from "../../ui/appStyles";
import { ProgressBar } from "./ProgressBar";

export type ActiveQuestsCardProps = {
  daily: QuestInstance[];
  weekly: QuestInstance[];
  maxItems?: number;
};

function QuestRow({ quest }: { quest: QuestInstance }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
        <span style={{ fontWeight: 700 }}>
          {quest.completed ? "✓ " : ""}
          {quest.definition.title}
        </span>
        <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>+{quest.definition.rewardXp} XP</span>
      </div>
      <ProgressBar
        value={quest.progress.current}
        max={quest.progress.target}
        variant={quest.completed ? "default" : "xp"}
      />
    </div>
  );
}

export function ActiveQuestsCard({ daily, weekly, maxItems = 4 }: ActiveQuestsCardProps) {
  // Show incomplete first, then completed; daily before weekly.
  const ordered = [...daily, ...weekly].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });
  const visible = ordered.slice(0, maxItems);
  if (visible.length === 0) return null;

  const completedCount = [...daily, ...weekly].filter((q) => q.completed).length;
  const totalCount = daily.length + weekly.length;

  return (
    <section style={{ ...styles.dashboardSection, display: "grid", gap: 10 }} aria-label="Active quests">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Quests</h3>
        <span style={styles.statLabel}>
          {completedCount}/{totalCount} done
        </span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {visible.map((quest) => (
          <QuestRow key={quest.instanceId} quest={quest} />
        ))}
      </div>
    </section>
  );
}
