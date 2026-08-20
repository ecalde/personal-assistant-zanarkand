import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CookingSession } from "../../core/model";
import {
  buildCookingNotificationSchedule,
  cookingNotificationScheduleSignature,
  cookingNotificationShownKey,
  dueCookingNotifications,
  nextCookingNotificationDelayMs,
  pendingCookingNotifications,
  resolveCookingNotificationPermission,
  shouldShowWebNotification,
} from "../../core/cookingNotifications";
import {
  loadShownNotificationKeys,
  saveShownNotificationKeys,
} from "../../core/cookingNotificationStorage";
import {
  readNotificationCapabilities,
  registerCookingServiceWorker,
  showCookingNotification,
  subscribeToNotificationClicks,
} from "../../lib/webNotifications";

/** setTimeout's delay is a 32-bit signed int; clamp to ~24.8 days. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function useCookingNotifications({
  cookingSessions,
  onOpenCooking,
}: {
  cookingSessions: CookingSession[];
  onOpenCooking: () => void;
}): void {
  const shownRef = useRef<Set<string>>(new Set());
  const fireAtByKeyRef = useRef<Map<string, string>>(new Map());
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const signature = useMemo(
    () => cookingNotificationScheduleSignature(cookingSessions),
    [cookingSessions]
  );

  useEffect(() => {
    shownRef.current = loadShownNotificationKeys();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void registerCookingServiceWorker().then((registration) => {
      if (!cancelled && registration) registrationRef.current = registration;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeToNotificationClicks(onOpenCooking), [onOpenCooking]);

  const fireDue = useCallback((now: Date, sessions: CookingSession[]) => {
    const caps = readNotificationCapabilities();
    const permission = resolveCookingNotificationPermission(
      caps.notificationApi,
      caps.permission
    );
    const schedule = buildCookingNotificationSchedule(sessions);
    const due = dueCookingNotifications(schedule, now, shownRef.current);
    if (due.length === 0) return;

    const hidden = typeof document !== "undefined" && document.hidden;
    for (const item of due) {
      const key = cookingNotificationShownKey(item);
      if (
        shouldShowWebNotification({
          permission,
          documentHidden: hidden,
          alreadyShown: shownRef.current.has(key),
        })
      ) {
        void showCookingNotification(item, { registration: registrationRef.current });
      }
      shownRef.current.add(key);
      fireAtByKeyRef.current.set(key, item.fireAtIso);
    }
    saveShownNotificationKeys(shownRef.current, fireAtByKeyRef.current, now);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let timeoutId: number | undefined;
    let cancelled = false;

    const arm = () => {
      if (cancelled) return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = undefined;

      const now = new Date();
      fireDue(now, cookingSessions);

      const schedule = buildCookingNotificationSchedule(cookingSessions);
      const pending = pendingCookingNotifications(schedule, now);
      const delay = nextCookingNotificationDelayMs(pending, now, MAX_TIMEOUT_MS);
      if (delay === undefined) return;
      timeoutId = window.setTimeout(arm, delay);
    };

    arm();
    const onVisibility = () => arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signature, fireDue, cookingSessions]);
}
