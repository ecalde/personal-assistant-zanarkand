import { formatWorkoutFocus } from "../../core/fitness";
import type { WorkoutFocus } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type WorkoutFocusBadgeProps = {
  focus?: WorkoutFocus;
};

export function WorkoutFocusBadge({ focus }: WorkoutFocusBadgeProps) {
  if (!focus) return null;

  return <span style={styles.statusPill}>{formatWorkoutFocus(focus)}</span>;
}
