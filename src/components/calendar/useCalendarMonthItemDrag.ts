import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarItem } from "../../core/calendar";
import {
  canDragCalendarItemInMonth,
  computeMonthDropTarget,
  DRAG_MOVE_THRESHOLD_PX,
  eventIdFromCalendarItem,
} from "../../core/calendarDrag";

const MONTH_CELL_SELECTOR = "[data-calendar-month-cell]";

type ActiveMonthDrag = {
  item: CalendarItem;
  originDateKey: string;
  pointerId: number;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  moved: boolean;
  targetDateKey: string | null;
};

export type UseCalendarMonthItemDragOptions = {
  onMoveItem?: (eventId: string, dateKey: string) => void;
};

export type CalendarPillDragBindings = {
  draggable: boolean;
  isDragging: boolean;
  isDimmed: boolean;
  title?: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export type CalendarMonthDragGhost = {
  item: CalendarItem;
  x: number;
  y: number;
} | null;

function resolveDateKeyFromPointer(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest(MONTH_CELL_SELECTOR);
  if (!cell) return null;
  return cell.getAttribute("data-date-key") || null;
}

export function useCalendarMonthItemDrag({
  onMoveItem,
}: UseCalendarMonthItemDragOptions) {
  const [activeDrag, setActiveDrag] = useState<ActiveMonthDrag | null>(null);
  const activeDragRef = useRef<ActiveMonthDrag | null>(null);

  const setDrag = useCallback((next: ActiveMonthDrag | null) => {
    activeDragRef.current = next;
    setActiveDrag(next);
  }, []);

  const cancelDrag = useCallback(() => {
    setDrag(null);
  }, [setDrag]);

  const commitDrag = useCallback(() => {
    const drag = activeDragRef.current;
    if (!drag || !drag.moved || !drag.targetDateKey || !onMoveItem) {
      cancelDrag();
      return;
    }

    const target = computeMonthDropTarget({
      item: drag.item,
      originDateKey: drag.originDateKey,
      targetDateKey: drag.targetDateKey,
    });
    const eventId = eventIdFromCalendarItem(drag.item);
    if (target && eventId) {
      onMoveItem(eventId, target.dateKey);
    }
    cancelDrag();
  }, [cancelDrag, onMoveItem]);

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

      const targetDateKey = resolveDateKeyFromPointer(event.clientX, event.clientY);

      setDrag({
        ...drag,
        moved,
        pointerX: event.clientX,
        pointerY: event.clientY,
        targetDateKey,
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
  }, [activeDrag, cancelDrag, commitDrag, setDrag]);

  const getItemDragBindings = useCallback(
    (item: CalendarItem, dateKey: string): CalendarPillDragBindings => {
      const draggable = Boolean(onMoveItem) && canDragCalendarItemInMonth(item);
      const isDragging = activeDrag?.item.id === item.id;
      const isDimmed = isDragging && activeDrag?.moved === true;

      return {
        draggable,
        isDragging,
        isDimmed,
        title:
          !draggable &&
          item.sourceType === "event" &&
          item.sourceMeta.kind === "lifeEvent" &&
          item.sourceMeta.recurrenceDate !== undefined
            ? "Use occurrence actions in the detail view"
            : undefined,
        onPointerDown: (event) => {
          if (!draggable || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({
            item,
            originDateKey: dateKey,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            pointerX: event.clientX,
            pointerY: event.clientY,
            moved: false,
            targetDateKey: dateKey,
          });
        },
        onClickCapture: (event) => {
          if (activeDragRef.current?.moved) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
      };
    },
    [activeDrag?.item.id, activeDrag?.moved, onMoveItem, setDrag]
  );

  const ghost: CalendarMonthDragGhost =
    activeDrag?.moved && activeDrag
      ? { item: activeDrag.item, x: activeDrag.pointerX, y: activeDrag.pointerY }
      : null;

  return {
    getItemDragBindings,
    ghost,
  };
}
