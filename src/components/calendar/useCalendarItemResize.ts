import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarItem } from "../../core/calendar";
import {
  canResizeCalendarItem,
  computeResizeTarget,
  DRAG_MOVE_THRESHOLD_PX,
  eventIdFromCalendarItem,
  minutesFromPointerDelta,
  originEndMinutesForItem,
  type ResizeTarget,
} from "../../core/calendarDrag";
import { parseHHMMToMinutes } from "../../core/schedule";

type ActiveResize = {
  item: CalendarItem;
  dateKey: string;
  originEndMinutes: number;
  pointerId: number;
  startY: number;
  moved: boolean;
  target: ResizeTarget | null;
};

export type UseCalendarItemResizeOptions = {
  pixelsPerMinute: number;
  onResizeItem?: (eventId: string, endTime: string) => void;
};

export type CalendarItemResizeBindings = {
  resizable: boolean;
  isResizing: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export type CalendarResizeGhost = {
  item: CalendarItem;
  dateKey: string;
  topMinutes: number;
  durationMinutes: number;
} | null;

export function useCalendarItemResize({
  pixelsPerMinute,
  onResizeItem,
}: UseCalendarItemResizeOptions) {
  const [activeResize, setActiveResize] = useState<ActiveResize | null>(null);
  const activeResizeRef = useRef<ActiveResize | null>(null);

  const setResize = useCallback((next: ActiveResize | null) => {
    activeResizeRef.current = next;
    setActiveResize(next);
  }, []);

  const cancelResize = useCallback(() => {
    setResize(null);
  }, [setResize]);

  const commitResize = useCallback(() => {
    const resize = activeResizeRef.current;
    if (!resize || !resize.moved || !resize.target || !onResizeItem) {
      cancelResize();
      return;
    }
    const eventId = eventIdFromCalendarItem(resize.item);
    if (eventId) {
      onResizeItem(eventId, resize.target.endTime);
    }
    cancelResize();
  }, [cancelResize, onResizeItem]);

  useEffect(() => {
    if (!activeResize) return;

    const onPointerMove = (event: PointerEvent) => {
      const resize = activeResizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;

      const deltaY = event.clientY - resize.startY;
      const moved = resize.moved || Math.abs(deltaY) >= DRAG_MOVE_THRESHOLD_PX;
      const deltaYMinutes = minutesFromPointerDelta(deltaY, pixelsPerMinute);
      const target = computeResizeTarget({
        item: resize.item,
        originEndMinutes: resize.originEndMinutes,
        deltaYMinutes,
      });

      setResize({ ...resize, moved, target });
    };

    const onPointerUp = (event: PointerEvent) => {
      const resize = activeResizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      commitResize();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelResize();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeResize, cancelResize, commitResize, pixelsPerMinute, setResize]);

  const getResizeBindings = useCallback(
    (item: CalendarItem, dateKey: string): CalendarItemResizeBindings => {
      const resizable = Boolean(onResizeItem) && canResizeCalendarItem(item);
      const isResizing = activeResize?.item.id === item.id;

      return {
        resizable,
        isResizing,
        onPointerDown: (event) => {
          if (!resizable || event.button !== 0) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setResize({
            item,
            dateKey,
            originEndMinutes: originEndMinutesForItem(item),
            pointerId: event.pointerId,
            startY: event.clientY,
            moved: false,
            target: null,
          });
        },
      };
    },
    [activeResize?.item.id, onResizeItem, setResize]
  );

  const ghost: CalendarResizeGhost = (() => {
    if (!activeResize?.target || !activeResize.moved || !activeResize.item.startTime) {
      return null;
    }
    const startMinutes = parseHHMMToMinutes(activeResize.item.startTime);
    const endMinutes = parseHHMMToMinutes(activeResize.target.endTime);
    return {
      item: activeResize.item,
      dateKey: activeResize.dateKey,
      topMinutes: startMinutes,
      durationMinutes: Math.max(0, endMinutes - startMinutes),
    };
  })();

  return {
    getResizeBindings,
    ghost,
  };
}
