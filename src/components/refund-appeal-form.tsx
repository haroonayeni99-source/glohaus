"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefundAppealForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          const response = await fetch("/api/v1/account/refund-appeals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              reason: new FormData(event.currentTarget).get("reason"),
            }),
          });
          if (!response.ok)
            throw new Error("Your appeal could not be sent. Please try again.");
          setNotice("Your appeal has been sent for an admin review.");
          router.refresh();
        } catch (error) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Your appeal could not be sent.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Ask for a review</h2>
      <p className="lead">
        If you believe a no-refund decision needs review, tell the admin team
        briefly. Do not include medical documents or other sensitive evidence
        here.
      </p>
      <label>
        Why should this be reviewed?
        <textarea name="reason" minLength={5} maxLength={500} required />
      </label>
      <button className="button" disabled={busy}>
        Send appeal
      </button>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
