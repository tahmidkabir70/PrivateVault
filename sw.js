/* Private Vault — Service Worker v5
   Handles:
     - install / activate: minimal, no precache
     - fetch: network-first for same-origin, offline fallback for navigations
     - push: wakes the SW even when the PWA is fully closed; showing a
             notification is what makes Android put a red dot on the icon
     - notificationclick: opens the app and lets the OS clear the dot */

const CACHE_NAME = "pv-vault-v5";

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
  if (url.origin !== self.location.origin) return;

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

/* ---------- PUSH ---------- */
/* Fired by the OS push daemon (FCM on Android) even if the PWA is
   completely closed and swiped away. Showing a notification here is the
   ONLY way to make Android put a red dot on the installed PWA icon.
   Do NOT call navigator.setAppBadge() here — it does not exist inside
   a Service Worker, and it is not supported on Android Chrome anyway. */
self.addEventListener("push", (event) => {
  let data = {
    title: "বীজগণিতের সূত্রাবলি",
    body: "নতুন সূত্র যোগ হয়েছে",
    url: "./vault-dashboard.html",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        data.title = parsed.title || data.title;
        data.body = parsed.body || data.body;
        data.url = parsed.url || data.url;
      }
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "pv-unread",
      renotify: true,
      data: { url: data.url },
    })
  );
});

/* ---------- NOTIFICATION CLICK ---------- */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "./vault-dashboard.html";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client) client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

/* ---------- CLEAR ON REQUEST ---------- */
/* The page asks us to close every delivered notification when the installed
   app is opened, which also removes the red dot from the icon. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "pv-clear-notifications") {
    event.waitUntil(
      self.registration
        .getNotifications()
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => {})
    );
  }
});

/* ---------- NOTIFICATION CLOSE ---------- */
self.addEventListener("notificationclose", () => {
  // No-op. Closing is handled by the OS, which also removes the red dot
  // if this was the last unread notification.
});