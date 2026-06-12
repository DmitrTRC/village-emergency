/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

// Минимальный Service Worker. Task 09 наполнит его: runtime-кэш S3 GET,
// Background Sync для POST/PUT/PATCH, push + notificationclick.
// Пока — только precache собранных ассетов через injectManifest.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
