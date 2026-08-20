/**
 * Device-local persistence for cooking notification prompt + shown keys.
 * Permission itself lives in the browser; this only remembers "not now"
 * and which schedule items already fired so refresh does not re-notify.
 */
import {
  pruneShownNotificationRecords,
  shownNotificationKeySet,
  type ShownNotificationRecord,
} from "./cookingNotifications";

export const COOKING_NOTIFICATION_PROMPT_KEY = "pa.cooking.notificationsPrompt.v1";
export const COOKING_NOTIFICATION_SHOWN_KEY = "pa.cooking.notificationsShown.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadCookingNotificationPromptDismissed(): boolean {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(COOKING_NOTIFICATION_PROMPT_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function saveCookingNotificationPromptDismissed(dismissed: boolean): void {
  if (!canUseStorage()) return;
  try {
    if (dismissed) {
      window.localStorage.setItem(COOKING_NOTIFICATION_PROMPT_KEY, "dismissed");
    } else {
      window.localStorage.removeItem(COOKING_NOTIFICATION_PROMPT_KEY);
    }
  } catch {
    // best-effort
  }
}

export function loadShownNotificationRecords(now: Date | string | number = Date.now()): ShownNotificationRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(COOKING_NOTIFICATION_SHOWN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneShownNotificationRecords(parsed as ShownNotificationRecord[], now);
  } catch {
    return [];
  }
}

export function loadShownNotificationKeys(now: Date | string | number = Date.now()): Set<string> {
  return shownNotificationKeySet(loadShownNotificationRecords(now));
}

export function saveShownNotificationKeys(
  keys: ReadonlySet<string>,
  fireAtByKey: ReadonlyMap<string, string>,
  now: Date | string | number = Date.now()
): void {
  if (!canUseStorage()) return;
  const records: ShownNotificationRecord[] = [];
  for (const key of keys) {
    const fireAtIso = fireAtByKey.get(key);
    if (!fireAtIso) continue;
    records.push({ key, fireAtIso });
  }
  try {
    window.localStorage.setItem(
      COOKING_NOTIFICATION_SHOWN_KEY,
      JSON.stringify(pruneShownNotificationRecords(records, now))
    );
  } catch {
    // best-effort
  }
}
