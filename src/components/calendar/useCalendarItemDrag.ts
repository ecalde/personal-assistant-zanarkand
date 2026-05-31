import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarItem } from "../../core/calendar";
import {
  canDragCalendarItem,
  computeRescheduleTarget,
  DRAG_MOVE_THRESHOLD_PX,
  eventIdFromCalendarItem,
  minutesFromPointerDelta,
  originStartMinutesForItem,
  type RescheduleTarget,
} from "../../core/calendarDrag";
import { computeTimedItemLayout } from "../../core/calendarView";

const DAY_COLUMN_SELECTOR = "[data-calendar-day-column]";

type ActiveDrag = {
  item: CalendarItem;
  originDateKey: string;
  originStartMinutes: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  target: RescheduleTarget | null;
};

export type UseCalendarItemDragOptions = {
  columnDateKeys: string[];
  pixelsPerMinute: number;
  onRescheduleItem?: (
    eventId: string,
    date: string,
    startTime: string,
    endTime?: string
  ) => void;
};

export type CalendarItemDragBindings = {
  draggable: boolean;
  isDragging: boolean;
  isDimmed: boolean;
  title?: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export type CalendarDragGhost = {
  item: CalendarItem;
  dateKey: string;
  topMinutes: number;
  durationMinutes: number;
} | null;

function resolveDateKeyFromPointer(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  const column = element?.closest(DAY_COLUMN_SELECTOR);
  if (!column) return null;
  const dateKey = column.getAttribute("data-date-key");
  return dateKey || null;
}

export function useCalendarItemDrag({
  columnDateKeys,
  pixelsPerMinute,
  onRescheduleItem,
}: UseCalendarItemDragOptions) {
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const suppressClickRef = useRef(false);
  const pixelsPerMinuteRef = useRef(pixelsPerMinute);
  const onRescheduleItemRef = useRef(onRescheduleItem);
  const isDragActive = activeDrag !== null;

  useEffect(() => {
    pixelsPerMinuteRef.current = pixelsPerMinute;
  }, [pixelsPerMinute]);

  useEffect(() => {
    onRescheduleItemRef.current = onRescheduleItem;
  }, [onRescheduleItem]);

  const setDrag = useCallback((next: ActiveDrag | null) => {
    activeDragRef.current = next;
    setActiveDrag(next);
  }, []);

  const cancelDrag = useCallback(() => {
    if (activeDragRef.current?.moved) {
      suppressClickRef.current = true;
    }
    setDrag(null);
  }, [setDrag]);

  const commitDrag = useCallback(() => {
    const drag = activeDragRef.current;
    if (!drag || !drag.moved || !drag.target || !onRescheduleItemRef.current) {
      cancelDrag();
      return;
    }

    const eventId = eventIdFromCalendarItem(drag.item);
    if (!eventId) {
      cancelDrag();
      return;
    }

    suppressClickRef.current = true;
    onRescheduleItemRef.current(
      eventId,
      drag.target.dateKey,
      drag.target.startTime,
      drag.target.endTime
    );
    cancelDrag();
  }, [cancelDrag]);

  useEffect(() => {
    if (!activeDrag) return;

    const onPointerMove = (event: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      const moved =
        drag.moved ||
        Math.abs(deltaX) >= DRAG_MOVE_THRESHOLD_PX ||
        Math.abs(deltaY) >= DRAG_MOVE_THRESHOLD_PX;

      const targetDateKey =
        resolveDateKeyFromPointer(event.clientX, event.clientY) ?? drag.originDateKey;
      const deltaYMinutes = minutesFromPointerDelta(deltaY, pixelsPerMinuteRef.current);
      const target = computeRescheduleTarget({
        item: drag.item,
        originDateKey: drag.originDateKey,
        originStartMinutes: drag.originStartMinutes,
        targetDateKey,
        deltaYMinutes,
      });

      setDrag({
        ...drag,
        moved,
        target,
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      commitDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isDragActive, cancelDrag, commitDrag, setDrag]);

  const getItemDragBindings = useCallback(
    (item: CalendarItem, dateKey: string): CalendarItemDragBindings => {
      const draggable = Boolean(onRescheduleItem) && canDragCalendarItem(item);
      const isDragging = activeDrag?.item.id === item.id;
      const isDimmed = isDragging && activeDrag?.moved === true;

      return {
        draggable,
        isDragging,
        isDimmed,
        title: draggable
          ? undefined
          : item.sourceType === "event" &&
              item.sourceMeta.kind === "lifeEvent" &&
              item.sourceMeta.recurrenceDate !== undefined
            ? "Use occurrence actions in the detail view"
            : undefined,
        onPointerDown: (event) => {
          if (!draggable || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({
            item,
            originDateKey: dateKey,
            originStartMinutes: originStartMinutesForItem(item),
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            target: null,
          });
        },
        onClickCapture: (event) => {
          if (suppressClickRef.current || activeDragRef.current?.moved) {
            event.preventDefault();
            event.stopPropagation();
            suppressClickRef.current = false;
          }
        },
      };
    },
    [activeDrag?.item.id, activeDrag?.moved, onRescheduleItem, setDrag]
  );

  const ghost: CalendarDragGhost = (() => {
    if (!activeDrag?.target || !activeDrag.moved) return null;
    const layout = computeTimedItemLayout(activeDrag.item);
    const targetStart = activeDrag.target.startTime;
    const topMinutes = originStartMinutesForItem({
      ...activeDrag.item,
      startTime: targetStart,
    });
    return {
      item: activeDrag.item,
      dateKey: activeDrag.target.dateKey,
      topMinutes,
      durationMinutes: layout.durationMinutes,
    };
  })();

  return {
    getItemDragBindings,
    ghost,
    columnDateKeys,
  };
}
