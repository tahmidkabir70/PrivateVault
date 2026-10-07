/* Private Vault - Service Worker v2 (no precache, network-first) */
const CACHE_NAME = "pv-vault-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Firebase, Cloudinary, Google Fonts etc. go straight to network
  if (url.origin !== self.location.origin) return;

  // Page navigations: always network. Never serve cached/redirected HTML.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style='background:#0a0713;color:#fff;font-family:sans-serif;padding:2rem'>ইন্টারনেট সংযোগ নেই।</body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
    return;
  }

  // Static files: network first, cache as offline fallback
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// Push notification placeholder (future use)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let title = "Private Vault";
  let options = { icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: "./index.html" };
  try {
    const data = event.data.json();
    title = data.title || title;
    options.body = data.body || "নতুন বার্তা এসেছে";
    options.data = data.url || "./index.html";
  } catch (e) {
    options.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
