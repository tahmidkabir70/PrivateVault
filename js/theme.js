/* Private Vault — theme.js
   1. Apply theme before first paint.
   2. Register manifest + service worker.
   3. After the vault is unlocked, subscribe to push notifications so
      the Cloudflare Worker can reach this device even when the app is
      fully closed. On the cover page, nothing push-related runs.
   4. When the INSTALLED app is opened, close delivered notifications so
      the red dot on the Android icon goes away. Browser tabs never do this. */
(function() {
  "use strict";
  
  /* ---------- 1. Theme ---------- */
  var THEME_KEY = "pv_theme";
  
  function readTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "dark";
  }
  
  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
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
  
  var themeLink = document.createElement("link");
  themeLink.rel = "stylesheet";
  themeLink.href = "css/theme.css";
  document.head.appendChild(themeLink);
  
  function themeLabel(theme) {
    return theme === "light" ?
      "ডার্ক থিমে যান / Switch to dark theme" :
      "লাইট থিমে যান / Switch to light theme";
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
    
    btn.addEventListener("click", function() {
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
  function ensureManifestLink() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.json";
    document.head.appendChild(link);
  }
  
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    
    window.addEventListener("load", function() {
      navigator.serviceWorker
        .register("sw.js", { scope: "./" })
        .catch(function(err) {
          console.warn("[PWA] Service worker registration failed:", err);
        });
    });
  }
  
  /* ---------- 3. Push subscription (vault unlock only) ---------- */
  
  function isVaultUnlockedHere() {
    try {
      return sessionStorage.getItem("pv_vault_unlocked") === "1";
    } catch (e) {
      return false;
    }
  }
  
  // We need the current uid, but theme.js is a classic (non-module)
  // script. We therefore import a tiny inline module on demand that
  // reads auth state and calls subscribeToPush.
  function loadPushSubscription() {
    if (!isVaultUnlockedHere()) return;
    
    import("./firebase.js").then(function(fb) {
      return import("./auth.js").then(function(authMod) {
        authMod.observeAuthState(function(user) {
          if (!user) return;
          if (!fb.isVaultUnlocked()) return;
          import("./push-subscribe.js")
            .then(function(pushMod) {
              pushMod.subscribeToPush(user.uid).catch(function(err) {
                console.warn("[push] subscribe failed:", err);
              });
            })
            .catch(function(err) {
              console.warn("[push] push-subscribe.js load failed:", err);
            });
        });
      });
    }).catch(function(err) {
      console.warn("[push] module load failed:", err);
    });
  }
  
  /* ---------- 4. Clear delivered notifications (installed app only) ---------- */
  /* The red dot on the Android icon stays as long as a notification is in
     the tray. When the installed app is opened, close them so the dot goes.
     Normal browser tabs on the same site must NOT do this. */
  function isInstalledApp() {
    try {
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }
  
  function clearDeliveredNotifications() {
    if (!isInstalledApp()) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then(function(reg) {
        if (!reg.getNotifications) return;
        return reg.getNotifications().then(function(list) {
          list.forEach(function(n) { n.close(); });
        });
      })
      .catch(function() {});
  }
  
  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") clearDeliveredNotifications();
  });
  window.addEventListener("pageshow", clearDeliveredNotifications);
  
  ensureManifestLink();
  registerServiceWorker();
  
  loadPushSubscription();
  window.addEventListener("load", loadPushSubscription);
})();