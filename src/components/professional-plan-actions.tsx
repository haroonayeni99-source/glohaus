"use client";

import { useState } from "react";

import { money } from "@/modules/professionals/domain";
import {
  planPercent,
  type PlanKey,
  type PlanOffer,
} from "@/modules/professionals/plan-pricing";

export function ProfessionalPlanActions({
  currentPlan,
  hasBillingCustomer,
  offers,
}: {
  currentPlan: PlanKey;
  hasBillingCustomer: boolean;
  offers: PlanOffer[];
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
        body: JSON.stringify({
          plan,
          pricingAccepted: accepted,
          quotedPriceId: offers.find((offer) => offer.key === plan)?.priceId,
          quotedMonthlyPricePence: offers.find((offer) => offer.key === plan)
            ?.monthlyPricePence,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Plan pricing or subscription status has changed. Reload this page before continuing."
            : "Paid plan checkout is unavailable right now.",
        );
      window.location.assign(data.url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not open plan checkout.",
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
        {message && (
          <p className="form-notice" role="status">
            {message}
          </p>
        )}
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
        {offers.map((details) => {
          const plan = details.key as "pro" | "premium";
          const ready = details.ready;
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
                : `${details.name} · ${money(details.monthlyPricePence)}/month · ${planPercent(details.serviceCommissionBasisPoints)}`}
            </button>
          );
        })}
      </div>

      {offers.some((offer) => !offer.ready) && (
        <p className="form-help">
          A paid plan is temporarily unavailable. Starter remains available at
          £0/month. Your verification and existing account access are
          unaffected.
        </p>
      )}
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
