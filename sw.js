// ===== Private Vault — sw.js =====
// Minimal but functional service worker. Its job right now is to be
// "installable" in Chrome's eyes AND to actually handle fetch events
// (Chrome refuses to install a PWA whose service worker declares an
// empty fetch handler). We do NOT cache anything yet — every request
// is passed straight through to the network, unchanged.

const SW_VERSION = "pv-sw-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A pass-through fetch handler. Chrome requires the handler to actually
// do something; simply returning without respondWith() is treated as an
// "empty" handler and blocks installability. We therefore explicitly
// fetch the request and return the network response — no caching.
self.addEventListener("fetch", (event) => {
  // Only handle GET requests; let the browser deal with the rest.
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => {
      // Network failed — return a bare error response so the page does
      // not hang. No cache fallback is provided (we cache nothing).
      return new Response("", { status: 503, statusText: "Offline" });
    })
  );
});