// ===== Private Vault — File Description =====
// profile.js
// Responsibility: profile.html — loading the user's profile, editing their
// display name, and toggling privacy settings. Contains no direct Firebase
// calls; all Firebase work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, isVaultUnlocked } from "./firebase.js";
import { observeAuthState, getUserProfile, updateDisplayName, updatePrivacySettings } from "./auth.js";

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const profileMain = document.getElementById("profileMain");
const profileAlert = document.getElementById("profileAlert");
const profileForm = document.getElementById("profileForm");
const displayNameInput = document.getElementById("displayNameInput");
const displayNameMessage = document.getElementById("displayNameMessage");
const usernameReadonly = document.getElementById("usernameReadonly");
const emailReadonly = document.getElementById("emailReadonly");
const showStatusToggle = document.getElementById("showStatusToggle");
const showLastSeenToggle = document.getElementById("showLastSeenToggle");
const saveProfileButton = document.getElementById("saveProfileButton");

let currentUid = null;

function showAlert(key, tone = "error") {
  profileAlert.textContent = t(key);
  profileAlert.hidden = false;
  profileAlert.classList.toggle("is-success", tone === "success");
}

function hideAlert() {
  profileAlert.hidden = true;
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

  try {
    const profile = await getUserProfile(currentUid);
    displayNameInput.value = profile?.displayName || user.displayName || "";
    usernameReadonly.value = profile?.username ? `@${profile.username}` : "";
    emailReadonly.value = profile?.email || user.email || "";
    showStatusToggle.checked = profile?.privacy?.showStatus !== false;
    showLastSeenToggle.checked = profile?.privacy?.showLastSeen !== false;
  } catch {
    showAlert("err_generic");
  }

  profileMain.hidden = false;
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();
  displayNameMessage.textContent = "";

  const displayName = displayNameInput.value.trim();
  if (!displayName) {
    displayNameMessage.textContent = t("err_display_name_required");
    displayNameMessage.classList.add("is-error");
    return;
  }

  saveProfileButton.disabled = true;
  try {
    await updateDisplayName(currentUid, displayName);
    await updatePrivacySettings(currentUid, {
      showStatus: showStatusToggle.checked,
      showLastSeen: showLastSeenToggle.checked,
    });
    showAlert("profile_updated", "success");
  } catch (error) {
    showAlert(error.message || "err_generic");
  } finally {
    saveProfileButton.disabled = false;
  }
});
