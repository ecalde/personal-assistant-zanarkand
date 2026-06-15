import type { CalendarColorPreferences } from "../../core/calendarColors";
import { CalendarItemDetailModal } from "../calendar/CalendarItemDetailModal";
import { CalendarToolbar } from "../calendar/CalendarToolbar";
import { MonthView } from "../calendar/MonthView";
import { ThreeDayView } from "../calendar/ThreeDayView";
import { WeekView } from "../calendar/WeekView";
import type { CalendarController } from "../calendar/useCalendarController";
import { useNowMinutes } from "../../ui/useNowMinutes";
import { styles } from "../../ui/appStyles";

export type DashboardCalendarWidgetProps = {
  controller: CalendarController;
  todayKey: string;
  calendarPreferences?: CalendarColorPreferences;
  onOpenCalendar?: () => void;
  onOpenCareer?: () => void;
};

/**
 * Read-only calendar centerpiece for the dashboard. Composes the existing
 * calendar toolbar/views/modal around a shared {@link CalendarController}.
 * The live current-time tick lives here (not in the dashboard page) so the
 * page's heavier derived computations do not re-run every minute.
 */
export function DashboardCalendarWidget({
  controller,
  todayKey,
  calendarPreferences,
  onOpenCalendar,
  onOpenCareer,
}: DashboardCalendarWidgetProps) {
  const nowMinutes = useNowMinutes();

  return (
    <section style={styles.dashboardCalendarCard} aria-label="Calendar">
      <div style={styles.dashboardCalendarHeader}>
        <h2 style={{ ...styles.calendarTitle, fontSize: 16 }}>Calendar</h2>
        {onOpenCalendar ? (
          <button type="button" style={styles.smallBtn} onClick={onOpenCalendar}>
            Open full calendar
          </button>
        ) : null}
      </div>

      <CalendarToolbar
        title={controller.title}
        viewMode={controller.viewMode}
        onViewModeChange={controller.handleViewModeChange}
        onPrev={controller.handlePrev}
        onNext={controller.handleNext}
        onToday={controller.handleToday}
      />

      {controller.viewMode === "month" ? (
        <MonthView
          monthAnchorKey={controller.anchorKey}
          todayKey={todayKey}
          itemsByDate={controller.itemsByDate}
          preferences={calendarPreferences}
          onSelectItem={controller.setSelectedItem}
          onSelectDay={controller.handleSelectDay}
        />
      ) : controller.viewMode === "threeDay" ? (
        <ThreeDayView
          anchorKey={controller.anchorKey}
          todayKey={todayKey}
          itemsByDate={controller.itemsByDate}
          preferences={calendarPreferences}
          onSelectItem={controller.setSelectedItem}
          onAnchorChange={controller.handleThreeDayAnchorChange}
          nowMinutes={nowMinutes}
        />
      ) : (
        <WeekView
          anchorKey={controller.anchorKey}
          todayKey={todayKey}
          itemsByDate={controller.itemsByDate}
          preferences={calendarPreferences}
          onSelectItem={controller.setSelectedItem}
          nowMinutes={nowMinutes}
        />
      )}

      {controller.selectedItem ? (
        <CalendarItemDetailModal
          item={controller.selectedItem}
          preferences={calendarPreferences}
          onClose={() => controller.setSelectedItem(null)}
          onOpenCareer={onOpenCareer}
        />
      ) : null}
    </section>
  );
}
