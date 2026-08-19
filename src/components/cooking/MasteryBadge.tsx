import type { RecipeMasteryView } from "../../core/cooking";
import { formatMasteryStreak } from "../../core/cooking";
import { styles } from "../../ui/appStyles";

export type MasteryBadgeProps = {
  mastery: RecipeMasteryView;
  showCount?: boolean;
  showStreak?: boolean;
};

export function MasteryBadge({
  mastery,
  showCount = true,
  showStreak = true,
}: MasteryBadgeProps) {
  if (mastery.tier === null) return null;
  const streak = showStreak ? formatMasteryStreak(mastery.recentWeekStreak) : undefined;

  return (
    <span style={styles.masteryBadge}>
      {mastery.tierName}
      {showCount ? ` · ${mastery.completionCount}` : ""}
      {streak ? ` · ${streak}` : ""}
    </span>
  );
}
