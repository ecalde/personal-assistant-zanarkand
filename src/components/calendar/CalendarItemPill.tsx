import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import { formatItemTimeLabel } from "../../core/calendarView";
import { styles } from "../../ui/appStyles";

export type CalendarItemPillProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  onSelect: (item: CalendarItem) => void;
};

/** Compact month-view pill: dot + time + title in a single line. */
export function CalendarItemPill({ item, preferences, onSelect }: CalendarItemPillProps) {
  const color = resolveCalendarItemColor(item, preferences);
  const timeLabel = formatItemTimeLabel(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      title={item.title}
      style={{
        ...styles.calendarPill,
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
      }}
    >
      {timeLabel ? <span style={{ opacity: 0.85 }}>{timeLabel} </span> : null}
      {item.title}
    </button>
  );
}
