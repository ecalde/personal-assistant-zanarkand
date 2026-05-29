import type { CalendarItem } from "../../core/calendar";
import type { CalendarColorPreferences } from "../../core/calendarColors";
import {
  buildMonthGrid,
  limitDayItems,
  WEEKDAY_SHORT_LABELS,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import { CalendarItemPill } from "./CalendarItemPill";

export type MonthViewProps = {
  monthAnchorKey: string;
  todayKey: string;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  /** Selecting a "+N more" jumps to that day in week view. */
  onSelectDay: (dateKey: string) => void;
  maxItemsPerDay?: number;
};

export function MonthView({
  monthAnchorKey,
  todayKey,
  itemsByDate,
  preferences,
  onSelectItem,
  onSelectDay,
  maxItemsPerDay = 3,
}: MonthViewProps) {
  const weeks = buildMonthGrid(monthAnchorKey, todayKey);

  return (
    <div>
      <div style={styles.calendarWeekdayHeader}>
        {WEEKDAY_SHORT_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div style={styles.calendarMonthGrid}>
        {weeks.flatMap((week) =>
          week.days.map((cell) => {
            const dayItems = itemsByDate.get(cell.dateKey) ?? [];
            const { visible, overflowCount } = limitDayItems(dayItems, maxItemsPerDay);

            return (
              <div
                key={cell.dateKey}
                style={{
                  ...styles.calendarDayCell,
                  ...(cell.inCurrentMonth ? {} : styles.calendarDayCellMuted),
                  ...(cell.isToday ? styles.calendarDayCellToday : {}),
                }}
              >
                <span
                  style={{
                    ...styles.calendarDayNumber,
                    ...(cell.isToday ? styles.calendarDayNumberToday : {}),
                  }}
                >
                  {cell.dayNumber}
                </span>

                {visible.map((item) => (
                  <CalendarItemPill
                    key={item.id}
                    item={item}
                    preferences={preferences}
                    onSelect={onSelectItem}
                  />
                ))}

                {overflowCount > 0 ? (
                  <button
                    type="button"
                    style={styles.calendarMoreBtn}
                    onClick={() => onSelectDay(cell.dateKey)}
                  >
                    +{overflowCount} more
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
