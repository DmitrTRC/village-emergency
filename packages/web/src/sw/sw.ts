/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { buildNotification, parsePushPayload, resolveTargetUrl } from "./notification";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

precacheAndRoute(self.__WB_MANIFEST);

// Навигация — NetworkFirst: свежий HTML онлайн, кэш как офлайн-фолбэк.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: "navigations", networkTimeoutSeconds: 3 }),
  ),
);

// Медиа (pre-signed S3 GET, любые картинки) — CacheFirst с TTL.
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "media",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// Мутации (создание инцидента, загрузка медиа в S3, отметка media) — фоновая
// очередь: при офлайне реплеится браузером по событию sync (backoff — браузерный).
const mutationStrategy = new NetworkOnly({
  plugins: [new BackgroundSyncPlugin("village-mutations", { maxRetentionTime: 24 * 60 })],
});
registerRoute(/\/incidents$/, mutationStrategy, "POST");
registerRoute(/\/incidents\/[^/]+\/media\/[^/]+$/, mutationStrategy, "PATCH");
registerRoute(({ request }) => request.method === "PUT", mutationStrategy, "PUT");

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event.data?.text());
  const { title, options } = buildNotification(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  const target = resolveTargetUrl(raw, self.location.origin);
  event.waitUntil(focusOrOpen(target));
});

async function focusOrOpen(url: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (client.url === url) {
      await client.focus();
      return;
    }
  }
  await self.clients.openWindow(url);
}
