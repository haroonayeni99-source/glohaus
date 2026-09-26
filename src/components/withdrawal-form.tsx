"use client";

import { useMemo, useState } from "react";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function WithdrawalForm({
  availablePence,
  instantBlocked,
  instantConfigured,
}: {
  availablePence: number;
  instantBlocked: boolean;
  instantConfigured: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"standard" | "instant" | null>(null);
  const [message, setMessage] = useState("");
  const pence = useMemo(
    () => Math.round(Number(amount || 0) * 100),
    [amount],
  );
  const instantFee = Math.round(pence * 0.04);
  const instantBank = Math.max(0, pence - instantFee);
  const valid = pence >= 100 && pence <= availablePence;

  async function withdraw(kind: "standard" | "instant") {
    setBusy(kind);
    setMessage("");
    try {
      const response = await fetch("/api/v1/professional/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, amountPence: pence }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = data.error?.code;
        throw new Error(
          code === "INSTANT_PAYOUT_UNAVAILABLE"
            ? "Instant withdrawal is not available for your current payout account."
            : code === "INSTANT_PAYOUT_SETUP_REQUIRED"
              ? "Instant withdrawals are being configured. Standard withdrawal is available."
              : code === "INSUFFICIENT_AVAILABLE_BALANCE"
                ? "That amount is no longer available to withdraw."
                : "We could not start this withdrawal. Your available balance has not been lost.",
        );
      }
      setMessage(
        kind === "instant"
          ? `Instant withdrawal started. ${money(data.payout.bankAmountPence)} is being sent after the 4% fee.`
          : `Standard withdrawal started for ${money(data.payout.bankAmountPence)} with no GLOHAUS withdrawal fee.`,
      );
      setAmount("");
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start withdrawal.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="editor-form">
      <label>
        Withdrawal amount
        <div className="money-input">
          <span>£</span>
          <input
            inputMode="decimal"
            min="1"
            max={(availablePence / 100).toFixed(2)}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            aria-describedby="withdrawal-balance"
          />
        </div>
      </label>
      <p id="withdrawal-balance" className="form-help">
        Available: {money(availablePence)}
      </p>

      {pence > 0 && (
        <div className="payment-summary">
          <div>
            <span>Standard</span>
            <strong>{money(pence)}</strong>
            <small>GLOHAUS fee: Free</small>
          </div>
          <div>
            <span>Instant</span>
            <strong>{money(instantBank)}</strong>
            <small>4% GLOHAUS fee: {money(instantFee)}</small>
          </div>
        </div>
      )}

      <div className="editor-actions">
        <button
          type="button"
          className="button"
          disabled={!valid || busy !== null}
          onClick={() => void withdraw("standard")}
        >
          {busy === "standard" ? "Starting…" : "Standard withdrawal · Free"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={
            !valid ||
            busy !== null ||
            instantBlocked ||
            !instantConfigured ||
            instantBank < 40
          }
          onClick={() => void withdraw("instant")}
        >
          {busy === "instant" ? "Starting…" : "Instant withdrawal · 4%"}
        </button>
      </div>

      {!instantConfigured && (
        <p className="form-help">
          Instant withdrawal will unlock after GLOHAUS completes Stripe Instant
          Payout fee configuration. Standard withdrawal remains available.
        </p>
      )}
      {instantBlocked && (
        <p className="form-help">
          Instant withdrawal is currently restricted on this account.
        </p>
      )}
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
