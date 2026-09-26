"use client";

import { useState } from "react";

type PlanKey = "starter" | "pro" | "premium";

const paidPlans = {
  pro: { name: "Pro", monthly: "£19.99", commission: "6%" },
  premium: { name: "Premium", monthly: "£39.99", commission: "4%" },
} as const;

export function ProfessionalPlanActions({
  currentPlan,
  hasBillingCustomer,
  proReady,
  premiumReady,
}: {
  currentPlan: PlanKey;
  hasBillingCustomer: boolean;
  proReady: boolean;
  premiumReady: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<PlanKey | "portal" | null>(null);
  const [message, setMessage] = useState("");

  async function choosePlan(plan: "pro" | "premium") {
    setBusy(plan);
    setMessage("");
    try {
      const response = await fetch("/api/v1/professional/plans/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, pricingAccepted: accepted }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "You already have a paid subscription. Manage it through Stripe."
            : "Paid plan checkout is unavailable right now.",
        );
      window.location.assign(data.url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not open plan checkout.",
      );
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy("portal");
    setMessage("");
    try {
      const response = await fetch("/api/v1/professional/plans/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error("Your subscription management page is unavailable.");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not open billing.",
      );
      setBusy(null);
    }
  }

  if (currentPlan !== "starter" || hasBillingCustomer)
    return (
      <section className="pro-panel">
        <h2>Manage your subscription</h2>
        <p>
          Plan changes, cancellation and payment-method updates are confirmed by
          Stripe before GLOHAUS changes your commission rate.
        </p>
        <button
          className="button"
          type="button"
          disabled={busy !== null}
          onClick={() => void manageBilling()}
        >
          {busy === "portal" ? "Opening Stripe…" : "Manage subscription"}
        </button>
        {message && <p className="form-notice" role="status">{message}</p>}
      </section>
    );

  return (
    <section className="pro-panel">
      <h2>Choose a paid plan</h2>
      <p>
        Your new service commission starts only after Stripe confirms the paid
        subscription. Product commission and withdrawal pricing stay unchanged.
      </p>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>
          I acknowledge the monthly price and professional commission shown on
          this page. This is a pricing acknowledgement; the final Professional
          Terms remain separately applicable.
        </span>
      </label>

      <div className="editor-actions">
        {(Object.keys(paidPlans) as Array<"pro" | "premium">).map((plan) => {
          const details = paidPlans[plan];
          const ready = plan === "pro" ? proReady : premiumReady;
          return (
            <button
              key={plan}
              type="button"
              className="button"
              disabled={!accepted || !ready || busy !== null}
              onClick={() => void choosePlan(plan)}
            >
              {busy === plan
                ? "Opening Stripe…"
                : `${details.name} · ${details.monthly}/month · ${details.commission}`}
            </button>
          );
        })}
      </div>

      {(!proReady || !premiumReady) && (
        <p className="form-help">
          Paid plan checkout remains disabled until the matching Stripe monthly
          price is configured. Starter remains fully available.
        </p>
      )}
      {message && <p className="form-notice" role="status">{message}</p>}
    </section>
  );
}
