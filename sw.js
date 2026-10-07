// ===== Private Vault — sw.js =====
// Minimal service worker. Its only job right now is to exist and take
// control of the page, which is what makes the PWA "installable" in
// Chrome. No caching, no offline logic, no notifications yet — those
// come later, and adding them must not break this file's core role.

const SW_VERSION = "pv-sw-v1";

self.addEventListener("install", (event) => {
  // Activate this service worker immediately instead of waiting for
  // all tabs to close — needed so Chrome sees an active controller.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A no-op fetch handler. Chrome requires a fetch handler to consider
// the service worker "real" for installability, but we intentionally
// do NOT cache or intercept anything yet. Let the browser handle every
// request normally by simply not calling respondWith().
self.addEventListener("fetch", (event) => {
  // Intentionally empty — do not call event.respondWith().
  // This keeps full network behavior and avoids stale-cache bugs.
});