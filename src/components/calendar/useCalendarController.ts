import { useEffect, useMemo, useState } from "react";
import {
  buildCalendarItemsForRange,
  groupCalendarItemsByDate,
  type CalendarItem,
} from "../../core/calendar";
import type { CalendarCategoryKey } from "../../core/calendarColors";
import {
  computeMonthVisibleRange,
  computeThreeDayScrollRange,
  computeWeekRange,
  filterCalendarItems,
  formatMonthTitle,
  formatThreeDayRangeTitle,
  formatWeekRangeTitle,
  monthAnchorFromKey,
  shiftMonth,
  shiftThreeDay,
  shiftWeek,
  THREE_DAY_VISIBLE_COUNT,
  type CalendarViewMode,
} from "../../core/calendarView";
import type { EventType } from "../../core/model";
import {
  persistCalendarViewMode,
  readCalendarViewMode,
  type CalendarViewSurface,
  type CalendarViewViewport,
} from "../../core/calendarViewPreferences";
import { THREE_DAY_SCROLL_BUFFER_DAYS } from "./calendarLayoutConstants";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession, JobApplication } from "../../core/model";

export type UseCalendarControllerInput = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  jobApplications: JobApplication[];
  /** Local `YYYY-MM-DD` for "today" — drives the default anchor and Today button. */
  todayKey: string;
  initialViewMode?: CalendarViewMode;
  /**
   * When set with {@link viewModeViewport}, the month/week/3-day view mode is
   * persisted per surface and viewport (client-local, not synced).
   */
  viewModeSurface?: CalendarViewSurface;
  viewModeViewport?: CalendarViewViewport;
};

export type CalendarController = {
  viewMode: CalendarViewMode;
  anchorKey: string;
  hiddenCategories: ReadonlySet<CalendarCategoryKey>;
  hiddenEventSubcategories: ReadonlySet<EventType>;
  selectedItem: CalendarItem | null;
  itemsByDate: Map<string, CalendarItem[]>;
  title: string;
  setSelectedItem: (item: CalendarItem | null) => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleToday: () => void;
  handleViewModeChange: (mode: CalendarViewMode) => void;
  handleSelectDay: (dateKey: string) => void;
  handleThreeDayAnchorChange: (dateKey: string) => void;
  toggleCategory: (category: CalendarCategoryKey) => void;
  toggleEventSubcategory: (eventType: EventType) => void;
};

function getViewModePersistenceContext(
  surface: CalendarViewSurface | undefined,
  viewport: CalendarViewViewport | undefined
): { surface: CalendarViewSurface; viewport: CalendarViewViewport } | null {
  if (surface === undefined || viewport === undefined) return null;
  return { surface, viewport };
}

/**
 * Headless calendar state shared by `CalendarPage` and the dashboard calendar
 * widget. All date math stays in the pure, tested `calendarView` / `calendar`
 * modules; this hook only wires React state to them so the calendar logic is
 * not duplicated across surfaces.
 */
