import type { AchievementUnlock, AchievementTier } from "../../core/progressionModel";
import { getAchievementById } from "../../core/achievementCatalog";
import { styles } from "../../ui/appStyles";

export type AchievementShowcaseProps = {
  unlocked: AchievementUnlock[];
  newlyUnlocked: AchievementUnlock[];
  inProgress: AchievementUnlock[];
  onDismissAchievement?: (definitionId: string) => void;
  maxUnlocked?: number;
  maxInProgress?: number;
};

const TIER_EMOJI: Record<AchievementTier, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "🏆",
};

export function AchievementShowcase({
  unlocked,
  newlyUnlocked,
  inProgress,
  onDismissAchievement,
  maxUnlocked = 4,
  maxInProgress = 2,
}: AchievementShowcaseProps) {
  if (unlocked.length === 0 && inProgress.length === 0) return null;

  const newIds = new Set(newlyUnlocked.map((u) => u.definitionId));
  const visibleUnlocked = unlocked.slice(0, maxUnlocked);
  const visibleInProgress = inProgress
    .slice()
    .sort((a, b) => {
      const aRatio = (a.progress?.current ?? 0) / (a.progress?.target ?? 1);
      const bRatio = (b.progress?.current ?? 0) / (b.progress?.target ?? 1);
      return bRatio - aRatio;
    })
    .slice(0, maxInProgress);

  return (
    <section style={{ ...styles.dashboardSection, display: "grid", gap: 10 }} aria-label="Achievements">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Achievements</h3>
        <span style={styles.statLabel}>{unlocked.length} unlocked</span>
      </div>

      {visibleUnlocked.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {visibleUnlocked.map((unlock) => {
            const def = getAchievementById(unlock.definitionId);
            if (!def) return null;
            const isNew = newIds.has(unlock.definitionId);
            return (
              <div
                key={unlock.definitionId}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
              >
                <span aria-hidden>{TIER_EMOJI[def.tier]}</span>
                <span style={{ fontWeight: 700 }}>{def.title}</span>
                {isNew && (
                  <>
                    <span style={styles.streakPill}>New</span>
                    {onDismissAchievement && (
                      <button
                        type="button"
                        onClick={() => onDismissAchievement(def.id)}
                        style={{ ...styles.dashboardQuickActionBtn, padding: "2px 8px", fontSize: 11 }}
                        aria-label={`Dismiss new badge for ${def.title}`}
                      >
                        Dismiss
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visibleInProgress.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={styles.statLabel}>In progress</div>
          {visibleInProgress.map((item) => {
            const def = getAchievementById(item.definitionId);
            if (!def || !item.progress) return null;
            return (
              <div
                key={item.definitionId}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, ...styles.textSecondary }}
              >
                <span>{def.title}</span>
                <span style={{ whiteSpace: "nowrap" }}>
                  {item.progress.current.toLocaleString()} / {item.progress.target.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
