import React from "react";
import { createRoot } from "react-dom/client";
import { AdminManager } from "@/components/admin-manager";
import { overview } from "./ui-audit/data";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const base = overview.users[0];
overview.users = [
  { ...base, business_name: "Fixture Test Studio" },
  {
    ...base,
    id: "44444444-4444-4444-8444-444444444444",
    display_name: "Hidden Fixture",
    public_hidden_at: "2026-10-15T12:00:00Z",
  },
  {
    ...base,
    id: "55555555-5555-4555-8555-555555555555",
    display_name: "Deleted Fixture",
    status: "removed",
    deleted_at: "2026-10-15T12:00:00Z",
    auth_cleanup_pending: true,
    roles: [],
  },
  {
    ...base,
    id: "66666666-6666-4666-8666-666666666666",
    display_name: "Owner Fixture",
    roles: ["owner", "admin"],
  },
];
window.fetch = async (url, init) => {
  const requests = JSON.parse(
    sessionStorage.getItem("account-requests") || "[]",
  );
  requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  sessionStorage.setItem("account-requests", JSON.stringify(requests));
  if (params.get("fail") === "1")
    return Response.json({ error: { code: "MFA_REQUIRED" } }, { status: 403 });
  return Response.json({
    saved: true,
    message: "Fixture action saved; history retained.",
  });
};
createRoot(document.getElementById("root")!).render(
  <main
    className="admin-page"
    style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}
  >
    <h1>Account management fixture</h1>
    <AdminManager data={overview} owner hardDeleteConfigured={false} />
  </main>,
);
