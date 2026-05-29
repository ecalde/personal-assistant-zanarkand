import { useEffect, useState } from "react";

/** Minutes elapsed since local midnight for the given moment. */
export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

const TICK_INTERVAL_MS = 60_000;

/**
 * Live minutes-from-midnight, updated once per minute. Used by the calendar
 * week view's current-time indicator. Kept local to the calendar widget so the
 * tick never re-runs the dashboard's heavier derived computations.
 */
export function useNowMinutes(): number {
  const [minutes, setMinutes] = useState<number>(() => minutesFromMidnight(new Date()));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const intervalId = window.setInterval(() => {
      setMinutes(minutesFromMidnight(new Date()));
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return minutes;
}
