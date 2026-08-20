/**
 * Browser adapter for Cooking Web Notifications.
 *
 * Pure scheduling/permission policy lives in `src/core/cookingNotifications.ts`.
 * This module talks to Notification, service workers, and focuses the app
 * when a notification is clicked. Missing APIs fail closed (in-app fallback).
 */

import type { CookingNotificationItem } from "../core/cookingNotifications";

export const COOKING_SW_PATH = "/sw.js";
export const COOKING_NOTIFICATION_CLICK_TYPE = "COOKING_NOTIFICATION_CLICK";

export type BrowserNotificationCapabilities = {
  notificationApi: boolean;
  serviceWorker: boolean;
  permission: string | undefined;
};

type NotificationPermissionApi = {
  permission?: string;
  requestPermission?: () => Promise<string>;
};

type NotificationConstructorLike = NotificationPermissionApi &
  (new (title: string, options?: NotificationOptions) => unknown);

type NotificationHost = {
  Notification?: NotificationPermissionApi | NotificationConstructorLike;
  navigator?: { serviceWorker?: unknown };
};

function globalNotification(): NotificationConstructorLike | undefined {
  return typeof Notification === "undefined" ? undefined : Notification;
}

export function readNotificationCapabilities(
  win: NotificationHost | undefined = typeof window === "undefined" ? undefined : window
): BrowserNotificationCapabilities {
  if (!win) {
    return { notificationApi: false, serviceWorker: false, permission: undefined };
  }
  const NotificationRef = win.Notification;
  const notificationApi = typeof NotificationRef === "function";
  const serviceWorker = Boolean(win.navigator && "serviceWorker" in win.navigator);
  return {
    notificationApi,
    serviceWorker,
    permission: notificationApi ? NotificationRef.permission : undefined,
  };
}

export async function registerCookingServiceWorker(
  sw: ServiceWorkerContainer | undefined = typeof navigator === "undefined" ? undefined : navigator.serviceWorker
): Promise<ServiceWorkerRegistration | undefined> {
  if (!sw) return undefined;
  try {
    return await sw.register(COOKING_SW_PATH);
  } catch {
    return undefined;
  }
}

export async function requestNotificationPermission(
  api: NotificationPermissionApi | undefined = globalNotification()
): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!api) return "unsupported";
  try {
    if (typeof api.requestPermission !== "function") return "unsupported";
    const result = await api.requestPermission();
    if (result === "granted" || result === "denied") return result;
    return "default";
  } catch {
    return "denied";
  }
}

export type ShowCookingNotificationDeps = {
  registration?: ServiceWorkerRegistration | null;
  NotificationCtor?: NotificationConstructorLike;
};

export async function showCookingNotification(
  item: CookingNotificationItem,
  deps: ShowCookingNotificationDeps = {}
): Promise<boolean> {
  const options: NotificationOptions = {
    body: item.body,
    tag: `${item.id}:${item.fireAtIso}`,
    icon: "/icon-192.png",
    data: { kind: item.kind, sessionId: item.sessionId },
  };

  const registration = deps.registration;
  if (registration && typeof registration.showNotification === "function") {
    try {
      await registration.showNotification(item.title, options);
      return true;
    } catch {
      // fall through to the constructor
    }
  }

  const NotificationCtor = deps.NotificationCtor ?? globalNotification();
  if (!NotificationCtor || NotificationCtor.permission !== "granted") return false;
  try {
    new NotificationCtor(item.title, options);
    return true;
  } catch {
    return false;
  }
}

export function subscribeToNotificationClicks(
  onClick: () => void,
  sw: ServiceWorkerContainer | undefined = typeof navigator === "undefined" ? undefined : navigator.serviceWorker
): () => void {
  if (!sw) return () => undefined;

  const handleMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as { type?: string }).type !== COOKING_NOTIFICATION_CLICK_TYPE) return;
    onClick();
  };

  sw.addEventListener("message", handleMessage);
  return () => sw.removeEventListener("message", handleMessage);
}
