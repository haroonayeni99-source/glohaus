/* One GLOHAUS worker for installation, static offline help and existing push.
   Never cache pages, APIs, payment responses, uploads, maps or account data. */
const STATIC_CACHE = "glohaus-pwa-static-v4";
const OFFLINE_URL = "/offline.html";
const STATIC_FILES = [OFFLINE_URL, "/icons/glohaus-192.png", "/icons/glohaus-512.png", "/icons/apple-touch-icon.png", "/icons/glohaus-maskable-512.png", "/icons/glohaus-home-192-v2.png", "/icons/glohaus-home-512-v2.png", "/icons/glohaus-home-apple-180-v2.png", "/icons/glohaus-home-maskable-512-v2.png", "/icons/glohaus-home-192-v3.png", "/icons/glohaus-home-512-v3.png", "/icons/glohaus-home-apple-180-v3.png", "/icons/glohaus-home-maskable-512-v3.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) =>
    cache.addAll(STATIC_FILES.map((url) => new Request(url, { cache: "reload", credentials: "omit" }))),
  ));
  // No skipWaiting: keep open bookings, payments and forms on their current worker.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("glohaus-pwa-static-") && key !== STATIC_CACHE)
    .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "GLOHAUS_ACTIVATE_UPDATE" && event.source?.url &&
      new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil(self.skipWaiting());
  }
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Exact allowlist; never cache query-bearing assets or arbitrary responses.
  if (!url.search && STATIC_FILES.includes(url.pathname)) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) =>
      (await cache.match(url.pathname)) || fetch(request),
    ));
    return;
  }
  if (request.mode !== "navigate" || url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/_next/")) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return new Response(offline ? await offline.text() : "GLOHAUS is offline. Reconnect to view current account and booking information.", {
      status: 503,
      headers: { "Content-Type": offline ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
    });
  }));
});
async function reportReceipt(token, kind) {
  if (typeof token !== "string" || token.length > 500) return;
  try {
    await fetch("/api/v1/notifications/push-receipt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind }), cache: "no-store", credentials: "omit",
    });
  } catch {} // Receipt failure must not prevent display or opening the booking.
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {}
  const href =
    typeof data.href === "string" &&
    /^\/(?!\/)[a-zA-Z0-9_/?=&-]*$/.test(data.href)
      ? data.href
      : "/notifications?view=professional";
  event.waitUntil(
    self.registration.showNotification(href.startsWith("/account/bookings/") ? "GLOHAUS appointment update" : "GLOHAUS update", {
      body: href.startsWith("/account/bookings/") && ["Leave in approximately 15 minutes","Leave in approximately 5 minutes","It’s time to leave for your appointment"].includes(data.departureReminder) ? data.departureReminder : "You have a new update. Open your dashboard to view it securely.",
      icon: "/icons/glohaus-192.png",
      badge: "/icons/glohaus-192.png",
      tag: typeof data.tag === "string" ? data.tag : "glohaus-update",
      renotify: false,
      data: { href, deliveryReceipt: data.deliveryReceipt },
    }).then(() => reportReceipt(data.deliveryReceipt, "displayed")),
  );
});
async function openNotificationDestination(url) {
  let windows = [];
  try {
    windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  } catch {} // A suspended client list must not prevent opening the app.
  const candidates = windows.filter((client) => {
    try {
      return new URL(client.url).origin === self.location.origin && typeof client.focus === "function";
    } catch { return false; }
  });
  // Reuse the destination first, rather than redirecting an unrelated open tab.
  candidates.sort((a, b) => Number(b.url === url.href) - Number(a.url === url.href));
  for (const client of candidates) {
    try {
      // Focus while the notification tap still grants user activation. Waiting
      // for a page load first can lose Android's permission to foreground it.
      const focused = await client.focus();
      if (!focused) continue;
      // Client.url can lag behind Next.js client-side navigation. Reload the
      // target even when its last document URL appears to match.
      if (typeof focused.navigate === "function" && await focused.navigate(url.href)) return;
    } catch {} // Closed/suspended windows must not swallow the notification tap.
  }
  // Chrome for Android can route this into the installed standalone app.
  const opened = await self.clients.openWindow(url.href);
  if (opened && typeof opened.focus === "function") {
    try { await opened.focus(); } catch {} // The destination is already open.
  }
}
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href;
  const url = new URL(
    typeof href === "string" && /^\/(?!\/)[a-zA-Z0-9_/?=&-]*$/.test(href)
      ? href
      : "/notifications?view=professional",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    Promise.all([openNotificationDestination(url), reportReceipt(event.notification.data?.deliveryReceipt, "clicked")]),
  );
});
