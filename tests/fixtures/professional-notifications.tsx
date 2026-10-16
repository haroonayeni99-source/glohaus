// Local UI-only fixture. Contains no production users or delivery credentials.
import React from "react";
import { createRoot } from "react-dom/client";
import { ProfessionalNotificationSettings } from "@/components/professional-notification-settings";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { NotificationInbox } from "@/components/notification-inbox";
import {
  notificationCategories,
  mandatoryEmail,
  type NotificationPreference,
} from "@/modules/notifications/preferences";
import "@/components/professional-notifications.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const initial = {
  preferences: notificationCategories.map((category) => ({
    category,
    email: category !== "promotions",
    push: false,
  })),
  devices: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      label: "Fixture phone",
      created_at: "2026-10-15T12:00:00Z",
      last_success_at: null,
      disabled_at: null as string | null,
    },
  ],
};
const data = JSON.parse(
  sessionStorage.getItem("notification-settings") || JSON.stringify(initial),
);
window.fetch = async (url, options) => {
  if (params.get("fail") === "1")
    return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
  if (options?.method === "PATCH") {
    const p = JSON.parse(String(options.body)) as NotificationPreference;
    if (mandatoryEmail.has(p.category) && !p.email)
      return Response.json({}, { status: 400 });
    data.preferences = data.preferences.map((v: NotificationPreference) =>
      v.category === p.category ? p : v,
    );
    sessionStorage.setItem("notification-settings", JSON.stringify(data));
  }
  if (options?.method === "POST") {
    const p = JSON.parse(String(options.body));
    if (p.action === "disable")
      data.devices = data.devices.map(
        (v: (typeof initial.devices)[number]) => ({
          ...v,
          disabled_at: new Date().toISOString(),
        }),
      );
  }
  return Response.json(data);
};
createRoot(document.getElementById("root")!).render(
  <div className="pro-app">
    <ProfessionalNavigation active="more" displayName="Fixture Professional"/>
    <main className="pro-main pro-management-page">
      <p className="pro-kicker">LOCAL TEST · FICTIONAL RECORDS</p>
      <h1>Notifications</h1>
      <ProfessionalNotificationSettings
        initial={data}
        publicKey={null}
        pushConfigured={false}
      />
      <NotificationInbox
        professional
        initialNotifications={[
          {
            id: "notification",
            booking_id: null,
            product_order_id: null,
            kind: "customer_message",
            title: "New customer message",
            body: "A customer sent you a private message. Open your inbox to reply.",
            href: "/messages",
            read_at: null,
            created_at: new Date(),
          },
        ]}
      />
    </main>
  </div>,
);
