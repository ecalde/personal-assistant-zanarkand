import { useEffect, useRef, useState } from "react";
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
  /** Opens Events edit for this occurrence only. */
  onEditThisOccurrenceOnly?: (eventId: string, occurrenceDate: string) => void;
  onSkipOccurrence?: (eventId: string, occurrenceDate: string) => void;
  onMoveOccurrence?: (
    eventId: string,
    occurrenceDate: string,
    overrideDate: string
  ) => void;
  onDeleteOccurrencesFromDate?: (eventId: string, fromDate: string) => void;
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

function scheduledOccurrenceDate(item: CalendarItem): string | undefined {
  if (item.sourceMeta.kind !== "lifeEvent") return undefined;
  return item.sourceMeta.originalDate ?? item.sourceMeta.recurrenceDate ?? item.date;
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
  onEditThisOccurrenceOnly,
  onSkipOccurrence,
  onMoveOccurrence,
  onDeleteOccurrencesFromDate,
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
  const occurrenceDate = scheduledOccurrenceDate(item);
  const displayDate =
    item.sourceMeta.kind === "lifeEvent"
      ? (item.sourceMeta.recurrenceDate ?? item.date)
      : item.date;

  const [moveTargetDate, setMoveTargetDate] = useState(displayDate);

  const canEditSeries =
    isRecurringOccurrence &&
    eventId &&
    occurrenceDate &&
    (onEditEntireSeries ||
      onEditThisAndFuture ||
      onEditThisOccurrenceOnly ||
      onSkipOccurrence ||
      onMoveOccurrence ||
      onDeleteOccurrencesFromDate);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSkip() {
    if (!eventId || !occurrenceDate || !onSkipOccurrence) return;
    if (!window.confirm(`Skip this occurrence on ${formatLongDate(displayDate)}?`)) return;
    onSkipOccurrence(eventId, occurrenceDate);
    onClose();
  }

  function handleDeleteFuture() {
    if (!eventId || !occurrenceDate || !onDeleteOccurrencesFromDate) return;
    if (
      !window.confirm(
        `Delete this occurrence and all future occurrences starting ${formatLongDate(displayDate)}?`
      )
    ) {
      return;
    }
    onDeleteOccurrencesFromDate(eventId, displayDate);
    onClose();
  }

  function handleMove() {
    if (!eventId || !occurrenceDate || !onMoveOccurrence || !moveTargetDate) return;
    if (moveTargetDate === displayDate) return;
    onMoveOccurrence(eventId, occurrenceDate, moveTargetDate);
    onClose();
  }

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
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onEditEntireSeries ? (
                <button
                  type="button"
                  style={styles.smallBtn}
                  onClick={() => {
                    onEditEntireSeries(eventId!, occurrenceDate!);
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
                    onEditThisAndFuture(eventId!, displayDate);
                    onClose();
                  }}
                >
                  Edit this and future
                </button>
              ) : null}
              {onEditThisOccurrenceOnly ? (
                <button
                  type="button"
                  style={styles.smallBtn}
                  onClick={() => {
                    onEditThisOccurrenceOnly(eventId!, occurrenceDate!);
                    onClose();
                  }}
                >
                  Edit this occurrence only
                </button>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onSkipOccurrence ? (
                <button type="button" style={styles.smallBtn} onClick={handleSkip}>
                  Skip this occurrence
                </button>
              ) : null}
              {onDeleteOccurrencesFromDate ? (
                <button type="button" style={styles.smallBtn} onClick={handleDeleteFuture}>
                  Delete this and future
                </button>
              ) : null}
            </div>
            {onMoveOccurrence ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ ...styles.label, flex: 1, minWidth: 140 }}>
                  Move to date
                  <input
                    type="date"
                    value={moveTargetDate}
                    onChange={(e) => setMoveTargetDate(e.target.value)}
                    style={styles.input}
                  />
                </label>
                <button
                  type="button"
                  style={styles.smallBtn}
                  onClick={handleMove}
                  disabled={!moveTargetDate || moveTargetDate === displayDate}
                >
                  Move
                </button>
              </div>
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
