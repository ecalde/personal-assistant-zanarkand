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
  type CalendarCookingTypeFilter,
  type CalendarFitnessTypeFilter,
  type CalendarViewMode,
} from "../../core/calendarView";
import {
  persistCalendarFilterPreferences,
  persistCalendarViewMode,
  readCalendarFilterPreferences,
  readCalendarViewMode,
  type CalendarViewSurface,
  type CalendarViewViewport,
} from "../../core/calendarViewPreferences";
import type {
  CookingSession,
  EventType,
  FitnessType,
  JobApplication,
  LifeEvent,
  Person,
  Recipe,
  Skill,
  SupplementIntakeLog,
  SupplementProtocol,
  WorkoutPlan,
  WorkoutSession,
} from "../../core/model";
import { THREE_DAY_SCROLL_BUFFER_DAYS } from "./calendarLayoutConstants";

export type UseCalendarControllerInput = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  jobApplications: JobApplication[];
  supplementProtocols?: SupplementProtocol[];
  supplementIntakeLogs?: SupplementIntakeLog[];
  cookingSessions?: CookingSession[];
  recipes?: Recipe[];
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
  hiddenFitnessTypes: ReadonlySet<FitnessType>;
  hiddenCookingTypes: ReadonlySet<CalendarCookingTypeFilter>;
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
  toggleFitnessType: (fitnessType: FitnessType) => void;
  toggleCookingType: (cookingType: CalendarCookingTypeFilter) => void;
};

function getViewModePersistenceContext(
  surface: CalendarViewSurface | undefined,
  viewport: CalendarViewViewport | undefined
): { surface: CalendarViewSurface; viewport: CalendarViewViewport } | null {
  if (surface === undefined || viewport === undefined) return null;
  return { surface, viewport };
}

function toggleSetMember<T>(current: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

type CalendarFilterSets = {
  hiddenCategories: Set<CalendarCategoryKey>;
  hiddenEventSubcategories: Set<EventType>;
  hiddenFitnessTypes: Set<FitnessType>;
  hiddenCookingTypes: Set<CalendarCookingTypeFilter>;
};

function readInitialFilterSets(): CalendarFilterSets {
  const prefs = readCalendarFilterPreferences();
  return {
    hiddenCategories: new Set(prefs.hiddenCategories),
    hiddenEventSubcategories: new Set(prefs.hiddenEventSubcategories),
    hiddenFitnessTypes: new Set(prefs.hiddenFitnessTypes),
    hiddenCookingTypes: new Set(prefs.hiddenCookingTypes),
  };
}

function persistFilterSets(filters: CalendarFilterSets): void {
  persistCalendarFilterPreferences({
    hiddenCategories: [...filters.hiddenCategories],
    hiddenEventSubcategories: [...filters.hiddenEventSubcategories],
    hiddenFitnessTypes: [...filters.hiddenFitnessTypes].filter(
      (type): type is CalendarFitnessTypeFilter => type === "workout" || type === "supplement"
    ),
    hiddenCookingTypes: [...filters.hiddenCookingTypes],
  });
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
  supplementProtocols = [],
  supplementIntakeLogs = [],
  cookingSessions = [],
  recipes = [],
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
  const [filters, setFilters] = useState<CalendarFilterSets>(readInitialFilterSets);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const { hiddenCategories, hiddenEventSubcategories, hiddenFitnessTypes, hiddenCookingTypes } =
    filters;

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
        supplementProtocols,
        supplementIntakeLogs,
        cookingSessions,
        recipes,
      },
      {
        includeFitnessHistory: true,
        includeWorkoutSchedules: true,
        includeSupplementSchedule: true,
        includeCookingPlanned: true,
        includeCookingHistory: true,
      }
    );
    const visible = filterCalendarItems(
      items,
      hiddenCategories,
      hiddenEventSubcategories,
      hiddenFitnessTypes,
      hiddenCookingTypes
    );
    return groupCalendarItemsByDate(visible);
  }, [
    range,
    skills,
    events,
    people,
    jobApplications,
    workoutSessions,
    workoutPlans,
    supplementProtocols,
    supplementIntakeLogs,
    cookingSessions,
    recipes,
    hiddenCategories,
    hiddenEventSubcategories,
    hiddenFitnessTypes,
    hiddenCookingTypes,
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
    setFilters((current) => {
      const next = {
        ...current,
        hiddenCategories: toggleSetMember(current.hiddenCategories, category),
      };
      persistFilterSets(next);
      return next;
    });
  }

  function toggleEventSubcategory(eventType: EventType) {
    setFilters((current) => {
      const next = {
        ...current,
        hiddenEventSubcategories: toggleSetMember(current.hiddenEventSubcategories, eventType),
      };
      persistFilterSets(next);
      return next;
    });
  }

  function toggleFitnessType(fitnessType: FitnessType) {
    setFilters((current) => {
      const next = {
        ...current,
        hiddenFitnessTypes: toggleSetMember(current.hiddenFitnessTypes, fitnessType),
      };
      persistFilterSets(next);
      return next;
    });
  }

  function toggleCookingType(cookingType: CalendarCookingTypeFilter) {
    setFilters((current) => {
      const next = {
        ...current,
        hiddenCookingTypes: toggleSetMember(current.hiddenCookingTypes, cookingType),
      };
      persistFilterSets(next);
      return next;
    });
  }

  return {
    viewMode,
    anchorKey,
    hiddenCategories,
    hiddenEventSubcategories,
    hiddenFitnessTypes,
    hiddenCookingTypes,
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
    toggleFitnessType,
    toggleCookingType,
  };
}
