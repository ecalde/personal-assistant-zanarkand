import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calendarViewPersistenceKey,
  persistCalendarViewMode,
  readCalendarViewMode,
} from "./calendarViewPreferences";

function mockLocalStorage(getItem: ReturnType<typeof vi.fn>, setItem: ReturnType<typeof vi.fn>) {
  const storage = { getItem, setItem };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
}

describe("calendarViewPersistenceKey", () => {
  it("builds separate keys per surface and viewport", () => {
    expect(calendarViewPersistenceKey("dashboard", "mobile")).toBe(
      "pa.dashboard.viewMode.v2.mobile"
    );
    expect(calendarViewPersistenceKey("dashboard", "desktop")).toBe(
      "pa.dashboard.viewMode.v2.desktop"
    );
    expect(calendarViewPersistenceKey("calendarPage", "mobile")).toBe(
      "pa.calendarPage.viewMode.v2.mobile"
    );
  });
});

describe("readCalendarViewMode", () => {
  beforeEach(() => {
    mockLocalStorage(vi.fn(() => null), vi.fn());
  });

  it("returns the v2 value when present", () => {
    const getItem = vi.fn((key: string) =>
      key === "pa.dashboard.viewMode.v2.mobile" ? "threeDay" : null
    );
    mockLocalStorage(getItem, vi.fn());

    expect(readCalendarViewMode("dashboard", "mobile", "week")).toBe("threeDay");
  });

  it("falls back to legacy dashboard v1 key", () => {
    const getItem = vi.fn((key: string) =>
      key === "pa.dashboardCalendar.viewMode.v1" ? "month" : null
    );
    mockLocalStorage(getItem, vi.fn());

    expect(readCalendarViewMode("dashboard", "desktop", "week")).toBe("month");
  });

  it("uses the provided fallback when nothing is stored", () => {
    expect(readCalendarViewMode("calendarPage", "mobile", "week")).toBe("week");
  });
});

describe("persistCalendarViewMode", () => {
  it("writes to the viewport-specific key", () => {
    const setItem = vi.fn();
    mockLocalStorage(vi.fn(() => null), setItem);

    persistCalendarViewMode("calendarPage", "desktop", "threeDay");

    expect(setItem).toHaveBeenCalledWith(
      "pa.calendarPage.viewMode.v2.desktop",
      "threeDay"
    );
  });
});
