import { useEffect, useRef, useState } from "react";
import type { CalendarCompletionVisual, CalendarItem } from "../../core/calendar";
import {
  resolveCalendarItemColor,
  type CalendarColorPreferences,
} from "../../core/calendarColors";
import {
  formatItemTimeLabel,
  formatSourceTypeLabel,
} from "../../core/calendarView";
import {
  APPLICATION_STATUS_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
} from "../../core/career";
import type { FitnessFocus } from "../../core/fitness";
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
  onOpenCareer?: () => void;
  onOpenFitness?: (focus?: FitnessFocus) => void;
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

function completionStatusLabel(visual?: CalendarCompletionVisual): string | undefined {
  if (visual === "completed") return "Complete";
  if (visual === "in_progress") return "In progress";
  if (visual === "planned") return "Planned";
  return undefined;
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
  onOpenCareer,
  onOpenFitness,
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

  const isCareerInterview = item.sourceMeta.kind === "applicationInterview";
  const isSupplementIntake = item.sourceMeta.kind === "supplementIntake";
  const supplementStatus = isSupplementIntake
    ? completionStatusLabel(item.completionVisual)
    : undefined;

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
          {item.sourceMeta.kind === "supplementIntake" ? (
            <>
              <DetailRow label="Phase" value={item.sourceMeta.phaseChip} />
              <DetailRow label="Dose" value={item.sourceMeta.doseSummary} />
              {supplementStatus ? (
                <DetailRow label="Status" value={supplementStatus} />
              ) : null}
              <DetailRow
                label="Progress"
                value={`${item.sourceMeta.takenDoses}/${item.sourceMeta.plannedDoses}`}
              />
            </>
          ) : null}
          {item.sourceMeta.kind !== "supplementIntake" &&
          item.completionVisual === "in_progress" &&
          item.progressLabel ? (
            <DetailRow label="Progress" value={item.progressLabel} />
          ) : null}
          {item.sourceMeta.kind === "applicationInterview" ? (
            <>
              <DetailRow label="Company" value={item.sourceMeta.company} />
              <DetailRow label="Role" value={item.sourceMeta.roleTitle} />
              <DetailRow
                label="Stage"
                value={APPLICATION_STATUS_LABELS[item.sourceMeta.stage]}
              />
              {item.sourceMeta.format ? (
                <DetailRow
                  label="Format"
                  value={INTERVIEW_FORMAT_LABELS[item.sourceMeta.format]}
                />
              ) : null}
              {item.sourceMeta.outcome ? (
                <DetailRow
                  label="Outcome"
                  value={INTERVIEW_OUTCOME_LABELS[item.sourceMeta.outcome]}
                />
              ) : null}
            </>
          ) : null}
          {item.description ? (
            <DetailRow label="Details" value={item.description} />
          ) : null}
        </div>

        {isCareerInterview && onOpenCareer ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={styles.smallBtn} onClick={onOpenCareer}>
              Open in Career
            </button>
          </div>
        ) : null}

        {isSupplementIntake && onOpenFitness ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={styles.smallBtn}
              onClick={() => {
                if (item.sourceMeta.kind !== "supplementIntake") return;
                onOpenFitness({
                  kind: "supplement",
                  date: item.date,
                  protocolId: item.sourceMeta.protocolId,
                });
                onClose();
              }}
            >
              Open in Fitness
            </button>
          </div>
        ) : null}

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
        ) : isCareerInterview ? (
          <p style={{ ...styles.helpText, margin: 0 }}>
            Edit this interview on the Career page.
          </p>
        ) : item.sourceMeta.kind === "supplementIntake" ? (
          <p style={{ ...styles.helpText, margin: 0 }}>
            Read-only preview. Log doses on Fitness or the dashboard.
          </p>
        ) : (
          <p style={{ ...styles.helpText, margin: 0 }}>
            Read-only preview. Open the source page to make changes.
          </p>
        )}
      </div>
    </div>
  );
}
