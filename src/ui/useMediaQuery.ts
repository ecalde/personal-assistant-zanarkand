import { useCallback, useSyncExternalStore } from "react";

/** Desktop breakpoint for the three-column dashboard layout. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

/**
 * Subscribe to a CSS media query via `useSyncExternalStore`. SSR-safe (returns
 * false when `window` / `matchMedia` is unavailable) and tears down its
 * listener automatically.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the viewport is wide enough for the three-column dashboard. */
export function useIsDesktopViewport(): boolean {
  return useMediaQuery(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`);
}
