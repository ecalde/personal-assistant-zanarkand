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
}: CalendarItemDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const color = resolveCalendarItemColor(item, preferences);
  const timeLabel = formatItemTimeLabel(item);

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

        <p style={{ ...styles.helpText, margin: 0 }}>
          Read-only preview. Open the source page to make changes.
        </p>
      </div>
    </div>
  );
}
