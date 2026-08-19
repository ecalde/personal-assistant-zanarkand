import { formatRecipeAvailability } from "../../core/ingredients";
import type { RecipeAvailability } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type AvailabilityBadgeProps = {
  status: RecipeAvailability;
};

export function AvailabilityBadge({ status }: AvailabilityBadgeProps) {
  const tone =
    status === "can_make"
      ? styles.statusOnTrack
      : status === "partial"
        ? styles.statusIdle
        : styles.statusOverdue;

  return (
    <span style={{ ...styles.statusPill, ...tone, fontSize: 11 }}>
      {formatRecipeAvailability(status)}
    </span>
  );
}
