"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Heart, Scissors, LoaderCircle } from "lucide-react";

export function EnrolmentForm({
  initialRole = "customer",
  returnTo = "",
}: {
  initialRole?: "customer" | "professional";
  returnTo?: string;
}) {
  const [role, setRole] = useState(initialRole);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [professionalTermsAccepted, setProfessionalTermsAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (role === "professional" && (!adultConfirmed || !professionalTermsAccepted)) {
      setError("Professional accounts require confirmation that you are 18+ and acceptance of the Professional Terms.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/accounts/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          adultConfirmed: role === "professional" ? adultConfirmed : undefined,
          professionalTermsAccepted:
            role === "professional" ? professionalTermsAccepted : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error?.code === "ACCOUNT_INACTIVE"
            ? "Your account has been restricted. You can’t continue setup."
            : result.error?.code === "UNAUTHENTICATED"
              ? "Your session has ended. Please sign in again."
              : result.error?.code === "INVALID_REQUEST" && role === "professional"
                ? "Confirm you are 18+ and accept the Professional Terms to continue."
                : "We couldn’t finish your account setup. Please try again.",
        );
        setPending(false);
        return;
      }
      window.location.assign(
        role === "customer" && returnTo
          ? returnTo
          : role === "professional"
            ? "/professional/setup"
            : "/account",
      );
    } catch {
      setError("We couldn’t connect. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="enrolment-form">
      <p className="eyebrow">LET’S MAKE THIS YOURS</p>
      <h1>
        What brings you
        <br />
        to GLOHAUS?
      </h1>
      <p>Choose your first workspace. You can add the other one later.</p>
      <fieldset disabled={pending}>
        <legend className="sr-only">Choose your account type</legend>
        <label className={`role-option ${role === "customer" ? "selected" : ""}`}>
          <input
            type="radio"
            name="role"
            value="customer"
            checked={role === "customer"}
            onChange={() => setRole("customer")}
          />
          <Heart size={22} aria-hidden />
          <span>
            <strong>I’m a customer</strong>
            <small>A personal space for your appointments.</small>
          </span>
        </label>
        <label className={`role-option ${role === "professional" ? "selected" : ""}`}>
          <input
            type="radio"
            name="role"
            value="professional"
            checked={role === "professional"}
            onChange={() => setRole("professional")}
          />
          <Scissors size={22} aria-hidden />
          <span>
            <strong>I’m a beauty professional</strong>
            <small>Your independent business starts here.</small>
          </span>
        </label>
      </fieldset>

      {role === "professional" && (
        <fieldset className="editor-form" disabled={pending}>
          <legend>Professional eligibility</legend>
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
              checked={professionalTermsAccepted}
              onChange={(event) => setProfessionalTermsAccepted(event.target.checked)}
            />
            I accept the <Link href="/professional-terms" target="_blank">Professional Terms</Link>.
          </label>
          <small>
            Stripe will separately verify identity and other required details before verified payment features are unlocked.
          </small>
        </fieldset>
      )}

      {error && <p role="alert" className="form-error">{error}</p>}
      <button
        className="button full-width"
        type="submit"
        disabled={
          pending ||
          (role === "professional" && (!adultConfirmed || !professionalTermsAccepted))
        }
      >
        {pending ? "Creating your workspace…" : "Create my workspace"}
        {pending ? (
          <LoaderCircle className="spin" size={18} aria-hidden />
        ) : (
          <ArrowUpRight size={18} aria-hidden />
        )}
      </button>
    </form>
  );
}
