import type { CalendarItem } from "../../core/calendar";
import type { CalendarColorPreferences } from "../../core/calendarColors";
import {
  buildWeekGrid,
  formatHourLabel,
  splitDayItems,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import { CalendarEventBlock } from "./CalendarEventBlock";
import { CalendarItemPill } from "./CalendarItemPill";

export type WeekViewProps = {
  anchorKey: string;
  todayKey: string;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  /** Current time in minutes-from-midnight for the indicator line. */
  nowMinutes?: number;
};

const HOUR_HEIGHT_PX = 48;
const PIXELS_PER_MINUTE = HOUR_HEIGHT_PX / 60;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function WeekView({
  anchorKey,
  todayKey,
  itemsByDate,
  preferences,
  onSelectItem,
  nowMinutes,
}: WeekViewProps) {
  const columns = buildWeekGrid(anchorKey, todayKey);

  return (
    <div style={styles.calendarWeekGrid}>
      {/* Column headers */}
      <div style={styles.calendarWeekColHeader} aria-hidden="true" />
      {columns.map((column) => (
        <div
          key={`head-${column.dateKey}`}
          style={{
            ...styles.calendarWeekColHeader,
            ...(column.isToday ? styles.calendarWeekColHeaderToday : {}),
          }}
        >
          <div>{column.label}</div>
          <div style={{ fontSize: 14 }}>{column.dayNumber}</div>
        </div>
      ))}

      {/* All-day row */}
      <div style={styles.calendarAllDayLabel}>All day</div>
      {columns.map((column) => {
        const { allDay } = splitDayItems(itemsByDate.get(column.dateKey) ?? []);
        return (
          <div key={`allday-${column.dateKey}`} style={styles.calendarAllDayCell}>
            {allDay.map((item) => (
              <CalendarItemPill
                key={item.id}
                item={item}
                preferences={preferences}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        );
      })}

      {/* Time gutter */}
      <div>
        {HOURS.map((hour) => (
          <div key={`hour-${hour}`} style={styles.calendarTimeGutterCell}>
            {formatHourLabel(hour)}
          </div>
        ))}
      </div>

      {/* Day columns with timed blocks */}
      {columns.map((column) => {
        const { timed } = splitDayItems(itemsByDate.get(column.dateKey) ?? []);
        const showNowLine = column.isToday && nowMinutes !== undefined;
        return (
          <div
            key={`col-${column.dateKey}`}
            style={{
              ...styles.calendarWeekDayColumn,
              ...(column.isToday ? styles.calendarWeekDayColumnToday : {}),
            }}
          >
            {HOURS.map((hour) => (
              <div key={`line-${hour}`} style={styles.calendarHourLine} />
            ))}

            {timed.map((item) => (
              <CalendarEventBlock
                key={item.id}
                item={item}
                preferences={preferences}
                pixelsPerMinute={PIXELS_PER_MINUTE}
                onSelect={onSelectItem}
              />
            ))}

            {showNowLine ? (
              <div
                style={{
                  ...styles.calendarNowLine,
                  top: nowMinutes! * PIXELS_PER_MINUTE,
                }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
