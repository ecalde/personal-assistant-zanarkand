import { useMemo } from "react";
import type {
  CalendarColorPreferences,
} from "../core/calendarColors";
import { formatLocalDateKey } from "../core/timeline";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession } from "../core/model";
import { CalendarCategorySidebar } from "../components/calendar/CalendarCategorySidebar";
import { CalendarItemDetailModal } from "../components/calendar/CalendarItemDetailModal";
import { CalendarSettingsSection } from "../components/calendar/CalendarSettingsSection";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { MonthView } from "../components/calendar/MonthView";
import { WeekView } from "../components/calendar/WeekView";
import { useCalendarController } from "../components/calendar/useCalendarController";
import type { EventSeriesEditScope } from "../core/eventSeries";
import { styles } from "../ui/appStyles";

export type CalendarPageProps = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  calendarPreferences?: CalendarColorPreferences;
  onSaveCalendarPreferences: (prefs: CalendarColorPreferences | undefined) => void;
  onEditOccurrence?: (
    eventId: string,
    scope: EventSeriesEditScope,
    splitDate: string
  ) => void;
};

export default function CalendarPage({
  skills,
  events,
  people,
  workoutSessions,
  workoutPlans,
  calendarPreferences,
  onSaveCalendarPreferences,
  onEditOccurrence,
}: CalendarPageProps) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalDateKey(now), [now]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const calendar = useCalendarController({
    skills,
    events,
    people,
    workoutSessions,
    workoutPlans,
    todayKey,
  });

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={styles.card}>
        <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Calendar</h1>

        <div style={styles.calendarLayout}>
          <div style={styles.calendarMain}>
            <CalendarToolbar
              title={calendar.title}
              viewMode={calendar.viewMode}
              onViewModeChange={calendar.handleViewModeChange}
              onPrev={calendar.handlePrev}
              onNext={calendar.handleNext}
              onToday={calendar.handleToday}
            />

            {calendar.viewMode === "month" ? (
              <MonthView
                monthAnchorKey={calendar.anchorKey}
                todayKey={todayKey}
                itemsByDate={calendar.itemsByDate}
                preferences={calendarPreferences}
                onSelectItem={calendar.setSelectedItem}
                onSelectDay={calendar.handleSelectDay}
              />
            ) : (
              <WeekView
                anchorKey={calendar.anchorKey}
                todayKey={todayKey}
                itemsByDate={calendar.itemsByDate}
                preferences={calendarPreferences}
                onSelectItem={calendar.setSelectedItem}
                nowMinutes={nowMinutes}
              />
            )}
          </div>

          <CalendarCategorySidebar
            hiddenCategories={calendar.hiddenCategories}
            onToggleCategory={calendar.toggleCategory}
            preferences={calendarPreferences}
          />
        </div>

        {calendar.selectedItem ? (
          <CalendarItemDetailModal
            item={calendar.selectedItem}
            preferences={calendarPreferences}
            onClose={() => calendar.setSelectedItem(null)}
            onEditEntireSeries={
              onEditOccurrence
                ? (eventId, occurrenceDate) =>
                    onEditOccurrence(eventId, "entire", occurrenceDate)
                : undefined
            }
            onEditThisAndFuture={
              onEditOccurrence
                ? (eventId, splitDate) =>
                    onEditOccurrence(eventId, "thisAndFuture", splitDate)
                : undefined
            }
          />
        ) : null}
      </div>

      <CalendarSettingsSection
        key={JSON.stringify(calendarPreferences ?? null)}
        preferences={calendarPreferences}
        onSave={onSaveCalendarPreferences}
      />
    </div>
  );
}
