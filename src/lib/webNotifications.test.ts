import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveCookingNotificationPermission } from "../core/cookingNotifications";
import {
  COOKING_NOTIFICATION_CLICK_TYPE,
  COOKING_SW_PATH,
  readNotificationCapabilities,
  requestNotificationPermission,
  showCookingNotification,
} from "./webNotifications";

describe("web notification adapter", () => {
  it("keeps the service worker click protocol in sync", () => {
    const sw = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(COOKING_SW_PATH).toBe("/sw.js");
    expect(sw).toContain(COOKING_NOTIFICATION_CLICK_TYPE);
    expect(sw).toContain("skipWaiting");
    expect(sw).toContain("notificationclick");
  });

  it("reports missing Notification / serviceWorker APIs as unsupported", () => {
    const caps = readNotificationCapabilities({
      Notification: undefined as unknown as typeof Notification,
      navigator: {} as Navigator,
    });
    expect(caps.notificationApi).toBe(false);
    expect(caps.serviceWorker).toBe(false);
    expect(resolveCookingNotificationPermission(caps.notificationApi, caps.permission)).toBe(
      "unsupported"
    );
  });

  it("reads the current browser permission when Notification exists", () => {
    const NotificationCtor = Object.assign(function Notification() {}, {
      permission: "granted",
    }) as unknown as typeof Notification;
    const caps = readNotificationCapabilities({
      Notification: NotificationCtor,
      navigator: { serviceWorker: {} } as Navigator,
    });
    expect(caps.notificationApi).toBe(true);
    expect(caps.serviceWorker).toBe(true);
    expect(caps.permission).toBe("granted");
    expect(resolveCookingNotificationPermission(caps.notificationApi, caps.permission)).toBe(
      "granted"
    );
  });

  it("maps requestPermission results, including thrown errors", async () => {
    expect(await requestNotificationPermission(undefined)).toBe("unsupported");
    expect(
      await requestNotificationPermission({
        requestPermission: async () => "granted",
      })
    ).toBe("granted");
    expect(
      await requestNotificationPermission({
        requestPermission: async () => "denied",
      })
    ).toBe("denied");
    expect(
      await requestNotificationPermission({
        requestPermission: async () => {
          throw new Error("blocked");
        },
      })
    ).toBe("denied");
  });

  it("prefers the service worker registration, then the Notification constructor", async () => {
    const item = {
      id: "cooking:timer:s:t",
      kind: "timer_done" as const,
      title: "Pasta is done",
      body: "Timer finished while cooking Carbonara.",
      fireAtIso: "2026-08-19T18:10:00.000Z",
      sessionId: "s",
      recipeTitle: "Carbonara",
      timerId: "t",
    };

    const showNotification = vi.fn(async () => undefined);
    await expect(
      showCookingNotification(item, {
        registration: { showNotification } as unknown as ServiceWorkerRegistration,
      })
    ).resolves.toBe(true);
    expect(showNotification).toHaveBeenCalledWith("Pasta is done", expect.objectContaining({
      body: item.body,
      tag: `${item.id}:${item.fireAtIso}`,
    }));

    const NotificationCtor = vi.fn() as unknown as typeof Notification;
    Object.assign(NotificationCtor, { permission: "granted" });
    await expect(
      showCookingNotification(item, { NotificationCtor })
    ).resolves.toBe(true);
    expect(NotificationCtor).toHaveBeenCalled();

    await expect(showCookingNotification(item, {})).resolves.toBe(false);
  });
});
