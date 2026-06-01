import type { GlobalProgression } from "../../core/progression";
import { styles } from "../../ui/appStyles";
import { formatLevel, formatXp } from "../../ui/format";
import { ProgressBar } from "./ProgressBar";

export type ProgressionHeroProps = {
  progression: GlobalProgression;
};

export function ProgressionHero({ progression }: ProgressionHeroProps) {
  const {
    level,
    totalXp,
    xpIntoLevel,
    xpToNextLevel,
    currentStreak,
    longestStreak,
    streakActiveToday,
  } = progression;

  const levelLabel = `${formatLevel(level)} · ${formatXp(totalXp)}`;
  const levelBarLabel = `Level ${level}: ${xpIntoLevel} of ${xpToNextLevel} XP to next level`;

  const streakLabel =
    currentStreak > 0
      ? `🔥 ${currentStreak} day${currentStreak === 1 ? "" : "s"}`
      : "No active streak";

  return (
    <section
      style={{ ...styles.dashboardSection, marginBottom: 12, display: "grid", gap: 12 }}
      aria-label="Progression"
    >
      <div>
        <h2 style={{ fontWeight: 800, margin: "0 0 4px 0", fontSize: 18 }}>Progression</h2>
        <p style={{ margin: 0, ...styles.textMuted, fontSize: 13 }}>
          Streak days count when you hit your daily goal, or any practice if no goal is set.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={styles.levelBadge}>{formatLevel(level)}</span>
        <span
          style={
            currentStreak > 0 ? styles.streakPill : styles.streakPillMuted
          }
          title={`Longest streak: ${longestStreak} day${longestStreak === 1 ? "" : "s"}`}
        >
          {streakLabel}
        </span>
        {!streakActiveToday && currentStreak > 0 && (
          <span style={styles.streakPillMuted}>Log today to extend</span>
        )}
      </div>

      <div style={styles.dashboardGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{formatXp(totalXp)}</div>
          <div style={styles.statLabel}>Lifetime XP</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{currentStreak}</div>
          <div style={styles.statLabel}>Global streak</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{longestStreak}</div>
          <div style={styles.statLabel}>Best streak</div>
        </div>
      </div>

      <ProgressBar
        value={xpIntoLevel}
        max={xpToNextLevel}
        label={levelBarLabel}
        variant="xp"
      />
      <p style={{ margin: 0, fontSize: 13, ...styles.textMuted }}>{levelLabel}</p>
    </section>
  );
}
