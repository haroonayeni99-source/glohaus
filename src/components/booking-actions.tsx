"use client";
import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
export function BookingActions({
  id,
  status,
  professional,
  ended,
}: {
  id: string;
  status: string;
  professional: boolean;
  ended: boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  async function change(next: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, reason }),
      });
      if (!response.ok)
        throw new Error(
          "This change could not be saved. Refresh and try again.",
        );
      setNotice("Appointment updated.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="booking-message-action">
        <Link href={`/messages?booking=${id}`}>
          <MessageCircle size={16} aria-hidden />
          Message about this booking
        </Link>
      </div>
      {["confirmed", "payment_pending"].includes(status) && (
        <div className="editor-form">
          <h2>Manage appointment</h2>
          {!professional && status === "payment_pending" && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setNotice("");
                try {
                  const response = await fetch(
                    `/api/v1/bookings/${id}/checkout`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    },
                  );
                  if (!response.ok)
                    throw new Error(
                      response.status === 409
                        ? "This checkout cannot be resumed. Refresh to check whether payment completed or the hold expired."
                        : "Checkout is unavailable. Please try again shortly.",
                    );
                  const result = await response.json();
                  window.location.assign(result.url);
                } catch (error) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "Could not open checkout.",
                  );
                  setBusy(false);
                  router.refresh();
                }
              }}
            >
              Continue secure deposit payment
            </button>
          )}
          <label>
            Reason for cancellation
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
            <small>
              Share a brief reason. Please do not include medical details or
              sensitive documents.
            </small>
          </label>
          <button
            className="button small"
            disabled={busy || reason.trim().length < 5}
            onClick={() => change("cancelled")}
          >
            Cancel appointment
          </button>
          {professional && status === "confirmed" && ended && (
            <div className="editor-actions">
              <button disabled={busy} onClick={() => change("completed")}>
                Mark completed
              </button>
              <button disabled={busy} onClick={() => change("no_show")}>
                Mark no-show
              </button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
