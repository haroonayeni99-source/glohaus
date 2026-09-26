"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

export function PayoutDashboardButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openDashboard() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/professional/connect/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "ONBOARDING_REQUIRED"
            ? "Complete Stripe payout setup before opening your payout dashboard."
            : "Your Stripe payout dashboard is unavailable right now.",
        );
      window.location.href = data.url;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your Stripe payout dashboard is unavailable right now.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="editor-form">
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void openDashboard()}
      >
        <ExternalLink size={16} aria-hidden />
        {busy
          ? "Opening Stripe…"
          : "Manage payout details in Stripe"}
      </button>
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
