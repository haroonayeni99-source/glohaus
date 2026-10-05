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
  withdrawalsBlocked,
  instantBlocked,
  instantConfigured,
}: {
  availablePence: number;
  withdrawalsBlocked: boolean;
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
          code === "PAYOUT_RESTRICTED"
            ? "Withdrawals are temporarily frozen while a dispute or account review is open."
            : code === "OUTSTANDING_OBLIGATION"
              ? "You have an outstanding GLOHAUS balance that must be cleared before withdrawing."
              : code === "INSUFFICIENT_AVAILABLE_BALANCE"
                ? "That amount is no longer available to withdraw."
                : code === "PAYOUT_TOO_SMALL"
                  ? "The withdrawal amount is too small after applicable fees."
                  : code === "UNAVAILABLE"
                    ? "GLOHAUS payout processing is not fully connected right now. Your wallet balance is unchanged."
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
          disabled={!valid || busy !== null || withdrawalsBlocked}
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
            withdrawalsBlocked ||
            instantBlocked ||
            !instantConfigured ||
            instantBank < 40
          }
          onClick={() => void withdraw("instant")}
        >
          {busy === "instant" ? "Starting…" : "Instant withdrawal · 4%"}
        </button>
      </div>

      {withdrawalsBlocked && (
        <p className="form-help">
          All withdrawals are frozen while an open dispute or financial review is active.
        </p>
      )}
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
