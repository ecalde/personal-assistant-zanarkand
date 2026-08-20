/**
 * Minimal service worker for Cooking Web Notifications (Phase 11).
 *
 * No caching: this worker exists so timer-done / start-cooking alerts can
 * display while the tab is backgrounded, and so a click focuses the app.
 * Message type strings must stay in sync with src/lib/webNotifications.ts.
 */
const COOKING_NOTIFICATION_CLICK_TYPE = "COOKING_NOTIFICATION_CLICK";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tag = event.notification.tag || "";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
        }
        client.postMessage({ type: COOKING_NOTIFICATION_CLICK_TYPE, tag });
        return;
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })()
  );
});
