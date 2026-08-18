import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { formatCalendarItemButtonLabel, formatItemTimeLabel } from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import {
  completionVisualMark,
  completionVisualOpacity,
  completionVisualStyle,
} from "./calendarCompletionVisual";
import type { CalendarPillDragBindings } from "./useCalendarMonthItemDrag";

export type CalendarItemPillProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  onSelect: (item: CalendarItem) => void;
  drag?: CalendarPillDragBindings;
};

/** Compact month-view pill: dot + time + title in a single line. */
export function CalendarItemPill({ item, preferences, onSelect, drag }: CalendarItemPillProps) {
  const color = resolveCalendarItemColor(item, preferences);
  const timeLabel = formatItemTimeLabel(item);
  const draggable = drag?.draggable ?? false;
  const isDimmed = drag?.isDimmed ?? false;
  const completionStyle = completionVisualStyle(item.completionVisual);
  const mark = completionVisualMark(item);
  const label = drag?.title ?? formatCalendarItemButtonLabel(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onClickCapture={drag?.onClickCapture}
      onPointerDown={drag?.onPointerDown}
      title={label}
      aria-label={label}
      aria-grabbed={drag?.isDragging ? true : undefined}
      style={{
        ...styles.calendarPill,
        ...completionStyle,
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
        cursor: draggable ? "grab" : undefined,
        opacity: completionVisualOpacity(item.completionVisual, isDimmed),
      }}
    >
      {timeLabel ? <span>{timeLabel} </span> : null}
      {mark ? <span aria-hidden="true" style={styles.calendarCompletionMark}>{mark}</span> : null}
      {item.title}
      {item.progressLabel ? (
        <span style={styles.calendarCompletionProgress}>{item.progressLabel}</span>
      ) : null}
    </button>
  );
}
