import React from "react";
import { createRoot } from "react-dom/client";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
import { OwnerDeviceCheck } from "@/components/owner-device-check";
import { ContactForm } from "@/components/contact-form";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") || "light";
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
    {query.get("view") === "phone" ? (
      <OwnerDeviceCheck />
    ) : query.get("view") === "contact" ? (
      <ContactForm defaultTopic="Privacy & data request" />
    ) : (
      <AdminSupportInbox
        owner={query.get("role") !== "admin"}
        initial={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Fictional Customer",
            email: "fictional@example.test",
            topic: "Privacy & data request",
            reference: "",
            message:
              "Please provide the personal information held about my fictional account",
            status: "open",
            created_at: "2026-10-25T12:00:00Z",
          },
        ]}
      />
    )}
  </main>,
);
