import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CalendarItem } from "../../core/calendar";
import type { CalendarColorPreferences } from "../../core/calendarColors";
import {
  addDaysToDateKey,
  buildDayColumns,
  computeThreeDaySnapAnchorIndex,
  computeTimedOverlapLayouts,
  daysBetweenDateKeys,
  splitDayItems,
  threeDaySnapScrollLeft,
  THREE_DAY_VISIBLE_COUNT,
  type WeekDayColumn,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";
import {
  CALENDAR_HOUR_HEIGHT_PX,
  CALENDAR_TIME_GUTTER_PX,
  THREE_DAY_SCROLL_BUFFER_DAYS,
} from "./calendarLayoutConstants";
import {
  CALENDAR_TIMED_GRID_ROWS,
  CalendarHourGridLine,
  CalendarHourGutter,
  calendarStickyGutterAllDayLabelStyle,
  calendarStickyGutterHeaderStyle,
  calendarStickyGutterTimeColumnStyle,
  calendarThreeDayGridColumns,
} from "./CalendarTimedGridParts";
import { CalendarDragGhostBlock, CalendarEventBlock } from "./CalendarEventBlock";
import { CalendarItemPill } from "./CalendarItemPill";
import { useCalendarItemDrag } from "./useCalendarItemDrag";
import { useCalendarItemResize } from "./useCalendarItemResize";

export type ThreeDayViewProps = {
  anchorKey: string;
  todayKey: string;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  onAnchorChange: (dateKey: string) => void;
  onRescheduleItem?: (
    eventId: string,
    date: string,
    startTime: string,
    endTime?: string
  ) => void;
  onResizeItem?: (eventId: string, endTime: string) => void;
  nowMinutes?: number;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const PIXELS_PER_MINUTE = CALENDAR_HOUR_HEIGHT_PX / 60;
const SCROLL_END_DEBOUNCE_MS = 120;

export function ThreeDayView({
  anchorKey,
  todayKey,
  itemsByDate,
  preferences,
  onSelectItem,
  onAnchorChange,
  onRescheduleItem,
  onResizeItem,
  nowMinutes,
}: ThreeDayViewProps) {
  const stripStartKey = useMemo(
    () => addDaysToDateKey(todayKey, -THREE_DAY_SCROLL_BUFFER_DAYS),
    [todayKey]
  );

  const columns = useMemo(
    () =>
      buildDayColumns(
        stripStartKey,
        THREE_DAY_SCROLL_BUFFER_DAYS * 2 + 1,
        todayKey
      ),
    [stripStartKey, todayKey]
  );

  const columnDateKeys = useMemo(() => columns.map((column) => column.dateKey), [columns]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dayAreaWidth, setDayAreaWidth] = useState(0);
  const isProgrammaticScrollRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayWidthPx =
    dayAreaWidth > CALENDAR_TIME_GUTTER_PX
      ? (dayAreaWidth - CALENDAR_TIME_GUTTER_PX) / THREE_DAY_VISIBLE_COUNT
      : 0;

  const { getItemDragBindings, ghost } = useCalendarItemDrag({
    columnDateKeys,
    pixelsPerMinute: PIXELS_PER_MINUTE,
    onRescheduleItem,
  });
  const { getResizeBindings, ghost: resizeGhost } = useCalendarItemResize({
    pixelsPerMinute: PIXELS_PER_MINUTE,
    onResizeItem,
  });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setDayAreaWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scrollToAnchor = useCallback(
    (dateKey: string, behavior: ScrollBehavior = "auto") => {
      const scrollEl = scrollRef.current;
      if (!scrollEl || dayWidthPx <= 0) return;
      const anchorIndex = daysBetweenDateKeys(stripStartKey, dateKey);
      isProgrammaticScrollRef.current = true;
      scrollEl.scrollTo({
        left: threeDaySnapScrollLeft(anchorIndex, dayWidthPx),
        behavior,
      });
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, behavior === "smooth" ? 350 : 0);
    },
    [dayWidthPx, stripStartKey]
  );

  useEffect(() => {
    scrollToAnchor(anchorKey, "auto");
  }, [anchorKey, dayWidthPx, scrollToAnchor]);

  const snapAfterScroll = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || dayWidthPx <= 0 || isProgrammaticScrollRef.current) return;

    const anchorIndex = computeThreeDaySnapAnchorIndex(
      scrollEl.scrollLeft,
      dayWidthPx,
      0,
      columns.length - THREE_DAY_VISIBLE_COUNT
    );
    const snapLeft = threeDaySnapScrollLeft(anchorIndex, dayWidthPx);
    const newAnchorKey = addDaysToDateKey(stripStartKey, anchorIndex);

    if (Math.abs(scrollEl.scrollLeft - snapLeft) > 1) {
      isProgrammaticScrollRef.current = true;
      scrollEl.scrollTo({ left: snapLeft, behavior: "smooth" });
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 350);
    }

    if (newAnchorKey !== anchorKey) {
      onAnchorChange(newAnchorKey);
    }
  }, [anchorKey, columns.length, dayWidthPx, onAnchorChange, stripStartKey]);

  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      scrollEndTimerRef.current = null;
      snapAfterScroll();
    }, SCROLL_END_DEBOUNCE_MS);
  }, [snapAfterScroll]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const onScrollEnd = () => {
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
      snapAfterScroll();
    };

    scrollEl.addEventListener("scrollend", onScrollEnd);
    return () => {
      scrollEl.removeEventListener("scrollend", onScrollEnd);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    };
  }, [snapAfterScroll]);

  const shellStyle: CSSProperties = {
    border: styles.calendarWeekGrid.border as string,
    borderRadius: styles.calendarWeekGrid.borderRadius,
    overflow: "hidden",
    background: styles.calendarWeekGrid.background as string,
    color: styles.calendarWeekGrid.color as string,
    width: "100%",
    minWidth: 0,
  };

  const scrollGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: calendarThreeDayGridColumns(columns.length, dayWidthPx),
    gridTemplateRows: CALENDAR_TIMED_GRID_ROWS,
    width:
      dayWidthPx > 0
        ? CALENDAR_TIME_GUTTER_PX + columns.length * dayWidthPx
        : "max-content",
    minWidth: "100%",
  };

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <div ref={viewportRef} style={shellStyle}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            WebkitOverflowScrolling: "touch",
            minWidth: 0,
          }}
          aria-label="Three day calendar"
        >
          <ThreeDayScrollGrid
            columns={columns}
            scrollGridStyle={scrollGridStyle}
            itemsByDate={itemsByDate}
            preferences={preferences}
            onSelectItem={onSelectItem}
            getItemDragBindings={getItemDragBindings}
            getResizeBindings={getResizeBindings}
            ghost={ghost}
            resizeGhost={resizeGhost}
            nowMinutes={nowMinutes}
          />
        </div>
      </div>
    </div>
  );
}

