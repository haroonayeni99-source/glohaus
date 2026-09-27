"use client";
import { useState } from "react";
import { BadgeCheck, CircleAlert, ShieldCheck } from "lucide-react";

type VerificationStatus = "unverified" | "pending" | "verified" | "restricted";

export function ConnectButton({
  status = "unverified",
}: {
  status?: VerificationStatus;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (status === "verified")
    return (
      <div className="editor-form" id="verification">
        <h2><BadgeCheck size={21} aria-hidden /> Identity verified</h2>
        <p className="lead">
          Stripe has completed the verification required for your GLOHAUS
          professional payment account. Verified marketplace features are unlocked
          subject to your account standing and plan.
        </p>
      </div>
    );

  if (status === "restricted")
    return (
      <div className="editor-form" id="verification">
        <h2><CircleAlert size={21} aria-hidden /> Verification restricted</h2>
        <p className="lead">
          This professional account currently has a verification or account-standing
          restriction. New paid marketplace activity remains limited while it is reviewed.
        </p>
      </div>
    );

  return (
    <div className="editor-form" id="verification">
      <h2><ShieldCheck size={21} aria-hidden /> Verify your identity</h2>
      <p className="lead">
        {status === "pending"
          ? "Your Stripe verification is in progress. Continue the secure Stripe process if more information is requested."
          : "Verification is optional for getting started. Complete Stripe identity verification to unlock paid deposits, product selling, payouts and other verified features."}
      </p>
      <p className="form-help">
        Until verified, active services are limited to £200 or less with no online
        deposit, and your account can use up to five starter bookings.
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
                "Identity verification is not available right now. Please try again shortly.",
              );
            window.location.assign(result.url);
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Could not open Stripe verification.",
            );
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Opening Stripe…"
          : status === "pending"
            ? "Continue verification"
            : "Verify identity with Stripe"}
      </button>
      {message && (
        <p role="status" className="form-notice">
          {message}
        </p>
      )}
    </div>
  );
}
