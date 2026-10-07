/* Private Vault — theme.js
   Two jobs, in this order:
     1. Apply the saved dark/light theme before first paint (no flash).
     2. Register the PWA plumbing: <link rel="manifest"> and the
        service worker. Both must run on every page, which is why they
        live here — theme.js is already loaded from every <head>.
   Classic (non-module) script on purpose: it must run before the
   module scripts so the theme attribute is set before first paint. */
(function () {
  "use strict";

  /* ---------- 1. Theme ---------- */

  var THEME_KEY = "pv_theme";

  function readTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) { /* storage blocked: fall through */ }
    return "dark";
  }

  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "light" ? "#f5f1ff" : "#0a0713";
  }

  var currentTheme = readTheme();
  applyTheme(currentTheme);

  /* theme.css is injected here (instead of a <link> in each HTML) so
     that adding the theme to a new page is a one-line change. */
  var themeLink = document.createElement("link");
  themeLink.rel = "stylesheet";
  themeLink.href = "css/theme.css";
  document.head.appendChild(themeLink);

  function themeLabel(theme) {
    return theme === "light"
      ? "ডার্ক থিমে যান / Switch to dark theme"
      : "লাইট থিমে যান / Switch to light theme";
  }

  function mountThemeButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";

    function paint() {
      btn.textContent = currentTheme === "light" ? "☾" : "☀";
      btn.setAttribute("aria-label", themeLabel(currentTheme));
      btn.title = themeLabel(currentTheme);
    }

    btn.addEventListener("click", function () {
      currentTheme = currentTheme === "light" ? "dark" : "light";
      applyTheme(currentTheme);
      saveTheme(currentTheme);
      paint();
    });

    paint();
    document.body.appendChild(btn);
  }

  if (document.body) mountThemeButton();
  else document.addEventListener("DOMContentLoaded", mountThemeButton);

  /* ---------- 2. PWA plumbing ---------- */

  // Inject the manifest link if the page did not already declare one.
  // Doing it here means we do not have to edit eleven HTML files.
  function ensureManifestLink() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.json";
    document.head.appendChild(link);
  }

  // Register the service worker. Only runs on secure origins (https or
  // localhost), which is exactly where PWA installability is required.
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        // Registration failure must never break the page — log only.
        console.warn("[PWA] Service worker registration failed:", err);
      });
    });
  }

  ensureManifestLink();
  registerServiceWorker();
})();