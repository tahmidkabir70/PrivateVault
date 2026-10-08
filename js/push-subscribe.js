// ===== Private Vault — push-subscribe.js =====
// Asks for notification permission, reuses the browser's existing
// PushSubscription (or creates one with the VAPID public key) and stores it in
// Firebase RTDB under users/{uid}/pushSubscriptions/{key}.
// NOTE: one browser profile has ONE push subscription per site. The installed
// app and a Chrome tab on the same phone share it, so it must never be
// unsubscribed just because a new session started.
// A status record is written to users/{uid}/pushStatus for easy debugging.

import { database } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const VAPID_PUBLIC_KEY = "BJYv6bJTZ8CRdO-eqocpDpPWFoSkBHfnl6Jn24enPHTuIfzJlQSXu83y7UkUdyUDGYOOqiKvlYyTcXhCkYRXKyY";

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

function sameServerKey(subscription) {
  try {
    const current = subscription.options && subscription.options.applicationServerKey;
    if (!current) return true; // cannot compare, assume fine
    const a = new Uint8Array(current);
    const b = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  } catch (e) {
    return true;
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
    let reused = !!subscription;
    
    // Only replace a subscription that is expired or made with another key.
    if (subscription) {
      const expired =
        subscription.expirationTime && subscription.expirationTime < Date.now();
      if (expired || !sameServerKey(subscription)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
        reused = false;
      }
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
    
    await reportStatus(uid, { state: "subscribed", key, reused });
    return subscription;
  } catch (err) {
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