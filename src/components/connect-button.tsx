"use client";
import { useState } from "react";
export function ConnectButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="editor-form">
      <h2>Receive your deposits.</h2>
      <p className="lead">
        Connect your business to Stripe to receive payments. Stripe handles
        verification and bank details.
      </p>
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch("/api/v1/professional/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                "Payment setup is not available yet. Please try again once Stripe is connected to glohaus.",
              );
            window.location.href = result.url;
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Could not open Stripe.",
            );
            setBusy(false);
          }
        }}
      >
        Set up Stripe deposits
      </button>
      {message && (
        <p role="status" className="form-notice">
          {message}
        </p>
      )}
    </div>
  );
}
