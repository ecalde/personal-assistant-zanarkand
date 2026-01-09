// state.ts contains helper functions to create default data structures

import type { AppPayload, WeeklySchedule, Weekday } from "./model";

// Create an empty weekly schedule (no blocks)
export function defaultWeeklySchedule(): WeeklySchedule {
  const empty: WeeklySchedule = {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
  return empty;
}

// Create a default app payload with empty structures
export function defaultPayload(): AppPayload {
  return {
    skills: [],
    sessions: [],
    overrides: [],
  };
}

// Get a short label for a weekday
export function weekdayLabel(d: Weekday) {
  const map: Record<Weekday, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  return map[d];
}