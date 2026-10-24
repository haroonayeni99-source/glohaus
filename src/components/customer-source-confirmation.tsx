"use client";
import { useState } from "react";
import { sourceLabels } from "@/modules/admin/acquisition";
export function CustomerSourceConfirmation({
  bookingId,
}: {
  bookingId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/bookings/${bookingId}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: f.get("source"),
          confirmed: f.get("confirmed") === "yes",
        }),
      });
      if (!response.ok)
        throw new Error("Could not save your answer. Please try again.");
      setNotice(
        "Answer recorded. A different answer to an earlier confirmation opens a review; it cannot silently replace the original record.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="editor-form">
      <summary>How did you find this professional? (optional)</summary>
      <p>
        Your answer helps measure new business. It does not change your price,
        your professional’s commission or where you can book in future. You can
        choose unknown or challenge an earlier answer.
      </p>
      <form className="editor-form" onSubmit={submit}>
        <label>
          Which best describes your first contact with this professional?
          <select name="source" defaultValue="unknown">
            {Object.entries(sourceLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" name="confirmed" value="yes" required /> This
          is my own answer, to the best of my knowledge.
        </label>
        <button className="button" disabled={busy}>
          Save source confirmation
        </button>
        {notice && <p role="status">{notice}</p>}
      </form>
    </details>
  );
}

export function ProfessionalSourceChallenge({
  bookingId,
}: {
  bookingId: string;
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/bookings/${bookingId}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispute", reason: form.get("reason") }),
      });
      if (!response.ok) throw Error("Could not request a review.");
      setNotice(
        "Source review requested. Booking prices and fees are unchanged.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="editor-form">
      <summary>Request a customer-source review</summary>
      <p>
        Explain any conflicting source information. An invitation alone does not
        establish customer ownership. An Owner reviews the evidence.
      </p>
      <form onSubmit={submit} className="editor-form">
        <label>
          Evidence and reason
          <textarea name="reason" minLength={10} maxLength={1000} required />
        </label>
        <button disabled={busy} className="button">
          Request review
        </button>
        {notice && <p role="status">{notice}</p>}
      </form>
    </details>
  );
}
