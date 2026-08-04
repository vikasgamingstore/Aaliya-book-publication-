// ============================================================
// PWA: service worker, install prompt, device notifications
// ============================================================

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(err => {
      console.warn("Service worker registration failed:", err.message);
    });
  });
}

// ---------- Install prompt (Add to Home Screen) ----------
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById("install-banner")) return;
  if (localStorage.getItem("abp-install-dismissed") === "1") return;

  const banner = document.createElement("div");
  banner.id = "install-banner";
  banner.className = "install-banner";
  banner.innerHTML = `
    <img src="/icons/icon-192.png" alt="" width="40" height="40">
    <div class="install-text">
      <strong>Install app</strong>
      <span>Use Aaliya Books like an app on your phone</span>
    </div>
    <button class="btn btn-brass btn-sm" id="install-yes">Install</button>
    <button class="install-close" id="install-no" aria-label="Close">&times;</button>
  `;
  document.body.appendChild(banner);

  document.getElementById("install-yes").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    banner.remove();
  });

  document.getElementById("install-no").addEventListener("click", () => {
    localStorage.setItem("abp-install-dismissed", "1");
    banner.remove();
  });
}

window.addEventListener("appinstalled", () => {
  document.getElementById("install-banner")?.remove();
});

// ---------- Device notifications for new updates ----------
async function enableDeviceNotifications() {
  if (!("Notification" in window)) {
    alert("Your browser does not support notifications.");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    localStorage.setItem("abp-notifications", "on");
    new Notification("Aaliya Book Publication", {
      body: "Notifications on ho gaye — ab project updates orhan milenge.",
      icon: "/icons/icon-192.png",
    });
    return true;
  }
  return false;
}

function notificationsEnabled() {
  return "Notification" in window
    && Notification.permission === "granted"
    && localStorage.getItem("abp-notifications") === "on";
}

// Show a device notification for unread items the user hasn't been alerted about yet
function showDeviceNotification(notification) {
  if (!notificationsEnabled()) return;
  const seenKey = "abp-notified-" + notification.id;
  if (localStorage.getItem(seenKey)) return;

  try {
    new Notification("Aaliya Book Publication", {
      body: notification.message,
      icon: "/icons/icon-192.png",
      tag: notification.id,
    });
    localStorage.setItem(seenKey, "1");
  } catch (err) {
    console.warn("Notification failed:", err.message);
  }
}
