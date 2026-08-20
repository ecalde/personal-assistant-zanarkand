/**
 * Pure cooking Web Notification scheduling.
 *
 * Derives timer-done and "time to start cooking" items from sessions, and
 * decides when a Web Notification is allowed vs falling back to in-app Daily
 * Focus / guided-mode alerts. Browser APIs live in `src/lib/webNotifications.ts`.
 */

import type { CookingSession, CookingTimer } from "./model";

export type CookingNotificationKind = "timer_done" | "start_cooking";

export type CookingNotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export type CookingNotificationItem = {
  id: string;
  kind: CookingNotificationKind;
  title: string;
  body: string;
  fireAtIso: string;
  sessionId: string;
  recipeTitle: string;
  timerId?: string;
};

export type ShownNotificationRecord = {
  key: string;
  fireAtIso: string;
};

const SHOWN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function toMs(now: Date | string | number): number {
  if (typeof now === "number") return now;
  if (typeof now === "string") return Date.parse(now);
  return now.getTime();
}

function isValidIso(value: string | undefined): value is string {
  if (!value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function resolveCookingNotificationPermission(
  notificationApiSupported: boolean,
  permission: string | undefined
): CookingNotificationPermissionState {
  if (!notificationApiSupported) return "unsupported";
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

export function canUseWebNotifications(
  permission: CookingNotificationPermissionState
): boolean {
  return permission === "granted";
}

export function usesInAppNotificationFallback(
  permission: CookingNotificationPermissionState
): boolean {
  return permission !== "granted";
}

export function shouldPromptForCookingNotifications(
  permission: CookingNotificationPermissionState,
  promptDismissed: boolean
): boolean {
  return permission === "default" && !promptDismissed;
}

/**
 * OS notifications fire when the tab is backgrounded. Foreground cooking
 * already has guided-mode alerts + Daily Focus; those remain the fallback
 * when permission is missing or the tab is visible.
 */
export function shouldShowWebNotification(input: {
  permission: CookingNotificationPermissionState;
  documentHidden: boolean;
  alreadyShown: boolean;
}): boolean {
  if (input.alreadyShown) return false;
  if (!canUseWebNotifications(input.permission)) return false;
  return input.documentHidden;
}

export function cookingNotificationId(kind: CookingNotificationKind, sessionId: string, timerId?: string): string {
  if (kind === "timer_done") {
    return `cooking:timer:${sessionId}:${timerId ?? "unknown"}`;
  }
  return `cooking:planned:${sessionId}`;
}

export function cookingNotificationShownKey(item: Pick<CookingNotificationItem, "id" | "fireAtIso">): string {
  return `${item.id}:${item.fireAtIso}`;
}

export function pruneShownNotificationRecords(
  records: readonly ShownNotificationRecord[],
  now: Date | string | number,
  maxAgeMs = SHOWN_MAX_AGE_MS
): ShownNotificationRecord[] {
  const nowMs = toMs(now);
  const seen = new Set<string>();
  const next: ShownNotificationRecord[] = [];
  for (const record of records) {
    if (!record || typeof record.key !== "string" || typeof record.fireAtIso !== "string") continue;
    const fireAt = Date.parse(record.fireAtIso);
    if (!Number.isFinite(fireAt)) continue;
    if (nowMs - fireAt > maxAgeMs) continue;
    if (seen.has(record.key)) continue;
    seen.add(record.key);
    next.push({ key: record.key, fireAtIso: record.fireAtIso });
  }
  return next;
}

export function shownNotificationKeySet(
  records: readonly ShownNotificationRecord[]
): Set<string> {
  return new Set(records.map((record) => record.key));
}

function timerDoneItem(session: CookingSession, timer: CookingTimer): CookingNotificationItem | undefined {
  if (timer.status !== "running" || !isValidIso(timer.endsAtIso)) return undefined;
  const item: CookingNotificationItem = {
    id: cookingNotificationId("timer_done", session.id, timer.id),
    kind: "timer_done",
    title: `${timer.label} is done`,
    body: `Timer finished while cooking ${session.recipeTitle}.`,
    fireAtIso: timer.endsAtIso,
    sessionId: session.id,
    recipeTitle: session.recipeTitle,
    timerId: timer.id,
  };
  return item;
}

function startCookingItem(session: CookingSession): CookingNotificationItem | undefined {
  if (session.status !== "planned" || !isValidIso(session.startedAtIso)) return undefined;
  return {
    id: cookingNotificationId("start_cooking", session.id),
    kind: "start_cooking",
    title: `Time to cook ${session.recipeTitle}`,
    body: "Your planned cook is ready to start.",
    fireAtIso: session.startedAtIso,
    sessionId: session.id,
    recipeTitle: session.recipeTitle,
  };
}

export function buildCookingNotificationSchedule(
  sessions: readonly CookingSession[]
): CookingNotificationItem[] {
  const items: CookingNotificationItem[] = [];
  for (const session of sessions) {
    if (session.status === "in_progress") {
      for (const timer of session.timers) {
        const item = timerDoneItem(session, timer);
        if (item) items.push(item);
      }
    }
    if (session.status === "planned") {
      const item = startCookingItem(session);
      if (item) items.push(item);
    }
  }
  return items.sort((a, b) => {
    const byTime = a.fireAtIso.localeCompare(b.fireAtIso);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

export function cookingNotificationScheduleSignature(
  sessions: readonly CookingSession[]
): string {
  return buildCookingNotificationSchedule(sessions)
    .map((item) => cookingNotificationShownKey(item))
    .join("|");
}

export function dueCookingNotifications(
  schedule: readonly CookingNotificationItem[],
  now: Date | string | number,
  shownKeys: ReadonlySet<string>
): CookingNotificationItem[] {
  const nowMs = toMs(now);
  return schedule.filter((item) => {
    const fireAt = Date.parse(item.fireAtIso);
    if (!Number.isFinite(fireAt) || fireAt > nowMs) return false;
    return !shownKeys.has(cookingNotificationShownKey(item));
  });
}

export function pendingCookingNotifications(
  schedule: readonly CookingNotificationItem[],
  now: Date | string | number
): CookingNotificationItem[] {
  const nowMs = toMs(now);
  return schedule.filter((item) => {
    const fireAt = Date.parse(item.fireAtIso);
    return Number.isFinite(fireAt) && fireAt > nowMs;
  });
}

export function nextCookingNotificationDelayMs(
  pending: readonly CookingNotificationItem[],
  now: Date | string | number,
  maxDelayMs: number
): number | undefined {
  const next = pending[0];
  if (!next) return undefined;
  const fireAt = Date.parse(next.fireAtIso);
  if (!Number.isFinite(fireAt)) return undefined;
  const delay = fireAt - toMs(now);
  if (!Number.isFinite(delay)) return undefined;
  return Math.min(Math.max(0, delay), Math.max(0, maxDelayMs));
}
