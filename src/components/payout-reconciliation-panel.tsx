"use client";
import { useState } from "react";
type Check = {
  id: string;
  professional: string;
  platformStatus: string;
  stripeStatus: string | null;
  issues: string[];
};
export function PayoutReconciliationPanel() {
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setMessage("");
    setChecks(null);
    try {
      const response = await fetch("/api/v1/admin/payout-reconciliation", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "The check is unavailable. Your access may need verification, or Stripe may be unavailable.",
        );
      const data = await response.json();
      setChecks(data.checks);
      setMessage(
        `Checked the latest ${data.checks.length} withdrawals. This check does not move money or change wallet records.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The check is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="service-edit-list">
      <h3>Check payouts against Stripe</h3>
      <p>
        Compare up to 10 recent withdrawals with Stripe. Review missing
        confirmations, delays and discrepancies before taking action. Never send
        a replacement for an unconfirmed withdrawal.
      </p>
      <div>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void check()}
        >
          {busy ? "Checking…" : "Check recent payouts"}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {checks?.map((row) => (
        <article key={row.id} className="service-edit-row">
          <div>
            <h3>{row.professional}</h3>
            <p>
              GLOHAUS: {row.platformStatus} · Stripe:{" "}
              {row.stripeStatus || "Not confirmed"}
            </p>
            {row.issues.length ? (
              <ul>
                {row.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p>Records agree at the time of this check.</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
