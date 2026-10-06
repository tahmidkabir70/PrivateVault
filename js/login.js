// ===== Private Vault — File Description =====
// login.js
// Responsibility: login.html form behavior — validation, calling auth.js,
// persistent-auth redirect (skip form when already signed in), and vault handoff.
// Contains no direct Firebase calls; all auth work is delegated to js/auth.js.

import { getLanguage, t, applyTranslations, isVaultUnlocked } from "./firebase.js";
import { observeAuthState, loginUser, sendPasswordReset } from "./auth.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePassword");
const formAlert = document.getElementById("formAlert");
const submitButton = document.getElementById("submitButton");
const submitSpinner = document.getElementById("submitSpinner");
const submitLabel = document.getElementById("submitLabel");

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

let authResolved = false;

// Persistent login: if Firebase already has a session, skip the form and
// continue to vault (or dashboard if vault already unlocked this session).
observeAuthState((user) => {
  if (authResolved) return;
  authResolved = true;
  if (user) {
    if (isVaultUnlocked()) {
      window.location.href = "vault-dashboard.html";
    } else {
      window.location.href = "vault.html";
    }
  }
});

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePasswordBtn.setAttribute("aria-pressed", String(isHidden));
  togglePasswordBtn.textContent = isHidden ? "🙈" : "👁️";
  togglePasswordBtn.setAttribute("aria-label", t(isHidden ? "hide_password" : "show_password"));
});

function showAlert(messageKey) {
  formAlert.textContent = t(messageKey);
  formAlert.hidden = false;
  formAlert.classList.remove("is-success");
}

function hideAlert() {
  formAlert.hidden = true;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitSpinner.hidden = !isLoading;
  submitLabel.textContent = t(isLoading ? "login_loading" : "login_button");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showAlert("err_required_fields");
    return;
  }

  setLoading(true);
  try {
    await loginUser({ email, password });
    window.location.href = "vault.html";
  } catch (error) {
    showAlert(error.message || "err_generic");
    setLoading(false);
  }
});


const forgotPasswordButton = document.getElementById("forgotPasswordButton");
if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    hideAlert();
    const email = emailInput.value.trim();
    if (!email) {
      showAlert("err_required_fields");
      emailInput.focus();
      return;
    }
    forgotPasswordButton.disabled = true;
    try {
      await sendPasswordReset(email);
      formAlert.textContent = t("reset_email_sent");
      formAlert.hidden = false;
      formAlert.classList.add("is-success");
    } catch (error) {
      showAlert(error.message || "err_generic");
    } finally {
      forgotPasswordButton.disabled = false;
    }
  });
}
