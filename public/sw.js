/* GLOHAUS Web Push worker. No authenticated pages or API responses are cached. */
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
    self.registration.showNotification(href.startsWith("/account/bookings/") ? "GLOHAUS appointment update" : "GLOHAUS professional update", {
      body: href.startsWith("/account/bookings/") && ["Leave in approximately 15 minutes","Leave in approximately 5 minutes","It’s time to leave for your appointment"].includes(data.departureReminder) ? data.departureReminder : "You have a new update. Open your dashboard to view it securely.",
      icon: "/icons/glohaus-192.png",
      badge: "/icons/glohaus-192.png",
      tag: typeof data.tag === "string" ? data.tag : "glohaus-update",
      renotify: false,
      data: { href, deliveryReceipt: data.deliveryReceipt },
    }).then(() => reportReceipt(data.deliveryReceipt, "displayed")),
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
    Promise.all([reportReceipt(event.notification.data?.deliveryReceipt, "clicked"), self.clients
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
      })]),
  );
});
