// ===== Private Vault — push-subscribe.js =====
// Asks for notification permission, creates a fresh PushSubscription with the
// VAPID public key, and stores it in Firebase RTDB under
// users/{uid}/pushSubscriptions/{key}. The Cloudflare Worker reads these
// subscriptions and delivers Web Push messages to them.
// Also writes a small status record to users/{uid}/pushStatus so problems
// can be read from the Firebase console (no DevTools needed).

import { database } from "./firebase.js";
import { ref, set, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const VAPID_PUBLIC_KEY = "BJYv6bJTZ8CRdO-eqocpDpPWFoSkBHfnl6Jn24enPHTuIfzJlQSXu83y7UkUdyUDGYOOqiKvlYyTcXhCkYRXKyY";

// Once per browser session we drop the old local subscription and make a new
// one, so a stale/dead subscription can never be reused.
const FRESH_FLAG = "pv_push_fresh_v1";

let inflight = null;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function keyFromEndpoint(endpoint) {
  return endpoint.slice(-20).replace(/[.#$/\[\]]/g, "_");
}

function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch (e) {
    return false;
  }
}

function reportStatus(uid, info) {
  return set(ref(database, `users/${uid}/pushStatus`), {
    ...info,
    standalone: isStandalone(),
    at: Date.now(),
  }).catch(() => {});
}

async function doSubscribe(uid) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    await reportStatus(uid, { state: "unsupported" });
    return null;
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("REPLACE")) {
    await reportStatus(uid, { state: "no-vapid-key" });
    return null;
  }
  
  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      await reportStatus(uid, { state: "permission-" + permission });
      return null;
    }
    
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    
    let alreadyFresh = false;
    try {
      alreadyFresh = sessionStorage.getItem(FRESH_FLAG) === "1";
      sessionStorage.setItem(FRESH_FLAG, "1");
    } catch (e) {}
    
    let oldKey = null;
    if (subscription && !alreadyFresh) {
      oldKey = keyFromEndpoint(subscription.toJSON().endpoint);
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    
    const subJson = subscription.toJSON();
    const key = keyFromEndpoint(subJson.endpoint);
    
    await set(ref(database, `users/${uid}/pushSubscriptions/${key}`), {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      createdAt: Date.now(),
    });
    
    if (oldKey && oldKey !== key) {
      await remove(ref(database, `users/${uid}/pushSubscriptions/${oldKey}`)).catch(() => {});
    }
    
    await reportStatus(uid, { state: "subscribed", key });
    return subscription;
  } catch (err) {
    try { sessionStorage.removeItem(FRESH_FLAG); } catch (e) {}
    await reportStatus(uid, {
      state: "error",
      message: String((err && err.message) || err).slice(0, 200),
    });
    throw err;
  }
}

export function subscribeToPush(uid) {
  if (!uid) return Promise.resolve(null);
  if (inflight) return inflight;
  inflight = doSubscribe(uid).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function unsubscribeFromPush(uid) {
  if (!uid) return;
  if (!("serviceWorker" in navigator)) return;
  
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  
  const subJson = subscription.toJSON();
  const key = keyFromEndpoint(subJson.endpoint);
  
  await subscription.unsubscribe().catch(() => {});
  await set(ref(database, `users/${uid}/pushSubscriptions/${key}`), null).catch(() => {});
}