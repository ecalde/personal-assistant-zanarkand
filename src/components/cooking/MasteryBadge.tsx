import type { RecipeMasteryView } from "../../core/cooking";
import { formatMasteryStreak } from "../../core/cooking";
import { styles } from "../../ui/appStyles";

export type MasteryBadgeProps = {
  mastery: RecipeMasteryView;
  showCount?: boolean;
};

export function MasteryBadge({ mastery, showCount = true }: MasteryBadgeProps) {
  if (mastery.tier === null) return null;
  const streak = formatMasteryStreak(mastery.recentWeekStreak);

  return (
    <span style={styles.masteryBadge}>
      {mastery.tierName}
      {showCount ? ` · ${mastery.completionCount}` : ""}
      {showCount && streak ? ` · ${streak}` : ""}
    </span>
  );
}
