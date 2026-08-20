import { CALENDAR_CATEGORY_KEYS, type CalendarCategoryKey } from "./calendarColors";
import type {
  CalendarCookingTypeFilter,
  CalendarFitnessTypeFilter,
  CalendarViewMode,
} from "./calendarView";
import {
  CALENDAR_COOKING_TYPE_FILTERS,
  CALENDAR_EVENT_TYPE_FILTERS,
  CALENDAR_FITNESS_TYPE_FILTERS,
} from "./calendarView";
import type { EventType } from "./model";

export type CalendarViewSurface = "dashboard" | "calendarPage";
export type CalendarViewViewport = "mobile" | "desktop";

/** Client-local storage key for category/type filter toggles (not synced). */
export const CALENDAR_FILTER_PREFERENCES_KEY = "pa.calendar.filters.v1";

export type CalendarFilterPreferences = {
  hiddenCategories: CalendarCategoryKey[];
  hiddenEventSubcategories: EventType[];
  hiddenFitnessTypes: CalendarFitnessTypeFilter[];
  hiddenCookingTypes: CalendarCookingTypeFilter[];
};

const LEGACY_DASHBOARD_VIEW_MODE_KEY = "pa.dashboardCalendar.viewMode.v1";

function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === "month" || value === "week" || value === "threeDay";
}

/** Client-local storage key for calendar view mode (not synced). */
export function calendarViewPersistenceKey(
  surface: CalendarViewSurface,
  viewport: CalendarViewViewport
): string {
  return `pa.${surface}.viewMode.v2.${viewport}`;
}

function readStoredMode(key: string): CalendarViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    return isCalendarViewMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Reads the persisted calendar view for a surface + viewport. Falls back to the
 * legacy dashboard v1 key when no v2 value exists yet.
 */
export function readCalendarViewMode(
  surface: CalendarViewSurface,
  viewport: CalendarViewViewport,
  fallback: CalendarViewMode
): CalendarViewMode {
  const key = calendarViewPersistenceKey(surface, viewport);
  const stored = readStoredMode(key);
  if (stored) return stored;

  if (surface === "dashboard") {
    const legacy = readStoredMode(LEGACY_DASHBOARD_VIEW_MODE_KEY);
    if (legacy) return legacy;
  }

  return fallback;
}

export function persistCalendarViewMode(
  surface: CalendarViewSurface,
  viewport: CalendarViewViewport,
  mode: CalendarViewMode
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(calendarViewPersistenceKey(surface, viewport), mode);
  } catch {
    // localStorage may be unavailable; preference stays in memory for this session.
  }
}

export function defaultCalendarFilterPreferences(): CalendarFilterPreferences {
  return {
    hiddenCategories: [],
    hiddenEventSubcategories: [],
    hiddenFitnessTypes: [],
    hiddenCookingTypes: [],
  };
}

function pickAllowlisted<T extends string>(raw: unknown, allowlist: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(allowlist);
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || !allowed.has(value)) continue;
    const typed = value as T;
    if (seen.has(typed)) continue;
    seen.add(typed);
    result.push(typed);
  }
  return result;
}

/** Lenient parse for untrusted localStorage JSON. Unknown keys and values are dropped. */
export function normalizeCalendarFilterPreferences(raw: unknown): CalendarFilterPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultCalendarFilterPreferences();
  }
  const obj = raw as Record<string, unknown>;
  return {
    hiddenCategories: pickAllowlisted(obj.hiddenCategories, CALENDAR_CATEGORY_KEYS),
    hiddenEventSubcategories: pickAllowlisted(
      obj.hiddenEventSubcategories,
      CALENDAR_EVENT_TYPE_FILTERS
    ),
    hiddenFitnessTypes: pickAllowlisted(obj.hiddenFitnessTypes, CALENDAR_FITNESS_TYPE_FILTERS),
    hiddenCookingTypes: pickAllowlisted(obj.hiddenCookingTypes, CALENDAR_COOKING_TYPE_FILTERS),
  };
}

export function readCalendarFilterPreferences(): CalendarFilterPreferences {
  if (typeof window === "undefined") return defaultCalendarFilterPreferences();
  try {
    const stored = window.localStorage.getItem(CALENDAR_FILTER_PREFERENCES_KEY);
    if (!stored) return defaultCalendarFilterPreferences();
    return normalizeCalendarFilterPreferences(JSON.parse(stored));
  } catch {
    return defaultCalendarFilterPreferences();
  }
}

export function persistCalendarFilterPreferences(prefs: CalendarFilterPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_FILTER_PREFERENCES_KEY,
      JSON.stringify(normalizeCalendarFilterPreferences(prefs))
    );
  } catch {
    // localStorage may be unavailable; preference stays in memory for this session.
  }
}
