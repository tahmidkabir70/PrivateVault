// ===== Private Vault — File Description =====
// dashboard.js
// Responsibility: vault-dashboard.html — session guard (auth + vault unlock),
// profile loading, presence status, notification badge, and lock/sign-out actions.
// Contains no direct Firebase calls; all Firebase work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, isVaultUnlocked, clearVaultUnlocked } from "./firebase.js";
import { observeAuthState, getUserProfile, setUserOnline, initPresence, signOutUser, listenNotifications } from "./auth.js";

const dashboardMain = document.getElementById("dashboardMain");
const statusPill = document.getElementById("statusPill");
const greetingName = document.getElementById("greetingName");
const usernameLine = document.getElementById("usernameLine");
const lockVaultButton = document.getElementById("lockVaultButton");
const signOutButton = document.getElementById("signOutButton");
const notificationBadge = document.getElementById("notificationBadge");

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

let currentUid = null;
let unsubscribeNotifications = null;

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

  try {
    const profile = await getUserProfile(currentUid);
    greetingName.textContent = profile?.displayName || user.displayName || "";
    usernameLine.textContent = profile?.username ? `@${profile.username}` : "";
    // Real presence: onDisconnect offline + online write on reconnect
    initPresence(currentUid);
    await setUserOnline(currentUid);
    statusPill.textContent = t("status_online");
  } catch {
    statusPill.textContent = t("status_offline");
  }

  dashboardMain.hidden = false;

  if (typeof unsubscribeNotifications === "function") {
    unsubscribeNotifications();
    unsubscribeNotifications = null;
  }

  unsubscribeNotifications = listenNotifications(currentUid, (notifications) => {
    const unread = Object.values(notifications || {}).filter((n) => n && !n.read).length;
    if (unread > 0) {
      notificationBadge.hidden = false;
      notificationBadge.textContent = unread > 9 ? "9+" : String(unread);
    } else {
      notificationBadge.hidden = true;
      notificationBadge.textContent = "0";
    }
  });
});

lockVaultButton.addEventListener("click", () => {
  clearVaultUnlocked();
  window.location.href = "vault.html";
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    if (typeof unsubscribeNotifications === "function") {
      unsubscribeNotifications();
      unsubscribeNotifications = null;
    }
    await signOutUser(currentUid);
  } finally {
    clearVaultUnlocked();
    window.location.href = "login.html";
  }
});
