import type { CalendarViewMode } from "../../core/calendarView";
import { styles } from "../../ui/appStyles";

export type CalendarToolbarProps = {
  title: string;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function CalendarToolbar({
  title,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
}: CalendarToolbarProps) {
  return (
    <div style={styles.calendarToolbar}>
      <div style={styles.calendarToolbarGroup}>
        <button type="button" style={styles.smallBtn} onClick={onPrev} aria-label="Previous">
          ‹
        </button>
        <button type="button" style={styles.smallBtn} onClick={onToday}>
          Today
        </button>
        <button type="button" style={styles.smallBtn} onClick={onNext} aria-label="Next">
          ›
        </button>
        <h2 style={styles.calendarTitle}>{title}</h2>
      </div>

      <div
        style={styles.calendarToggle}
        role="group"
        aria-label="Calendar view mode"
      >
        <button
          type="button"
          aria-pressed={viewMode === "month"}
          style={{
            ...styles.calendarToggleBtn,
            ...(viewMode === "month" ? styles.calendarToggleBtnActive : {}),
          }}
          onClick={() => onViewModeChange("month")}
        >
          Month
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "week"}
          style={{
            ...styles.calendarToggleBtn,
            ...(viewMode === "week" ? styles.calendarToggleBtnActive : {}),
          }}
          onClick={() => onViewModeChange("week")}
        >
          Week
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "threeDay"}
          style={{
            ...styles.calendarToggleBtn,
            ...(viewMode === "threeDay" ? styles.calendarToggleBtnActive : {}),
          }}
          onClick={() => onViewModeChange("threeDay")}
        >
          3 Day
        </button>
      </div>
    </div>
  );
}
