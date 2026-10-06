// Service Worker চালু করা
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      console.log("Formula Sheet Service Worker registered");
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  });
}


// 🔴 App Icon Badge সেট করা
async function setUnreadBadge(count) {
  if (!("setAppBadge" in navigator)) {
    console.log("App Badge API এই browser-এ supported নয়");
    return;
  }
  
  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
      console.log(`Badge set: ${count}`);
    } else {
      await clearUnreadBadge();
    }
  } catch (error) {
    console.error("Badge set করা যায়নি:", error);
  }
}


// 🔴 App Icon Badge মুছে ফেলা
async function clearUnreadBadge() {
  if (!("clearAppBadge" in navigator)) {
    return;
  }
  
  try {
    await navigator.clearAppBadge();
    console.log("Badge cleared");
  } catch (error) {
    console.error("Badge clear করা যায়নি:", error);
  }
}


// 🧪 TEST
// এখন শুধু পরীক্ষা করার জন্য 3 দেখাবে।
setUnreadBadge(3);