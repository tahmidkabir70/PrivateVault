/* Private Vault — theme.js
   Dark / light theme switcher. Classic (non-module) script so it runs
   before first paint and avoids a flash. Add to every page's <head>:
   <script src="js/theme.js"></script> */
(function() {
  var KEY = "pv_theme";
  
  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) { /* storage blocked: fall through */ }
    return "dark"; // the app's original look
  }
  
  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
  }
  
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "light" ? "#f5f1ff" : "#0a0713";
  }
  
  var current = read();
  apply(current);
  
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/theme.css";
  document.head.appendChild(link);
  
  function label(theme) {
    return theme === "light" ?
      "ডার্ক থিমে যান / Switch to dark theme" :
      "লাইট থিমে যান / Switch to light theme";
  }
  
  function mountButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    
    function paint() {
      btn.textContent = current === "light" ? "☾" : "☀";
      btn.setAttribute("aria-label", label(current));
      btn.title = label(current);
    }
    btn.addEventListener("click", function() {
      current = current === "light" ? "dark" : "light";
      apply(current);
      save(current);
      paint();
    });
    paint();
    document.body.appendChild(btn);
  }
  
  if (document.body) mountButton();
  else document.addEventListener("DOMContentLoaded", mountButton);
})();