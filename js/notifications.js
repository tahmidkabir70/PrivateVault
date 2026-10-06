// ===== Private Vault — File Description =====
// notifications.js
// Responsibility: notifications.html — loading, rendering, and managing
// real-time notifications. Contains no direct Firebase calls; all Firebase
// work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, formatDate, isVaultUnlocked } from "./firebase.js";
import {
  observeAuthState,
  listenNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUserProfile,
} from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const notificationsMain = document.getElementById("notificationsMain");
const notificationsList = document.getElementById("notificationsList");
const notificationsEmpty = document.getElementById("notificationsEmpty");
const markAllReadButton = document.getElementById("markAllReadButton");

let currentUid = null;
const profileCache = new Map();

async function resolveProfile(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  const profile = (await getUserProfile(uid).catch(() => null)) || { username: "", displayName: "" };
  profileCache.set(uid, profile);
  return profile;
}

function renderNotification(notification, id) {
  const div = document.createElement("div");
  div.className = `notification-item${notification.read ? " is-read" : " is-unread"}`;
  div.dataset.notificationId = id;
  
  const content = document.createElement("div");
  content.className = "notification-content";
  
  const title = document.createElement("strong");
  title.textContent = t(notification.titleKey || "notification_default_title");
  content.appendChild(title);
  
  const body = document.createElement("span");
  body.textContent = t(notification.bodyKey || "notification_default_body");
  content.appendChild(body);
  
  const meta = document.createElement("span");
  meta.className = "notification-meta";
  meta.textContent = notification.createdAt ? formatDate(notification.createdAt) : "";
  content.appendChild(meta);
  
  div.appendChild(content);
  
  if (!notification.read) {
    const markBtn = document.createElement("button");
    markBtn.type = "button";
    markBtn.className = "notification-mark-read";
    markBtn.textContent = t("mark_read_button");
    markBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      markBtn.disabled = true;
      try {
        await markNotificationRead(currentUid, id);
      } finally {
        markBtn.disabled = false;
      }
    });
    div.appendChild(markBtn);
  }
  
  div.addEventListener("click", () => {
    // Navigate based on notification type
    if (notification.chatId) {
      window.location.href = `chat-room.html?chat=${encodeURIComponent(notification.chatId)}`;
    } else if (notification.storyId) {
      window.location.href = `stories.html#story-${notification.storyId}`;
    }
  });
  
  return div;
}

function renderNotifications(notifications) {
  const entries = Object.entries(notifications || {});
  entries.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  
  notificationsEmpty.hidden = entries.length > 0;
  if (entries.length === 0) {
    while (notificationsList.firstChild) notificationsList.removeChild(notificationsList.firstChild);
    notificationsList.appendChild(notificationsEmpty);
    return;
  }
  
  // Remove empty state if present
  if (notificationsList.contains(notificationsEmpty)) {
    notificationsList.removeChild(notificationsEmpty);
  }
  
  // Clear existing notifications (keep only empty state if present)
  while (notificationsList.firstChild) notificationsList.removeChild(notificationsList.firstChild);
  
  entries.forEach(([id, notification]) => {
    notificationsList.appendChild(renderNotification(notification, id));
  });
}

observeAuthState(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!isVaultUnlocked()) {
    window.location.href = "vault.html";
    return;
  }
  
  currentUid = user.uid;
  notificationsMain.hidden = false;
  
  listenNotifications(currentUid, (notifications) => {
    renderNotifications(notifications);
  });
});

markAllReadButton.addEventListener("click", async () => {
  markAllReadButton.disabled = true;
  try {
    await markAllNotificationsRead(currentUid);
  } finally {
    markAllReadButton.disabled = false;
  }
});