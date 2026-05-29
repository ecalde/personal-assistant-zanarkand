import { useMemo, useState } from "react";
import {
  buildCalendarItemsForRange,
  groupCalendarItemsByDate,
  type CalendarItem,
} from "../core/calendar";
import type {
  CalendarCategoryKey,
  CalendarColorPreferences,
} from "../core/calendarColors";
import {
  computeMonthVisibleRange,
  computeWeekRange,
  filterItemsByHiddenCategories,
  formatMonthTitle,
  formatWeekRangeTitle,
  monthAnchorFromKey,
  shiftMonth,
  shiftWeek,
  type CalendarViewMode,
} from "../core/calendarView";
import { formatLocalDateKey } from "../core/timeline";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession } from "../core/model";
import { CalendarCategorySidebar } from "../components/calendar/CalendarCategorySidebar";
import { CalendarItemDetailModal } from "../components/calendar/CalendarItemDetailModal";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { MonthView } from "../components/calendar/MonthView";
import { WeekView } from "../components/calendar/WeekView";
import { styles } from "../ui/appStyles";

export type CalendarPageProps = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  calendarPreferences?: CalendarColorPreferences;
};

export default function CalendarPage({
  skills,
  events,
  people,
  workoutSessions,
  workoutPlans,
  calendarPreferences,
}: CalendarPageProps) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalDateKey(now), [now]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [anchorKey, setAnchorKey] = useState<string>(todayKey);
  const [hiddenCategories, setHiddenCategories] = useState<Set<CalendarCategoryKey>>(
    () => new Set()
  );
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  const range = useMemo(
    () =>
      viewMode === "month"
        ? computeMonthVisibleRange(anchorKey)
        : computeWeekRange(anchorKey),
    [viewMode, anchorKey]
  );

  const itemsByDate = useMemo(() => {
    const items = buildCalendarItemsForRange(
      {
        startDate: range.startDate,
        endDate: range.endDate,
        skills,
        events,
        people,
        workoutSessions,
        workoutPlans,
      },
      { includeFitnessHistory: true }
    );
    const visible = filterItemsByHiddenCategories(items, hiddenCategories);
    return groupCalendarItemsByDate(visible);
  }, [range, skills, events, people, workoutSessions, workoutPlans, hiddenCategories]);

  const title =
    viewMode === "month"
      ? formatMonthTitle(anchorKey)
      : formatWeekRangeTitle(anchorKey);

  function handlePrev() {
    setAnchorKey((current) =>
      viewMode === "month" ? shiftMonth(current, -1) : shiftWeek(current, -1)
    );
  }

  function handleNext() {
    setAnchorKey((current) =>
      viewMode === "month" ? shiftMonth(current, 1) : shiftWeek(current, 1)
    );
  }

  function handleToday() {
    setAnchorKey(viewMode === "month" ? monthAnchorFromKey(todayKey) : todayKey);
  }

  function handleViewModeChange(mode: CalendarViewMode) {
    setViewMode(mode);
    setAnchorKey((current) =>
      mode === "month" ? monthAnchorFromKey(current) : current
    );
  }

  function handleSelectDay(dateKey: string) {
    setViewMode("week");
    setAnchorKey(dateKey);
  }

  function toggleCategory(category: CalendarCategoryKey) {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <div style={styles.card}>
      <h1 style={{ ...styles.cardTitle, margin: "0 0 12px 0" }}>Calendar</h1>

      <div style={styles.calendarLayout}>
        <div style={styles.calendarMain}>
          <CalendarToolbar
            title={title}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
          />

          {viewMode === "month" ? (
            <MonthView
              monthAnchorKey={anchorKey}
              todayKey={todayKey}
              itemsByDate={itemsByDate}
              preferences={calendarPreferences}
              onSelectItem={setSelectedItem}
              onSelectDay={handleSelectDay}
            />
          ) : (
            <WeekView
              anchorKey={anchorKey}
              todayKey={todayKey}
              itemsByDate={itemsByDate}
              preferences={calendarPreferences}
              onSelectItem={setSelectedItem}
              nowMinutes={nowMinutes}
            />
          )}
        </div>

        <CalendarCategorySidebar
          hiddenCategories={hiddenCategories}
          onToggleCategory={toggleCategory}
          preferences={calendarPreferences}
        />
      </div>

      {selectedItem ? (
        <CalendarItemDetailModal
          item={selectedItem}
          preferences={calendarPreferences}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}
