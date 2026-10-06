// ===== Private Vault — File Description =====
// vault.js
// Responsibility: vault.html — the app-level vault password gate. Detects
// whether the signed-in user already has a vault password (verify mode) or
// needs to create one (setup mode), hashes input with SHA-256 via
// hashPassword(), and never handles a plaintext password beyond this page.

import { getLanguage, t, applyTranslations, hashPassword, setVaultUnlocked, isVaultUnlocked } from "./firebase.js";
import { observeAuthState, getVaultPasswordHash, setVaultPasswordHash } from "./auth.js";

const vaultCard = document.getElementById("vaultCard");
const vaultTitle = document.getElementById("vaultTitle");
const vaultSubtitle = document.getElementById("vaultSubtitle");
const form = document.getElementById("vaultForm");
const passwordInput = document.getElementById("vaultPassword");
const passwordMessage = document.getElementById("vaultPasswordMessage");
const confirmField = document.getElementById("vaultConfirmField");
const confirmInput = document.getElementById("vaultConfirmPassword");
const confirmMessage = document.getElementById("vaultConfirmMessage");
const formAlert = document.getElementById("formAlert");
const submitButton = document.getElementById("submitButton");
const submitSpinner = document.getElementById("submitSpinner");
const submitLabel = document.getElementById("submitLabel");
const togglePasswordBtn = document.getElementById("toggleVaultPassword");
const toggleConfirmBtn = document.getElementById("toggleVaultConfirmPassword");

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

/** "setup" if no vault password exists yet, "verify" once it's established. */
let mode = "verify";
let currentUid = null;
let storedHash = null;

function setupPasswordToggle(button, input) {
  button.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.setAttribute("aria-pressed", String(isHidden));
    button.textContent = isHidden ? "🙈" : "👁️";
    button.setAttribute("aria-label", t(isHidden ? "hide_password" : "show_password"));
  });
}
setupPasswordToggle(togglePasswordBtn, passwordInput);
setupPasswordToggle(toggleConfirmBtn, confirmInput);

function renderMode() {
  const isSetup = mode === "setup";
  confirmField.hidden = !isSetup;
  confirmInput.required = isSetup;
  vaultTitle.textContent = t(isSetup ? "vault_title_setup" : "vault_title_verify");
  vaultSubtitle.textContent = t(isSetup ? "vault_subtitle_setup" : "vault_subtitle_verify");
  submitLabel.textContent = t(isSetup ? "vault_button_setup" : "vault_button_verify");
  vaultCard.hidden = false;
}

function clearFieldMessages() {
  passwordMessage.textContent = "";
  passwordMessage.className = "field-message";
  confirmMessage.textContent = "";
  confirmMessage.className = "field-message";
  formAlert.hidden = true;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitSpinner.hidden = !isLoading;
  if (isLoading) {
    submitLabel.textContent = t("vault_loading");
  } else {
    submitLabel.textContent = t(mode === "setup" ? "vault_button_setup" : "vault_button_verify");
  }
}

observeAuthState(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (isVaultUnlocked()) {
    window.location.href = "vault-dashboard.html";
    return;
  }
  currentUid = user.uid;
  try {
    storedHash = await getVaultPasswordHash(currentUid);
    mode = storedHash ? "verify" : "setup";
  } catch {
    mode = "setup";
  }
  renderMode();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldMessages();

  const password = passwordInput.value;

  if (password.length < 6) {
    passwordMessage.textContent = t("err_vault_short");
    passwordMessage.classList.add("is-error");
    return;
  }

  if (mode === "setup") {
    const confirmPassword = confirmInput.value;
    if (password !== confirmPassword) {
      confirmMessage.textContent = t("err_vault_mismatch");
      confirmMessage.classList.add("is-error");
      return;
    }

    setLoading(true);
    try {
      const hash = await hashPassword(password);
      await setVaultPasswordHash(currentUid, hash);
      setVaultUnlocked();
      window.location.href = "vault-dashboard.html";
    } catch {
      formAlert.textContent = t("err_generic");
      formAlert.hidden = false;
      setLoading(false);
    }
    return;
  }

  // verify mode
  setLoading(true);
  try {
    const hash = await hashPassword(password);
    if (hash === storedHash) {
      setVaultUnlocked();
      window.location.href = "vault-dashboard.html";
      return;
    }
    passwordMessage.textContent = t("err_vault_incorrect");
    passwordMessage.classList.add("is-error");
    passwordInput.value = "";
    passwordInput.focus();
    setLoading(false);
  } catch {
    formAlert.textContent = t("err_generic");
    formAlert.hidden = false;
    setLoading(false);
  }
});
