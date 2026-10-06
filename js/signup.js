// ===== Private Vault — File Description =====
// signup.js
// Responsibility: signup.html form behavior — field validation, live
// username availability checks, and calling auth.js to create the account.
// Contains no direct Firebase calls.

import { getLanguage, t, applyTranslations } from "./firebase.js";
import { signupUser, checkUsernameAvailable, isUsernameFormatValid } from "./auth.js";

const form = document.getElementById("signupForm");
const displayNameInput = document.getElementById("displayName");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const displayNameMessage = document.getElementById("displayNameMessage");
const usernameMessage = document.getElementById("usernameMessage");
const emailMessage = document.getElementById("emailMessage");
const passwordMessage = document.getElementById("passwordMessage");
const confirmPasswordMessage = document.getElementById("confirmPasswordMessage");

const togglePasswordBtn = document.getElementById("togglePassword");
const toggleConfirmPasswordBtn = document.getElementById("toggleConfirmPassword");
const formAlert = document.getElementById("formAlert");
const submitButton = document.getElementById("submitButton");
const submitSpinner = document.getElementById("submitSpinner");
const submitLabel = document.getElementById("submitLabel");

document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tracks the most recent username availability check so stale async
 *  responses (from an earlier keystroke) can never overwrite a newer one. */
let usernameCheckToken = 0;
let usernameIsAvailable = false;

function setField(input, messageEl, state, key) {
  messageEl.textContent = key ? t(key) : "";
  messageEl.classList.remove("is-error", "is-success", "is-pending");
  if (state) messageEl.classList.add(state);
  input.setAttribute("aria-invalid", state === "is-error" ? "true" : "false");
}

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
setupPasswordToggle(toggleConfirmPasswordBtn, confirmPasswordInput);

function showFormAlert(key, tone = "error") {
  formAlert.textContent = t(key);
  formAlert.hidden = false;
  formAlert.classList.toggle("is-success", tone === "success");
}

function hideFormAlert() {
  formAlert.hidden = true;
}

// ---- Live validation ----

displayNameInput.addEventListener("blur", () => {
  if (!displayNameInput.value.trim()) {
    setField(displayNameInput, displayNameMessage, "is-error", "err_display_name_required");
  } else {
    setField(displayNameInput, displayNameMessage, null, null);
  }
});

let usernameDebounceTimer;
usernameInput.addEventListener("input", () => {
  const username = usernameInput.value.trim();
  usernameIsAvailable = false;
  window.clearTimeout(usernameDebounceTimer);

  if (!username) {
    setField(usernameInput, usernameMessage, null, null);
    return;
  }
  if (!isUsernameFormatValid(username)) {
    setField(usernameInput, usernameMessage, "is-error", "username_invalid");
    return;
  }

  setField(usernameInput, usernameMessage, "is-pending", "username_checking");
  const thisToken = ++usernameCheckToken;

  usernameDebounceTimer = window.setTimeout(async () => {
    try {
      const available = await checkUsernameAvailable(username);
      if (thisToken !== usernameCheckToken) return; // superseded by a newer check
      usernameIsAvailable = available;
      setField(
        usernameInput,
        usernameMessage,
        available ? "is-success" : "is-error",
        available ? "username_available" : "username_taken"
      );
    } catch {
      if (thisToken !== usernameCheckToken) return;
      setField(usernameInput, usernameMessage, "is-error", "err_generic");
    }
  }, 400);
});

emailInput.addEventListener("blur", () => {
  const email = emailInput.value.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    setField(emailInput, emailMessage, "is-error", "err_email_invalid");
  } else {
    setField(emailInput, emailMessage, null, null);
  }
});

passwordInput.addEventListener("blur", () => {
  if (passwordInput.value && passwordInput.value.length < 6) {
    setField(passwordInput, passwordMessage, "is-error", "err_password_short");
  } else {
    setField(passwordInput, passwordMessage, null, null);
  }
  validateConfirmPassword();
});

confirmPasswordInput.addEventListener("blur", validateConfirmPassword);

function validateConfirmPassword() {
  if (confirmPasswordInput.value && confirmPasswordInput.value !== passwordInput.value) {
    setField(confirmPasswordInput, confirmPasswordMessage, "is-error", "err_password_mismatch");
    return false;
  }
  setField(confirmPasswordInput, confirmPasswordMessage, null, null);
  return true;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitSpinner.hidden = !isLoading;
  submitLabel.textContent = t(isLoading ? "signup_loading" : "signup_button");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideFormAlert();

  const displayName = displayNameInput.value.trim();
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  let hasError = false;

  if (!displayName) {
    setField(displayNameInput, displayNameMessage, "is-error", "err_display_name_required");
    hasError = true;
  }
  if (!isUsernameFormatValid(username)) {
    setField(usernameInput, usernameMessage, "is-error", "username_invalid");
    hasError = true;
  } else if (!usernameIsAvailable) {
    setField(usernameInput, usernameMessage, "is-error", "username_taken");
    hasError = true;
  }
  if (!EMAIL_PATTERN.test(email)) {
    setField(emailInput, emailMessage, "is-error", "err_email_invalid");
    hasError = true;
  }
  if (password.length < 6) {
    setField(passwordInput, passwordMessage, "is-error", "err_password_short");
    hasError = true;
  }
  if (!validateConfirmPassword()) {
    hasError = true;
  }

  if (hasError) return;

  setLoading(true);
  try {
    await signupUser({ email, username, displayName, password });
    showFormAlert("signup_success", "success");
    window.setTimeout(() => {
      window.location.href = "vault.html";
    }, 900);
  } catch (error) {
    const key = error.message || "err_generic";
    if (key === "username_taken" || key === "username_invalid") {
      setField(usernameInput, usernameMessage, "is-error", key);
      usernameIsAvailable = false;
    } else if (key === "err_email_in_use" || key === "err_email_invalid") {
      setField(emailInput, emailMessage, "is-error", key);
    } else if (key === "err_weak_password") {
      setField(passwordInput, passwordMessage, "is-error", key);
    } else {
      showFormAlert(key);
    }
    setLoading(false);
  }
});
