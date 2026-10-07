// ===== Private Vault — push-subscribe.js =====
// Asks for notification permission, creates a PushSubscription with the
// VAPID public key, and stores it in Firebase RTDB under
// users/{uid}/pushSubscriptions/{key}. The Cloudflare Worker reads these
// subscriptions and delivers Web Push payloads to them.

import { database } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Replace this with your real VAPID public key (see setup notes).
const VAPID_PUBLIC_KEY = "BJYv6bJTZ8CRdO-eqocpDpPWFoSkBHfnl6Jn24enPHTuIfzJlQSXu83y7UkUdyUDGYOOqiKvlYyTcXhCkYRXKyY";

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

export async function subscribeToPush(uid) {
  if (!uid) return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[push] not supported in this browser");
    return null;
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("REPLACE")) {
    console.warn("[push] VAPID public key not configured");
    return null;
  }
  
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("[push] permission denied");
    return null;
  }
  
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
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
  
  return subscription;
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