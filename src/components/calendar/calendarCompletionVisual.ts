import type { CSSProperties } from "react";
import type { CalendarCompletionVisual, CalendarItem } from "../../core/calendar";

const PLANNED_OPACITY = 0.42;
const IN_PROGRESS_OPACITY = 0.72;

/** Border treatment for fitness planned vs live vs done. Opacity is applied separately so drag dimming stays independent. */
export function completionVisualStyle(
  visual: CalendarCompletionVisual | undefined
): CSSProperties {
  if (visual === "planned") {
    return { borderStyle: "dashed" };
  }
  return {};
}

export function completionVisualOpacity(
  visual: CalendarCompletionVisual | undefined,
  isDimmed: boolean
): number {
  if (isDimmed) return 0.45;
  if (visual === "planned") return PLANNED_OPACITY;
  if (visual === "in_progress") return IN_PROGRESS_OPACITY;
  return 1;
}

export function completionVisualMark(item: CalendarItem): string | undefined {
  if (item.completionVisual === "completed") return "✓";
  return undefined;
}
