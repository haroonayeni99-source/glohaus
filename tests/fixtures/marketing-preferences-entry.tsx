import React from "react";
import { createRoot } from "react-dom/client";
import { MarketingPreferencesForm } from "@/components/marketing-preferences-form";
import { marketingPreferenceFields } from "@/lib/marketing-preferences";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") || "light";
const professional = params.get("role") === "professional";
const initial = JSON.parse(
  localStorage.getItem("marketing-preferences") ||
    JSON.stringify({
      customer_offers: true,
      professional_growth: true,
      updated_at: "2026-10-14",
      unsubscribe_token: "fixture-private-token",
    }),
);
window.fetch = async (_url, init) => {
  sessionStorage.setItem("last-request", String(init?.body));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const fail = sessionStorage.getItem("fail-save");
  if (fail) {
    sessionStorage.removeItem("fail-save");
    return Response.json(
      { error: { code: fail } },
      { status: fail === "UNAUTHENTICATED" ? 401 : 503 },
    );
  }
  const body = JSON.parse(String(init?.body));
  if (Object.keys(body).some((key) => !(key in marketingPreferenceFields)))
    return Response.json(
      { error: { code: "INVALID_REQUEST" } },
      { status: 400 },
    );
  const raw = Object.fromEntries(
    Object.entries(marketingPreferenceFields).map(([key, column]) => [
      column,
      body[key],
    ]),
  );
  localStorage.setItem(
    "marketing-preferences",
    JSON.stringify({
      ...raw,
      updated_at: "2026-10-15",
      unsubscribe_token: "fixture-private-token",
    }),
  );
  return Response.json({ preferences: raw });
};
createRoot(document.getElementById("root")!).render(
  <div className={professional ? "pro-app" : "customer-app"}>
    <main
      id="main"
      className={
        professional ? "pro-main pro-management-page" : "customer-account-page"
      }
    >
      <p className="eyebrow">EMAIL PREFERENCES</p>
      <h1>Choose what GLOHAUS sends you.</h1>
      <p className="lead">
        Marketing is optional. Booking, order, security, verification and payout
        emails stay separate and may still be sent when needed.
      </p>
      <MarketingPreferencesForm initial={initial} professional={professional} />
    </main>
  </div>,
);
