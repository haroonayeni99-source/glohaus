"use client";
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/accounts/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error?.code === "ACCOUNT_INACTIVE"
            ? "Your account has been restricted. You can’t continue setup."
            : result.error?.code === "UNAUTHENTICATED"
              ? "Your session has ended. Please sign in again."
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
        to glohaus?
      </h1>
      <p>Choose your first workspace. You can add the other one later.</p>
      <fieldset disabled={pending}>
        <legend className="sr-only">Choose your account type</legend>
        <label
          className={`role-option ${role === "customer" ? "selected" : ""}`}
        >
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
        <label
          className={`role-option ${role === "professional" ? "selected" : ""}`}
        >
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
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button full-width" type="submit" disabled={pending}>
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
