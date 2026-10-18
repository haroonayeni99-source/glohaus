/* GLOHAUS Web Push worker. No authenticated pages or API responses are cached. */
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
    self.registration.showNotification(href.startsWith("/account/bookings/") ? "GLOHAUS appointment update" : "GLOHAUS professional update", {
      body: href.startsWith("/account/bookings/") && ["Leave in approximately 15 minutes","Leave in approximately 5 minutes","It’s time to leave for your appointment"].includes(data.departureReminder) ? data.departureReminder : "You have a new update. Open your dashboard to view it securely.",
      icon: "/icons/glohaus-192.png",
      badge: "/icons/glohaus-192.png",
      tag: typeof data.tag === "string" ? data.tag : "glohaus-update",
      renotify: false,
      data: { href },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href;
  const url = new URL(
    typeof href === "string" && /^\/(?!\/)/.test(href)
      ? href
      : "/notifications?view=professional",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if (
            new URL(client.url).origin === self.location.origin &&
            "focus" in client
          ) {
            await client.navigate(url.href);
            return client.focus();
          }
        }
        return self.clients.openWindow(url.href);
      }),
  );
});
