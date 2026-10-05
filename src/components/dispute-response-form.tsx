"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DisputeResponseForm({
  disputeId,
  initialStatement = "",
  deadline,
}: {
  disputeId: string;
  initialStatement?: string | null;
  deadline?: string | null;
}) {
  const router = useRouter();
  const [statement, setStatement] = useState(initialStatement || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/professional/disputes/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, statement }),
      });
      const result = await response.json();
      if (!response.ok) {
        const code = result.error?.code;
        throw new Error(
          code === "EVIDENCE_DEADLINE_PASSED"
            ? "The Stripe evidence deadline has passed."
            : code === "DISPUTE_CLOSED"
              ? "This dispute is already closed."
              : "Your dispute response could not be saved.",
        );
      }
      setNotice("Your dispute response has been saved in GLOHAUS.");
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Your dispute response could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form" onSubmit={(event) => void submit(event)}>
      <label>
        Your response
        <textarea
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          minLength={20}
          maxLength={4000}
          required
          rows={5}
          placeholder="Explain what happened, whether the appointment took place, and what evidence you can provide. Do not include unnecessary sensitive information."
        />
      </label>
      {deadline && (
        <small>
          Submit before{" "}
          {new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/London",
          }).format(new Date(deadline))}
        </small>
      )}
      <button className="button" disabled={busy || statement.trim().length < 20}>
        {busy
          ? "Saving…"
          : initialStatement
            ? "Update dispute response"
            : "Save dispute response"}
      </button>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  );
}
