"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerProductFeeRule } from "@/modules/admin/repository";

function pounds(pence: number | null) {
  if (pence === null) return "";
  return (pence / 100).toFixed(2);
}

export function ShopFeeControl({
  initial,
}: {
  initial: OwnerProductFeeRule | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setNotice("");
        try {
          const maxRaw = String(form.get("maximumFee") || "").trim();
          const response = await fetch("/api/v1/admin/shop-fee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              percentage: Number(form.get("percentage")),
              fixedFeePence: Math.round(Number(form.get("fixedFee")) * 100),
              minimumFeePence: Math.round(Number(form.get("minimumFee")) * 100),
              maximumFeePence: maxRaw
                ? Math.round(Number(maxRaw) * 100)
                : null,
              reason: form.get("reason"),
            }),
          });
          if (!response.ok)
            throw new Error(
              "The Shop commission rule was not saved. Check the values and try again.",
            );
          setNotice("Shop commission updated. New Shop checkouts will use this rule.");
          router.refresh();
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "Could not save the Shop commission.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Shop commission</h3>
      <p className="lead">
        This fee is deducted from each professional&apos;s product subtotal.
        Existing paid orders keep the fee that applied when they were purchased.
      </p>
      <div className="pro-product-grid-fields">
        <label>
          Commission %
          <input
            name="percentage"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={
              initial ? (initial.percentageBasisPoints / 100).toFixed(2) : ""
            }
            placeholder="e.g. 10"
            required
          />
        </label>
        <label>
          Fixed fee per professional order (£)
          <input
            name="fixedFee"
            type="number"
            min={0}
            max={1000}
            step="0.01"
            defaultValue={initial ? pounds(initial.fixedFeePence) : "0.00"}
            required
          />
        </label>
        <label>
          Minimum fee (£)
          <input
            name="minimumFee"
            type="number"
            min={0}
            max={1000}
            step="0.01"
            defaultValue={initial ? pounds(initial.minimumFeePence) : "0.00"}
            required
          />
        </label>
        <label>
          Maximum fee (£, optional)
          <input
            name="maximumFee"
            type="number"
            min={0}
            max={1000}
            step="0.01"
            defaultValue={initial ? pounds(initial.maximumFeePence) : ""}
          />
        </label>
      </div>
      <label>
        Reason for change
        <input
          name="reason"
          minLength={5}
          maxLength={500}
          placeholder="Example: Initial Shop marketplace pricing"
          required
        />
      </label>
      <small>
        Stripe processing costs remain a GloHaus platform cost in the current
        separate-charges-and-transfers model. The percentage is not hard-coded.
      </small>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : initial ? "Update Shop commission" : "Activate Shop commission"}
      </button>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  );
}
