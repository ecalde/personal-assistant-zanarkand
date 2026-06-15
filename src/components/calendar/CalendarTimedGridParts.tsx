import type { CSSProperties } from "react";
import { formatHourLabel } from "../../core/calendarView";
import { styles, SURFACE } from "../../ui/appStyles";
import {
  CALENDAR_ALL_DAY_ROW_MIN_PX,
  CALENDAR_HOUR_HEIGHT_PX,
  CALENDAR_TIME_GUTTER_PX,
} from "./calendarLayoutConstants";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Shared 3-row template: headers, all-day band, timed body. */
export const CALENDAR_TIMED_GRID_ROWS = `auto minmax(${CALENDAR_ALL_DAY_ROW_MIN_PX}px, auto) auto` as const;

export function calendarTimedGridColumns(dayColumnCount: number): string {
  return `${CALENDAR_TIME_GUTTER_PX}px repeat(${dayColumnCount}, 1fr)`;
}

export function calendarThreeDayGridColumns(
  dayColumnCount: number,
  dayWidthPx: number
): string {
  if (dayWidthPx > 0) {
    return `${CALENDAR_TIME_GUTTER_PX}px repeat(${dayColumnCount}, ${dayWidthPx}px)`;
  }
  return `${CALENDAR_TIME_GUTTER_PX}px repeat(${dayColumnCount}, 1fr)`;
}

/** Above timed event blocks (z-index 5+) but below drag ghosts (100). */
const STICKY_GUTTER_Z_INDEX = 20;

const stickyGutterBase: CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: STICKY_GUTTER_Z_INDEX,
  width: CALENDAR_TIME_GUTTER_PX,
  boxSizing: "border-box",
  background: SURFACE.bg,
  borderRight: `1px solid var(--aether-border, #e5e5e5)`,
};

export function calendarStickyGutterHeaderStyle(): CSSProperties {
  return {
    ...styles.calendarWeekColHeader,
    ...stickyGutterBase,
    background: SURFACE.bg,
  };
}

export function calendarStickyGutterAllDayLabelStyle(): CSSProperties {
  return {
    ...styles.calendarAllDayLabelCompact,
    ...stickyGutterBase,
    background: SURFACE.raised,
    borderLeft: "none",
  };
}

export function calendarStickyGutterTimeColumnStyle(): CSSProperties {
  return {
    ...stickyGutterBase,
    background: SURFACE.bg,
    borderLeft: "none",
  };
}

export function CalendarAllDayLabel() {
  return (
    <div style={{ ...styles.calendarAllDayLabelCompact, height: "100%" }} aria-hidden="true">
      All day
    </div>
  );
}

export function CalendarHourGutter() {
  return (
    <>
      {HOURS.map((hour) => (
        <CalendarHourGutterSlot key={`hour-${hour}`} hour={hour} />
      ))}
    </>
  );
}

export function CalendarHourGutterSlot({ hour }: { hour: number }) {
  const isFirst = hour === 0;
  return (
    <div
      style={{
        ...styles.calendarTimeGutterSlot,
        height: CALENDAR_HOUR_HEIGHT_PX,
      }}
    >
      <span
        style={{
          ...styles.calendarTimeGutterLabel,
          ...(isFirst ? styles.calendarTimeGutterLabelFirst : {}),
        }}
      >
        {formatHourLabel(hour)}
      </span>
    </div>
  );
}

export function CalendarHourGridLine({ hour }: { hour: number }) {
  return (
    <div
      key={`line-${hour}`}
      style={{
        ...styles.calendarHourLine,
        height: CALENDAR_HOUR_HEIGHT_PX,
      }}
    />
  );
}

export const CALENDAR_HOUR_HEIGHT_PX_EXPORT = CALENDAR_HOUR_HEIGHT_PX;
