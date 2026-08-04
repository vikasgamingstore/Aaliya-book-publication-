// ============================================================
// Aaliya Book Publication — Service Worker
// Offline-ready app shell + fast loading on slow connections
// ============================================================

const CACHE_VERSION = "abp-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/login.html",
  "/signup.html",
  "/payment.html",
  "/about.html",
  "/help.html",
  "/css/style.css",
  "/js/main.js",
  "/js/auth.js",
  "/js/dashboard.js",
  "/js/security.js",
  "/js/landing.js",
  "/js/payment.js",
  "/js/apply.js",
  "/js/i18n.js",
  "/js/chat.js",
  "/js/supabase-config.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache Supabase API/auth calls — always go to network
  if (url.hostname.includes("supabase")) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ offline: true }), { headers: { "Content-Type": "application/json" } }
    )));
    return;
  }

  // Fonts & CDN scripts: cache-first (they rarely change)
  if (url.hostname.includes("fonts.g") || url.hostname.includes("cdn.jsdelivr")) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // Same-origin pages/assets: network-first, fall back to cache when offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("/index.html")))
    );
  }
});

// Show a notification pushed from the server (if push is configured later)
self.addEventListener("push", event => {
  let payload = { title: "Aaliya Book Publication", body: "Aapke project mein naya update hai." };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/dashboard.html" },
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return clients.openWindow(target);
    })
  );
});
