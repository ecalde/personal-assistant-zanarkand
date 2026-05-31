import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  buildMonthGrid,
  limitDayItems,
  WEEKDAY_SHORT_LABELS,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import { CalendarItemPill } from "./CalendarItemPill";
import { useCalendarMonthItemDrag } from "./useCalendarMonthItemDrag";

export type MonthViewProps = {
  monthAnchorKey: string;
  todayKey: string;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  /** Selecting a "+N more" jumps to that day in week view. */
  onSelectDay: (dateKey: string) => void;
  /** Move a one-time life event to a new date (drag). Read-only when omitted. */
  onMoveItem?: (eventId: string, dateKey: string) => void;
  /** Prefill an Events draft from an empty day cell. Read-only when omitted. */
  onCreateDraftFromDate?: (dateKey: string) => void;
  maxItemsPerDay?: number;
};

export function MonthView({
  monthAnchorKey,
  todayKey,
  itemsByDate,
  preferences,
  onSelectItem,
  onSelectDay,
  onMoveItem,
  onCreateDraftFromDate,
  maxItemsPerDay = 3,
}: MonthViewProps) {
  const weeks = buildMonthGrid(monthAnchorKey, todayKey);
  const { getItemDragBindings, ghost } = useCalendarMonthItemDrag({ onMoveItem });
  const ghostColor = ghost ? resolveCalendarItemColor(ghost.item, preferences) : null;

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
                data-calendar-month-cell="true"
                data-date-key={cell.dateKey}
                onClick={
                  onCreateDraftFromDate
                    ? (event) => {
                        if (event.target === event.currentTarget) {
                          onCreateDraftFromDate(cell.dateKey);
                        }
                      }
                    : undefined
                }
                style={{
                  ...styles.calendarDayCell,
                  ...(cell.inCurrentMonth ? {} : styles.calendarDayCellMuted),
                  ...(cell.isToday ? styles.calendarDayCellToday : {}),
                  cursor: onCreateDraftFromDate ? "pointer" : undefined,
                }}
              >
                <span
                  onClick={
                    onCreateDraftFromDate
                      ? (event) => {
                          event.stopPropagation();
                          onCreateDraftFromDate(cell.dateKey);
                        }
                      : undefined
                  }
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
                    drag={getItemDragBindings(item, cell.dateKey)}
                  />
                ))}

                {overflowCount > 0 ? (
                  <button
                    type="button"
                    style={styles.calendarMoreBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDay(cell.dateKey);
                    }}
                  >
                    +{overflowCount} more
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {ghost && ghostColor ? (
        <div
          aria-hidden="true"
          style={{
            ...styles.calendarPill,
            position: "fixed",
            left: ghost.x + 12,
            top: ghost.y + 12,
            pointerEvents: "none",
            zIndex: 1000,
            maxWidth: 200,
            background: ghostColor.background,
            color: ghostColor.foreground,
            borderColor: ghostColor.border,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          {ghost.item.title}
        </div>
      ) : null}
    </div>
  );
}
