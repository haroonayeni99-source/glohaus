import React from "react";
import { createRoot } from "react-dom/client";
import AdminPage from "@/app/admin/page";
import { MessageCentre } from "@/components/message-centre";
import { ProfilePhotoEditor } from "@/components/profile-photo-editor";
import { ThemeToggle } from "@/components/theme-toggle";
import { ids } from "./data";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
localStorage.setItem("glohaus-theme", document.documentElement.dataset.theme);
// Every mutation is recorded and answered locally; there are no production credentials.
window.fetch = async (url, init) => {
  const requests = JSON.parse(sessionStorage.getItem("audit-requests") || "[]");
  requests.push({ url: String(url), method: init?.method || "GET", body: init?.body });
  sessionStorage.setItem("audit-requests", JSON.stringify(requests));
  if (params.get("response") === "mfa") return Response.json({ error: { code: "MFA_REQUIRED" } }, { status: 403 });
  if (String(url).endsWith("/upload")) return Response.json({ url: "https://image.example.test/homepage.webp" }, { status: 201 });
  if (String(url).includes("/profile/photo")) return Response.json({ id: ids.pro }, { status: 201 });
  if (String(url).includes("/messages/")) return Response.json({ messages: [], next: null });
  if (String(url).includes("/admin/categories")) return Response.json({ saved: true, id: "44444444-4444-4444-8444-444444444444" });
  return Response.json({ saved: true, campaign: { recipients: 0 }, featureId: ids.pro });
};
async function start() {
  let content: React.ReactNode;
  if (location.pathname === "/messages") {
    const professional = params.get("role") === "professional";
    content = <main id="main" className={professional ? "pro-main pro-message-page" : "messages-page"}>
      <MessageCentre initialConversations={[]} activeConversation={{ id: ids.pro, customer_name: "Alex Customer", professional_name: "Maya Studio", participant_role: professional ? "professional" : "customer" }}
        initialMessages={Array.from({ length: 30 }, (_, i) => ({ id: String(i), booking_id: null, sender_role: i % 2 ? "professional" : "customer", body: i % 2 ? "Thanks for booking. See you tomorrow!" : "Hello, can you confirm my appointment?", created_at: "2026-10-10T12:00:00Z" }))}
        initialCursor="cursor" initialPrevious={null} bookingId={null} professionalId={null} draftRecipientName={null} professionalMessaging={professional} />
    </main>;
  } else if (location.pathname === "/photo") content = <main id="main" className="pro-main"><ProfilePhotoEditor photo={null} published /></main>;
  else content = await AdminPage();
  createRoot(document.getElementById("root")!).render(<>{content}<ThemeToggle /></>);
}
void start();
