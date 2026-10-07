/* Private Vault - Service Worker (Optimized for Android PWA) */
const CACHE_NAME = "pv-vault-v1";

// প্রাথমিক প্রি-ক্যাশ ফাইলসমূহ (কভার পেজ যাতে অফলাইনে কাজ করে)
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./css/theme.css",
  "./js/theme.js",
  "./js/cover.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// ইনস্টলেশন: ফাইলগুলো ক্যাশে জমা রাখা
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-caching non-fatal warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// এক্টিভেশন: পুরোনো ক্যাশ ডিলিট করা
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ফেচ: স্ট্যাটিক ফাইলে ক্যাশ ফার্স্ট / অফলাইন সাপোর্ট, এপিআই সরাসরি নেটওয়ার্কে
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // শুধুমাত্র GET রিকোয়েস্ট ক্যাশ করবে
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Firebase, Cloudinary, WebSockets বা বাইরের এপিআই সরাসরি নেটওয়ার্কে যাবে
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("cloudinary.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // ব্যাকগ্রাউন্ডে ক্যাশ আপডেট (Stale-while-revalidate)
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // ক্যাশে না থাকলে নেটওয়ার্ক থেকে আনবে
      return fetch(req).catch(() => {
        // অফলাইনে থাকলে এবং পেজ নেভিগেশন হলে index.html দেখাবে
        if (req.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});

// ==========================================
// পুশ নোটিফিকেশন প্লেসহোল্ডার (ভবিষ্যতের জন্য)
// ==========================================
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || "Private Vault";
    const options = {
      body: data.body || "নতুন বার্তা এসেছে",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: data.url || "./index.html"
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    // প্লেইন টেক্সট হ্যান্ডলার
    event.waitUntil(
      self.registration.showNotification("Private Vault", {
        body: event.data.text(),
        icon: "icons/icon-192.png"
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
