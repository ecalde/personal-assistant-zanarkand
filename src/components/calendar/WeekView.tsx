import type { CalendarItem } from "../../core/calendar";
import type { CalendarColorPreferences } from "../../core/calendarColors";
import {
  buildWeekGrid,
  computeTimedOverlapLayouts,
  formatHourLabel,
  splitDayItems,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import { CalendarDragGhostBlock, CalendarEventBlock } from "./CalendarEventBlock";
import { CalendarItemPill } from "./CalendarItemPill";
import { useCalendarItemDrag } from "./useCalendarItemDrag";
import { useCalendarItemResize } from "./useCalendarItemResize";

export type WeekViewProps = {
  anchorKey: string;
  todayKey: string;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  onRescheduleItem?: (
    eventId: string,
    date: string,
    startTime: string,
    endTime?: string
  ) => void;
  /** Resize a one-time timed life event's end time (drag bottom edge). */
  onResizeItem?: (eventId: string, endTime: string) => void;
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
  onRescheduleItem,
  onResizeItem,
  nowMinutes,
}: WeekViewProps) {
  const columns = buildWeekGrid(anchorKey, todayKey);
  const columnDateKeys = columns.map((column) => column.dateKey);
  const { getItemDragBindings, ghost } = useCalendarItemDrag({
    columnDateKeys,
    pixelsPerMinute: PIXELS_PER_MINUTE,
    onRescheduleItem,
  });
  const { getResizeBindings, ghost: resizeGhost } = useCalendarItemResize({
    pixelsPerMinute: PIXELS_PER_MINUTE,
    onResizeItem,
  });

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

      {columns.map((column) => {
        const { timed } = splitDayItems(itemsByDate.get(column.dateKey) ?? []);
        const overlapLayouts = computeTimedOverlapLayouts(timed);
        const showNowLine = column.isToday && nowMinutes !== undefined;
        const showGhost = ghost?.dateKey === column.dateKey;
        const showResizeGhost = resizeGhost?.dateKey === column.dateKey;
        return (
          <div
            key={`col-${column.dateKey}`}
            data-calendar-day-column="true"
            data-date-key={column.dateKey}
            style={{
              ...styles.calendarWeekDayColumn,
              ...(column.isToday ? styles.calendarWeekDayColumnToday : {}),
              position: "relative",
            }}
          >
            {HOURS.map((hour) => (
              <div key={`line-${hour}`} style={styles.calendarHourLine} />
            ))}

            {timed.map((item) => (
              <CalendarEventBlock
                key={item.id}
                item={item}
                layout={overlapLayouts.get(item.id)}
                preferences={preferences}
                pixelsPerMinute={PIXELS_PER_MINUTE}
                onSelect={onSelectItem}
                drag={getItemDragBindings(item, column.dateKey)}
                resize={getResizeBindings(item, column.dateKey)}
              />
            ))}

            {showGhost ? (
              <CalendarDragGhostBlock
                item={ghost.item}
                preferences={preferences}
                topMinutes={ghost.topMinutes}
                durationMinutes={ghost.durationMinutes}
                pixelsPerMinute={PIXELS_PER_MINUTE}
              />
            ) : null}

            {showResizeGhost ? (
              <CalendarDragGhostBlock
                item={resizeGhost.item}
                preferences={preferences}
                topMinutes={resizeGhost.topMinutes}
                durationMinutes={resizeGhost.durationMinutes}
                pixelsPerMinute={PIXELS_PER_MINUTE}
              />
            ) : null}

            {showNowLine ? (
              <div
                style={{
                  ...styles.calendarNowLine,
                  top: nowMinutes! * PIXELS_PER_MINUTE,
                  pointerEvents: "none",
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
