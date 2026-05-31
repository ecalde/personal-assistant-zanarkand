/**
 * localStorage persistence for Aether Profile appearance preferences.
 *
 * Appearance is a per-device UI preference (like the dashboard calendar view
 * mode), so it is stored under a single browser-scoped key rather than inside
 * the user-scoped synced `AppPayload`. This keeps the Settings foundation phase
 * free of any Supabase schema changes.
 *
 * Future: a cloud-synced `appearance_preferences` singleton (mirroring
 * `calendar_preferences`) could replace/augment this so a user's theme follows
 * them across devices. The normalization in `theme.ts` already guards against
 * legacy/invalid shapes, so adopting cloud sync later is non-breaking.
 */
import {
  defaultAppearancePreferences,
  normalizeAppearancePreferences,
  type AppearancePreferences,
} from "./theme";

export const APPEARANCE_STORAGE_KEY = "pa.appearance.v1";

export function loadAppearancePreferences(): AppearancePreferences {
  if (typeof window === "undefined") {
    return defaultAppearancePreferences();
  }
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) {
      return defaultAppearancePreferences();
    }
    return normalizeAppearancePreferences(JSON.parse(raw));
  } catch {
    // Corrupt JSON or unavailable storage (private mode / quota): fall back to
    // defaults rather than failing the UI.
    return defaultAppearancePreferences();
  }
}

export function saveAppearancePreferences(prefs: AppearancePreferences): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(normalizeAppearancePreferences(prefs))
    );
  } catch {
    // Persistence is best-effort; the in-memory preference still applies for
    // the current session if storage is unavailable.
  }
}
