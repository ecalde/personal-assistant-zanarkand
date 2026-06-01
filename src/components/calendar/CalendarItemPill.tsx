import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { formatItemTimeLabel } from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
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

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onClickCapture={drag?.onClickCapture}
      onPointerDown={drag?.onPointerDown}
      title={drag?.title ?? item.title}
      aria-grabbed={drag?.isDragging ? true : undefined}
      style={{
        ...styles.calendarPill,
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
        cursor: draggable ? "grab" : undefined,
        opacity: drag?.isDimmed ? 0.45 : 1,
      }}
    >
      {timeLabel ? <span style={{ ...styles.textSecondary }}>{timeLabel} </span> : null}
      {item.title}
    </button>
  );
}
