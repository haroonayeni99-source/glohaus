"use client";
import Link from "next/link";
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
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
          : "Set up your GLOHAUS professional account first, then complete verification before your profile can go public or accept marketplace payments. Stripe may ask for phone/contact details, personal or business information, and government ID or a selfie where required."}
      </p>
      <p className="form-help">
        Before verification you can build your profile, services, availability and portfolio privately. Your professional listing stays off the public marketplace until verification is complete.
      </p>
      <label>
        <input
          type="checkbox"
          checked={adultConfirmed}
          onChange={(event) => setAdultConfirmed(event.target.checked)}
        />
        I confirm I am 18 or over.
      </label>
      <label>
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
        />
        I accept the <Link href="/professional-terms" target="_blank">Professional Terms</Link>.
      </label>
      <button
        className="button"
        disabled={busy || !adultConfirmed || !termsAccepted}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch("/api/v1/professional/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                adultConfirmed,
                professionalTermsAccepted: termsAccepted,
              }),
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error?.code === "INVALID_REQUEST"
                  ? "Confirm you are 18+ and accept the Professional Terms before verification."
                  : "Identity verification is not available right now. Please try again shortly.",
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
            : "Complete professional verification"}
      </button>
      {message && <p role="status" className="form-notice">{message}</p>}
    </div>
  );
}
