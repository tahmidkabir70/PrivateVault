/* Private Vault — Service Worker v3
   - No precache. Network-first for everything same-origin.
   - Notification click routes to the correct page (chat if chatId
     present, otherwise the dashboard).
   - Push handler kept as a placeholder for the future. */

const CACHE_NAME = "pv-vault-v3";

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
  // Cross-origin (Firebase, Cloudinary, Google Fonts, Giphy) go straight
  // to the network. Never intercept them.
  if (url.origin !== self.location.origin) return;

  // Page navigations: always network. Never serve cached HTML.
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

  // Static files: network-first, cache as offline fallback.
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

// ---------- Push (placeholder for future server-side push) ----------
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let title = "Private Vault";
  let options = {
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url: "./vault-dashboard.html" },
  };
  try {
    const data = event.data.json();
    title = data.title || title;
    options.body = data.body || "নতুন সূত্র যোগ হয়েছে";
    options.data = { url: data.url || "./vault-dashboard.html" };
  } catch (e) {
    options.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

// ---------- Notification click ----------
// If the notification payload includes a chatId, route there. Otherwise
// open (or focus) the dashboard. Either way, focus an existing app
// window if one is open instead of spawning a duplicate.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const chatId = data.chatId || null;
  const targetUrl = chatId
    ? `./chat-room.html?chat=${encodeURIComponent(chatId)}`
    : (data.url || "./vault-dashboard.html");

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            // Navigate the focused window to the target, then focus.
            if ("navigate" in client) {
              client.navigate(targetUrl).catch(() => {});
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ---------- Notification close (no-op but explicit) ----------
self.addEventListener("notificationclose", () => {
  // Nothing to do — closing the notification is handled by the OS,
  // which also removes the red dot if this was the last unread one.
});