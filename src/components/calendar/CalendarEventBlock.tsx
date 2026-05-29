import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  computeTimedItemLayout,
  formatItemTimeLabel,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";

export type CalendarEventBlockProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  /** Pixels per minute used to position the block in the hour timeline. */
  pixelsPerMinute: number;
  onSelect: (item: CalendarItem) => void;
};

/** Outlook-style timed block, absolutely positioned within a day column. */
export function CalendarEventBlock({
  item,
  preferences,
  pixelsPerMinute,
  onSelect,
}: CalendarEventBlockProps) {
  const color = resolveCalendarItemColor(item, preferences);
  const layout = computeTimedItemLayout(item);
  const timeLabel = formatItemTimeLabel(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      title={item.title}
      style={{
        ...styles.calendarTimedBlock,
        top: layout.topMinutes * pixelsPerMinute,
        height: Math.max(16, layout.durationMinutes * pixelsPerMinute - 2),
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
      }}
    >
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.title}
      </div>
      {timeLabel ? <div style={{ opacity: 0.85 }}>{timeLabel}</div> : null}
    </button>
  );
}
