import { useEffect, useRef } from "react";
import type { CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  formatItemTimeLabel,
  formatSourceTypeLabel,
} from "../../core/calendarView";
import { styles } from "../../ui/appStyles";

export type CalendarItemDetailModalProps = {
  item: CalendarItem;
  preferences?: CalendarColorPreferences;
  onClose: () => void;
  /** Opens Events edit for the full recurring series. */
  onEditEntireSeries?: (eventId: string, occurrenceDate: string) => void;
  /** Opens Events edit scoped to this occurrence and future. */
  onEditThisAndFuture?: (eventId: string, splitDate: string) => void;
};

function formatLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.calendarModalRow}>
      <span style={styles.calendarModalLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function CalendarItemDetailModal({
  item,
  preferences,
  onClose,
  onEditEntireSeries,
  onEditThisAndFuture,
}: CalendarItemDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const color = resolveCalendarItemColor(item, preferences);
  const timeLabel = formatItemTimeLabel(item);

  const isRecurringOccurrence =
    item.sourceType === "event" &&
    item.sourceMeta.kind === "lifeEvent" &&
    item.sourceMeta.recurrenceDate !== undefined;

  const eventId =
    item.sourceMeta.kind === "lifeEvent" ? item.sourceMeta.eventId : undefined;
  const occurrenceDate =
    item.sourceMeta.kind === "lifeEvent"
      ? (item.sourceMeta.recurrenceDate ?? item.date)
      : item.date;

  const canEditSeries =
    isRecurringOccurrence &&
    eventId &&
    (onEditEntireSeries || onEditThisAndFuture);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      style={styles.calendarModalOverlay}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={styles.calendarModalCard}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              ...styles.calendarCategorySwatch,
              background: color.background,
              width: 14,
              height: 14,
            }}
          />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>
            {item.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            style={styles.smallBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <DetailRow label="Type" value={formatSourceTypeLabel(item)} />
          <DetailRow label="Date" value={formatLongDate(item.date)} />
          <DetailRow label="Time" value={timeLabel ?? "All day"} />
          {item.description ? (
            <DetailRow label="Details" value={item.description} />
          ) : null}
        </div>

        {canEditSeries ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onEditEntireSeries ? (
              <button
                type="button"
                style={styles.smallBtn}
                onClick={() => {
                  onEditEntireSeries(eventId!, occurrenceDate);
                  onClose();
                }}
              >
                Edit entire series
              </button>
            ) : null}
            {onEditThisAndFuture ? (
              <button
                type="button"
                style={styles.smallBtn}
                onClick={() => {
                  onEditThisAndFuture(eventId!, occurrenceDate);
                  onClose();
                }}
              >
                Edit this and future
              </button>
            ) : null}
          </div>
        ) : (
          <p style={{ ...styles.helpText, margin: 0 }}>
            Read-only preview. Open the source page to make changes.
          </p>
        )}
      </div>
    </div>
  );
}
