"use client";
import { requireAdminResponse } from "@/lib/admin-response";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerBookingFeeRule } from "@/modules/admin/repository";

export function BookingFeeControl({ initial }: { initial: OwnerBookingFeeRule }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pounds = Number(form.get("amount"));
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/booking-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPence: Math.round(pounds * 100),
          promotionalFeePence: Math.round(Number(form.get("promotionalAmount")) * 100),
          promotionEnabled: form.get("promotionEnabled") === "on",
          reason: form.get("reason"),
        }),
      });
      await requireAdminResponse(response, "Booking fee change was not saved.");
      setNotice("Booking fees updated for new reservations. Existing bookings keep their quoted fee.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save booking fee.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form owner-booking-fee-control" onSubmit={(event) => void save(event)}>
      <div className="owner-fee-current">
        <span>Current customer booking fee</span>
        <strong>£{(initial.fixedFeePence / 100).toFixed(2)}</strong>
      </div>
      <label>
        Standard booking fee (£)
        <input
          name="amount"
          type="number"
          min={0}
          max={25}
          step="0.01"
          defaultValue={(initial.fixedFeePence / 100).toFixed(2)}
          required
        />
        <small>Applies to new bookings only. Maximum owner setting: £25.</small>
      </label>
      <label>
        Eligible referred first-booking fee (£)
        <input name="promotionalAmount" type="number" min={0} max={25} step="0.01"
          defaultValue={((initial.promotionalFeePence ?? Math.min(100, initial.fixedFeePence)) / 100).toFixed(2)} required />
        <small>Must not exceed the standard fee. One eligible first booking across GLOHAUS, with a valid recorded referral.</small>
      </label>
      <label className="policy-check">
        <input name="promotionEnabled" type="checkbox" defaultChecked={initial.promotionEnabled ?? false} />
        Enable the referred first-booking promotion for new reservations
      </label>
      <label>
        Reason for change
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          placeholder="e.g. Increase booking fee to cover payment processing"
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Update booking fee"}
      </button>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  );
}