type ThreeDayScrollGridProps = {
  columns: WeekDayColumn[];
  scrollGridStyle: CSSProperties;
  itemsByDate: Map<string, CalendarItem[]>;
  preferences?: CalendarColorPreferences;
  onSelectItem: (item: CalendarItem) => void;
  getItemDragBindings: ReturnType<typeof useCalendarItemDrag>["getItemDragBindings"];
  getResizeBindings: ReturnType<typeof useCalendarItemResize>["getResizeBindings"];
  ghost: ReturnType<typeof useCalendarItemDrag>["ghost"];
  resizeGhost: ReturnType<typeof useCalendarItemResize>["ghost"];
  nowMinutes?: number;
};

function ThreeDayScrollGrid({
  columns,
  scrollGridStyle,
  itemsByDate,
  preferences,
  onSelectItem,
  getItemDragBindings,
  getResizeBindings,
  ghost,
  resizeGhost,
  nowMinutes,
}: ThreeDayScrollGridProps) {
  return (
    <div style={scrollGridStyle}>
      <div style={calendarStickyGutterHeaderStyle()} aria-hidden="true" />

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

      <div style={calendarStickyGutterAllDayLabelStyle()} aria-hidden="true">
        All day
      </div>

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

      <div style={calendarStickyGutterTimeColumnStyle()}>
        <CalendarHourGutter />
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
              <CalendarHourGridLine key={`line-${hour}`} hour={hour} />
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
