import { useMemo, useState } from "react";
import {
  buildCalendarItemsForRange,
  groupCalendarItemsByDate,
  type CalendarItem,
} from "../../core/calendar";
import type { CalendarCategoryKey } from "../../core/calendarColors";
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
} from "../../core/calendarView";
import type { LifeEvent, Person, Skill, WorkoutPlan, WorkoutSession } from "../../core/model";

export type UseCalendarControllerInput = {
  skills: Skill[];
  events: LifeEvent[];
  people: Person[];
  workoutSessions: WorkoutSession[];
  workoutPlans: WorkoutPlan[];
  /** Local `YYYY-MM-DD` for "today" — drives the default anchor and Today button. */
  todayKey: string;
  initialViewMode?: CalendarViewMode;
  /**
   * When set, the month/week view mode is persisted to `localStorage` under
   * this key so it survives reloads. UI-only preference — not part of the
   * synced `AppPayload`.
   */
  viewModePersistenceKey?: string;
};

export type CalendarController = {
  viewMode: CalendarViewMode;
  anchorKey: string;
  hiddenCategories: ReadonlySet<CalendarCategoryKey>;
  selectedItem: CalendarItem | null;
  itemsByDate: Map<string, CalendarItem[]>;
  title: string;
  setSelectedItem: (item: CalendarItem | null) => void;
  handlePrev: () => void;
  handleNext: () => void;
  handleToday: () => void;
  handleViewModeChange: (mode: CalendarViewMode) => void;
  handleSelectDay: (dateKey: string) => void;
  toggleCategory: (category: CalendarCategoryKey) => void;
};

function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === "month" || value === "week";
}

function readPersistedViewMode(
  key: string | undefined,
  fallback: CalendarViewMode
): CalendarViewMode {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return isCalendarViewMode(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function persistViewMode(key: string | undefined, mode: CalendarViewMode): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // localStorage may be unavailable (private mode / quota); the view mode
    // simply stays in memory for this session rather than failing the UI.
  }
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
  workoutSessions,
  workoutPlans,
  todayKey,
  initialViewMode = "week",
  viewModePersistenceKey,
}: UseCalendarControllerInput): CalendarController {
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(() =>
    readPersistedViewMode(viewModePersistenceKey, initialViewMode)
  );
  const [anchorKey, setAnchorKey] = useState<string>(todayKey);
  const [hiddenCategories, setHiddenCategories] = useState<Set<CalendarCategoryKey>>(
    () => new Set()
  );
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);

  function setViewMode(mode: CalendarViewMode) {
    setViewModeState(mode);
    persistViewMode(viewModePersistenceKey, mode);
  }

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
      { includeFitnessHistory: true, includeWorkoutSchedules: true }
    );
    const visible = filterItemsByHiddenCategories(items, hiddenCategories);
    return groupCalendarItemsByDate(visible);
  }, [range, skills, events, people, workoutSessions, workoutPlans, hiddenCategories]);

  const title =
    viewMode === "month" ? formatMonthTitle(anchorKey) : formatWeekRangeTitle(anchorKey);

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
    setAnchorKey((current) => (mode === "month" ? monthAnchorFromKey(current) : current));
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

  return {
    viewMode,
    anchorKey,
    hiddenCategories,
    selectedItem,
    itemsByDate,
    title,
    setSelectedItem,
    handlePrev,
    handleNext,
    handleToday,
    handleViewModeChange,
    handleSelectDay,
    toggleCategory,
  };
}
