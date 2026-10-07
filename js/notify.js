// ===== Private Vault — notify.js =====
// Loaded dynamically by theme.js after the vault is unlocked. Watches
// the user's notifications/{uid} node in Firebase Realtime Database.
// When at least one notification has read === false, it asks the service
// worker to show a system notification with a DISGUISED text (no real
// message content). On Android Chrome, an unread system notification
// automatically puts a red dot on the installed PWA icon.
//
// When no unread notifications remain, all displayed notifications are
// closed, which removes the red dot.
//
// NOTE: This file never calls navigator.setAppBadge() — the Badging API
// is not supported on Android Chrome, so it would be a no-op there.
//
// LIMITATION: Works only while this page (or the installed PWA) is open,
// including in the background. If the browser is fully closed, no code
// runs and no new notification can appear. Removing that limitation
// requires server-side push (Firebase Cloud Functions on the Blaze plan,
// or a third-party push service). This is a platform limit, not a bug.

import {
  ref,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { database, auth, isVaultUnlocked, getLanguage } from "./firebase.js";
import { observeAuthState } from "./auth.js";

// ---------- Constants ----------
const NOTIFICATION_TAG = "pv-unread-notification";

// Disguised text — must never reveal that this is a messaging app.
// Falls back to Bangla if the language key is missing.
function disguisedTitle() {
  return getLanguage() === "en" ? "Algebraic Formulas" : "বীজগণিতের সূত্রাবলি";
}

function disguisedBody() {
  return getLanguage() === "en" ?
    "A new formula has been added" :
    "নতুন সূত্র যোগ হয়েছে";
}

// ---------- State ----------
let currentUid = null;
let notificationsRef = null;
let onValueHandler = null;
let unsubscribeAuth = null;
let lastUnreadCount = -1; // sentinel so first computation always fires

// ---------- Helpers ----------
function permissionGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

function serviceWorkerReady() {
  return "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
}

/**
 * Ask the service worker to display (or replace) a single system
 * notification. Using a fixed tag means we never stack up multiple
 * notifications — the previous one is replaced. This keeps the Android
 * notification shade tidy and ensures the red dot reflects "there is at
 * least one unread notification", not "there are N unread notifications".
 */
function showDisguisedNotification() {
  if (!permissionGranted()) return;
  if (!serviceWorkerReady()) return;
  
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.showNotification(disguisedTitle(), {
        body: disguisedBody(),
        tag: NOTIFICATION_TAG,
        renotify: true,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        data: { url: "./vault-dashboard.html" },
      });
    })
    .catch((err) => {
      console.warn("[notify] showNotification failed:", err);
    });
}

/**
 * Close every notification we previously displayed. Doing this when the
 * unread count drops to zero causes Android to remove the red dot from
 * the installed PWA icon.
 */
function closeDisguisedNotification() {
  if (!("serviceWorker" in navigator)) return;
  if (!navigator.serviceWorker.controller) return;
  
  navigator.serviceWorker.ready
    .then((reg) => {
      return reg.getNotifications({ tag: NOTIFICATION_TAG });
    })
    .then((list) => {
      list.forEach((n) => {
        try { n.close(); } catch (e) { /* ignore */ }
      });
    })
    .catch(() => { /* ignore */ });
}

// ---------- Notification listener ----------
function computeUnread(notificationsObj) {
  if (!notificationsObj) return 0;
  let count = 0;
  Object.keys(notificationsObj).forEach((id) => {
    const n = notificationsObj[id];
    if (!n) return;
    if (n.read === false) count += 1;
  });
  return count;
}

function startListener(uid) {
  if (!uid) return;
  stopListener();
  
  currentUid = uid;
  notificationsRef = ref(database, `notifications/${uid}`);
  
  onValueHandler = (snapshot) => {
    const data = snapshot.exists() ? snapshot.val() : null;
    const unread = computeUnread(data);
    
    if (unread === lastUnreadCount) return;
    lastUnreadCount = unread;
    
    if (unread > 0) {
      showDisguisedNotification();
    } else {
      closeDisguisedNotification();
    }
  };
  
  onValue(notificationsRef, onValueHandler);
}

function stopListener() {
  if (notificationsRef && onValueHandler) {
    try { off(notificationsRef, "value", onValueHandler); } catch (e) { /* ignore */ }
  }
  notificationsRef = null;
  onValueHandler = null;
  currentUid = null;
  lastUnreadCount = -1;
}

// ---------- Public API ----------
export function startNotifyEngine() {
  if (!isVaultUnlocked()) return;
  if (unsubscribeAuth) return; // already started
  
  unsubscribeAuth = observeAuthState((user) => {
    if (!user) {
      stopListener();
      return;
    }
    if (!isVaultUnlocked()) {
      stopListener();
      return;
    }
    startListener(user.uid);
  });
}

export function stopNotifyEngine() {
  if (unsubscribeAuth) {
    try { unsubscribeAuth(); } catch (e) { /* ignore */ }
    unsubscribeAuth = null;
  }
  stopListener();
  closeDisguisedNotification();
}

// ---------- Auto-start when this module is imported ----------
// theme.js only imports this file after the vault is unlocked, so it is
// safe to start immediately. The vault check is repeated inside
// startNotifyEngine() as a defensive measure.
startNotifyEngine();