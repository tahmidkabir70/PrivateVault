// ===== Private Vault — File Description =====
// cover.js
// Responsibility: the public Algebra Formula Reference (index.html) page —
// single-tap formula explanations, the designated double-tap Easter egg,
// language switching, and the help modal. Contains no Firebase calls.

import {
  getLanguage,
  setLanguage,
  t,
  onLanguageChange,
  applyTranslations as applyBaseTranslations,
} from "./firebase.js";

/** The one card id that triggers the hidden entry flow. Not exposed in the DOM. */
const EASTER_EGG_FORMULA_ID = "diff_of_sq";
/** Max gap (ms) between two taps on the egg card to count as a double-tap. */
const DOUBLE_TAP_MS = 350;

const grid = document.getElementById("formulaGrid");
const langToggleBtn = document.getElementById("langToggle");
const helpButton = document.getElementById("helpButton");
const helpDialog = document.getElementById("helpDialog");
const helpCloseButton = document.getElementById("helpCloseButton");

/** Tracks the last tap timestamp per formula card id, for double-tap detection. */
const lastTapAt = new Map();

/**
 * Applies the currently active language to every element carrying a
 * data-i18n key, and re-renders each formula card's expansion/explanation.
 */
function applyTranslations() {
  applyBaseTranslations();
  document.querySelectorAll(".formula-card").forEach((card) => {
    const id = card.getAttribute("data-formula-id");
    const expansionEl = card.querySelector(".formula-expansion");
    const explainEl = card.querySelector(".formula-explain");
    if (expansionEl) expansionEl.textContent = t(`f_${id}_expansion`);
    if (explainEl) explainEl.textContent = t(`f_${id}_explain`);
  });
}

/** Toggles a formula card's expanded/collapsed state. */
function toggleCard(card) {
  const expanded = card.getAttribute("aria-expanded") === "true";
  card.setAttribute("aria-expanded", expanded ? "false" : "true");
}

/**
 * Plays a quiet "unlock" animation on the designated card, then hands off
 * to the authentication entry point once the animation completes.
 * @param {HTMLElement} card - The Easter-egg formula card element.
 */
function triggerEntryFlow(card) {
  card.classList.add("pv-unlocking");
  card.setAttribute("aria-expanded", "false");
  card.disabled = true;
  window.setTimeout(() => {
    window.location.href = "login.html";
  }, 560);
}

function handleCardTap(card) {
  const id = card.getAttribute("data-formula-id");
  const now = Date.now();

  if (id === EASTER_EGG_FORMULA_ID) {
    const previous = lastTapAt.get(id) ?? 0;
    if (now - previous < DOUBLE_TAP_MS) {
      lastTapAt.delete(id);
      triggerEntryFlow(card);
      return;
    }
    lastTapAt.set(id, now);
  }

  toggleCard(card);
}

grid.addEventListener("click", (event) => {
  const card = event.target.closest(".formula-card");
  if (!card) return;
  handleCardTap(card);
});

// ---- Language switcher ----
langToggleBtn.addEventListener("click", () => {
  const next = getLanguage() === "bn" ? "en" : "bn";
  setLanguage(next);
});

onLanguageChange(() => applyTranslations());

// ---- Help modal ----
let lastFocusedBeforeDialog = null;

function openHelpDialog() {
  lastFocusedBeforeDialog = document.activeElement;
  helpDialog.hidden = false;
  helpCloseButton.focus();
  document.addEventListener("keydown", handleDialogKeydown);
}

function closeHelpDialog() {
  helpDialog.hidden = true;
  document.removeEventListener("keydown", handleDialogKeydown);
  if (lastFocusedBeforeDialog instanceof HTMLElement) {
    lastFocusedBeforeDialog.focus();
  }
}

function handleDialogKeydown(event) {
  if (event.key === "Escape") {
    closeHelpDialog();
  }
}

helpButton.addEventListener("click", openHelpDialog);
helpCloseButton.addEventListener("click", closeHelpDialog);
helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) closeHelpDialog();
});

// ---- Init ----
document.documentElement.setAttribute("lang", getLanguage());
applyTranslations();
const yearEl = document.getElementById("pvYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
