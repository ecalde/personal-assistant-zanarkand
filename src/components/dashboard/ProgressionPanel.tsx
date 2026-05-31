import type {
  LevelState,
  MilestoneHighlight,
  ProgressionAxis,
  StreakState,
} from "../../core/progressionModel";
import { globalLevelTitle } from "../../core/milestoneTables";
import { styles } from "../../ui/appStyles";
import { formatLevel, formatXp } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";
import { ProgressionAxisRow } from "./ProgressionAxisRow";

export type ProgressionPanelProps = {
  global: LevelState & { streak: StreakState };
  axes: Record<ProgressionAxis, LevelState>;
  xpToday: number;
  milestones: MilestoneHighlight[];
  /** `compact` stacks stats vertically for the desktop left rail; `wide` is the full-width mobile layout. */
  layout?: "wide" | "compact";
};

export function ProgressionPanel({
  global,
  axes,
  xpToday,
  milestones,
  layout = "wide",
}: ProgressionPanelProps) {
  const isCompact = layout === "compact";
  const { level, totalXp, xpIntoLevel, xpToNextLevel, streak } = global;
  const title = globalLevelTitle(level);

  const streakLabel =
    streak.current > 0
      ? `🔥 ${streak.current} day${streak.current === 1 ? "" : "s"}`
      : "No active streak";

  const nextMilestone = milestones.find((m) => !m.reached);

  return (
    <section
      style={{
        ...styles.dashboardSection,
        marginBottom: isCompact ? 0 : 12,
        display: "grid",
        gap: 12,
      }}
      aria-label="Progression"
    >
      <div
        style={{
          display: "flex",
          justifyContent: isCompact ? "flex-start" : "space-between",
          alignItems: isCompact ? "flex-start" : "baseline",
          flexDirection: isCompact ? "column" : "row",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontWeight: 800, margin: "0 0 4px 0", fontSize: 18 }}>Progression</h2>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>{title}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={styles.levelBadge}>{formatLevel(level)}</span>
          <span
            style={streak.current > 0 ? styles.streakPill : styles.streakPillMuted}
            title={`Longest streak: ${streak.longest} day${streak.longest === 1 ? "" : "s"}`}
          >
            {streakLabel}
          </span>
          {!streak.activeToday && streak.current > 0 && (
            <span style={styles.streakPillMuted}>Log today to extend</span>
          )}
        </div>
      </div>

      <div style={isCompact ? styles.dashboardRailStatGrid : styles.dashboardGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatXp(totalXp)}</div>
          <div style={styles.statLabel}>Total XP</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>+{xpToday.toLocaleString()}</div>
          <div style={styles.statLabel}>XP today</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{streak.current}</div>
          <div style={styles.statLabel}>Global streak</div>
        </div>
      </div>

      <ProgressBar
        value={xpIntoLevel}
        max={xpToNextLevel}
        label={`Level ${level}: ${xpIntoLevel} of ${xpToNextLevel} XP to next level`}
        variant="xp"
      />

      <ProgressionAxisRow axes={axes} layout={isCompact ? "compact" : "wide"} />

      {nextMilestone && (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Next milestone: {nextMilestone.label} ({nextMilestone.current.toLocaleString()} /{" "}
          {nextMilestone.target.toLocaleString()})
        </p>
      )}
    </section>
  );
}
