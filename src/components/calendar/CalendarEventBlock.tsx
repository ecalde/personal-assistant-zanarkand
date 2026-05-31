import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  computeTimedItemLayout,
  formatItemTimeLabel,
} from "../../core/calendarView";
import type { CalendarItemDragBindings } from "./useCalendarItemDrag";
import type { CalendarItemResizeBindings } from "./useCalendarItemResize";
import { styles } from "../../ui/appStyles";

export type CalendarEventBlockProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  /** Pixels per minute used to position the block in the hour timeline. */
  pixelsPerMinute: number;
  onSelect: (item: CalendarItem) => void;
  drag?: CalendarItemDragBindings;
  resize?: CalendarItemResizeBindings;
};

/** Outlook-style timed block, absolutely positioned within a day column. */
export function CalendarEventBlock({
  item,
  preferences,
  pixelsPerMinute,
  onSelect,
  drag,
  resize,
}: CalendarEventBlockProps) {
  const color = resolveCalendarItemColor(item, preferences);
  const layout = computeTimedItemLayout(item);
  const timeLabel = formatItemTimeLabel(item);
  const draggable = drag?.draggable ?? false;
  const resizable = resize?.resizable ?? false;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      onClickCapture={drag?.onClickCapture}
      onPointerDown={drag?.onPointerDown}
      title={drag?.title ?? item.title}
      aria-grabbed={drag?.isDragging ? true : undefined}
      style={{
        ...styles.calendarTimedBlock,
        top: layout.topMinutes * pixelsPerMinute,
        height: Math.max(16, layout.durationMinutes * pixelsPerMinute - 2),
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
        cursor: draggable ? "grab" : undefined,
        opacity: drag?.isDimmed ? 0.45 : 1,
      }}
    >
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.title}
      </div>
      {timeLabel ? <div style={{ opacity: 0.85 }}>{timeLabel}</div> : null}

      {resizable && resize ? (
        <div
          role="separator"
          aria-label="Resize end time"
          aria-orientation="horizontal"
          onPointerDown={resize.onPointerDown}
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 8,
            cursor: "ns-resize",
          }}
        />
      ) : null}
    </button>
  );
}

export type CalendarDragGhostBlockProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  topMinutes: number;
  durationMinutes: number;
  pixelsPerMinute: number;
};

export function CalendarDragGhostBlock({
  item,
  preferences,
  topMinutes,
  durationMinutes,
  pixelsPerMinute,
}: CalendarDragGhostBlockProps) {
  const color = resolveCalendarItemColor(item, preferences);

  return (
    <div
      aria-hidden="true"
      style={{
        ...styles.calendarTimedBlock,
        position: "absolute",
        left: 4,
        right: 4,
        pointerEvents: "none",
        opacity: 0.85,
        zIndex: 3,
        top: topMinutes * pixelsPerMinute,
        height: Math.max(16, durationMinutes * pixelsPerMinute - 2),
        background: color.background,
        color: color.foreground,
        borderColor: color.border,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.title}
      </div>
    </div>
  );
}