export function useCalendarController({
  skills,
  events,
  people,
  jobApplications,
  workoutSessions,
  workoutPlans,
  todayKey,
  initialViewMode = "week",
  viewModeSurface,
  viewModeViewport,
}: UseCalendarControllerInput): CalendarController {
  const persistViewMode = (mode: CalendarViewMode) => {
    const ctx = getViewModePersistenceContext(viewModeSurface, viewModeViewport);
    if (!ctx) return;
    persistCalendarViewMode(ctx.surface, ctx.viewport, mode);
  };

  const readInitialViewMode = (): CalendarViewMode => {
    const ctx = getViewModePersistenceContext(viewModeSurface, viewModeViewport);
    if (!ctx) return initialViewMode;
    return readCalendarViewMode(ctx.surface, ctx.viewport, initialViewMode);
  };

  const [viewMode, setViewModeState] = useState<CalendarViewMode>(readInitialViewMode);
  const [anchorKey, setAnchorKey] = useState<string>(todayKey);
  const [hiddenCategories, setHiddenCategories] = useState<Set<CalendarCategoryKey>>(
    () => new Set()
  );
  const [hiddenEventSubcategories, setHiddenEventSubcategories] = useState<Set<EventType>>(
    () => new Set()
  );
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  useEffect(() => {
    const ctx = getViewModePersistenceContext(viewModeSurface, viewModeViewport);
    if (!ctx) return;
    setViewModeState(readCalendarViewMode(ctx.surface, ctx.viewport, initialViewMode));
  }, [viewModeSurface, viewModeViewport, initialViewMode]);

  function setViewMode(mode: CalendarViewMode) {
    setViewModeState(mode);
    persistViewMode(mode);
  }

  const range = useMemo(() => {
    if (viewMode === "month") return computeMonthVisibleRange(anchorKey);
    if (viewMode === "week") return computeWeekRange(anchorKey);
    return computeThreeDayScrollRange(todayKey, THREE_DAY_SCROLL_BUFFER_DAYS);
  }, [viewMode, anchorKey, todayKey]);

  const itemsByDate = useMemo(() => {
    const items = buildCalendarItemsForRange(
      {
        startDate: range.startDate,
        endDate: range.endDate,
        skills,
        events,
        people,
        jobApplications,
        workoutSessions,
        workoutPlans,
      },
      { includeFitnessHistory: true, includeWorkoutSchedules: true }
    );
    const visible = filterCalendarItems(items, hiddenCategories, hiddenEventSubcategories);
    return groupCalendarItemsByDate(visible);
  }, [
    range,
    skills,
    events,
    people,
    jobApplications,
    workoutSessions,
    workoutPlans,
    hiddenCategories,
    hiddenEventSubcategories,
  ]);

  const title = useMemo(() => {
    if (viewMode === "month") return formatMonthTitle(anchorKey);
    if (viewMode === "threeDay") return formatThreeDayRangeTitle(anchorKey);
    return formatWeekRangeTitle(anchorKey);
  }, [viewMode, anchorKey]);

  function handlePrev() {
    setAnchorKey((current) => {
      if (viewMode === "month") return shiftMonth(current, -1);
      if (viewMode === "threeDay") return shiftThreeDay(current, -THREE_DAY_VISIBLE_COUNT);
      return shiftWeek(current, -1);
    });
  }

  function handleNext() {
    setAnchorKey((current) => {
      if (viewMode === "month") return shiftMonth(current, 1);
      if (viewMode === "threeDay") return shiftThreeDay(current, THREE_DAY_VISIBLE_COUNT);
      return shiftWeek(current, 1);
    });
  }

  function handleToday() {
    if (viewMode === "month") {
      setAnchorKey(monthAnchorFromKey(todayKey));
      return;
    }
    setAnchorKey(todayKey);
  }

  function handleViewModeChange(mode: CalendarViewMode) {
    setViewMode(mode);
    setAnchorKey((current) => {
      if (mode === "month") return monthAnchorFromKey(current);
      if (mode === "threeDay") return todayKey;
      return current;
    });
  }

  function handleSelectDay(dateKey: string) {
    setViewMode("week");
    setAnchorKey(dateKey);
  }

  function handleThreeDayAnchorChange(dateKey: string) {
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

  function toggleEventSubcategory(eventType: EventType) {
    setHiddenEventSubcategories((current) => {
      const next = new Set(current);
      if (next.has(eventType)) {
        next.delete(eventType);
      } else {
        next.add(eventType);
      }
      return next;
    });
  }

  return {
    viewMode,
    anchorKey,
    hiddenCategories,
    hiddenEventSubcategories,
    selectedItem,
    itemsByDate,
    title,
    setSelectedItem,
    handlePrev,
    handleNext,
    handleToday,
    handleViewModeChange,
    handleSelectDay,
    handleThreeDayAnchorChange,
    toggleCategory,
    toggleEventSubcategory,
  };
}
