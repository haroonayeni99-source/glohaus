"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RefundForm({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        try {
          const response = await fetch("/api/v1/professional/refunds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              accepted: data.get("accepted") === "yes",
              percentage: Number(data.get("percentage")),
              reason: data.get("reason"),
            }),
          });
          if (!response.ok)
            throw new Error(
              "The decision or refund could not be completed. Retry to resume the same decision safely.",
            );
          setNotice(
            "Decision recorded. Refund status is shown in the payment overview.",
          );
          router.refresh();
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not process decision.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Review the deposit.</h2>
      <p className="lead">
        Professional cancellations and cancellations at least 24 hours ahead
        receive a full refund. For late cancellations, consider the individual
        circumstances and the customer’s statutory rights. Escalate disputed
        decisions for admin review.
      </p>
      <label>
        Reasonable circumstances accepted?
        <select name="accepted">
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Refund percentage for an accepted late cancellation
        <input
          name="percentage"
          type="number"
          min={0}
          max={100}
          step={1}
          required
          defaultValue={100}
        />
      </label>
      <label>
        Decision reason
        <textarea name="reason" minLength={5} maxLength={500} required />
        <small>
          Explain your decision without including medical or sensitive details.
        </small>
      </label>
      <button className="button" disabled={busy}>
        Record decision and issue any refund
      </button>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
