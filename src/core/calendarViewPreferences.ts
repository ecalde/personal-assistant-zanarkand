import type { CalendarViewMode } from "./calendarView";

export type CalendarViewSurface = "dashboard" | "calendarPage";
export type CalendarViewViewport = "mobile" | "desktop";

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
