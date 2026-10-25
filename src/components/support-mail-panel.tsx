"use client";
import { useState } from "react";
type MailOverview = {
  enabled: boolean;
  configured: boolean;
  counts: Record<string, number>;
  items: {
    id: string;
    provider_email_id: string;
    kind: string;
    state: string;
    reason: string | null;
    request_id: string | null;
    attempts: number;
    delivery_state: string | null;
    created_at: string;
  }[];
};
const reasons: Record<string, string> = {
  sender_rate_review: "Sender volume needs manual review in Resend",
  sender_authentication_review: "Sender authentication needs review in Resend",
  original_too_large:
    "Original email exceeds forwarding limit; retrieve it privately from Resend",
  unsafe_original_location: "Original location needs review",
  original_unavailable: "Original message needs review in Resend",
  forwarding_loop: "Loop or automatic reply stopped",
  duplicate_message: "Duplicate stopped",
  provider_retry_required: "Provider temporarily unavailable; queued for retry",
  manual_review_required: "Automatic retries stopped; review in Resend",
  provider_accepted: "Accepted by Resend; delivery is shown separately",
  outgoing_metadata_recorded: "Outgoing email matched to this ticket",
  outgoing_unmatched: "No safe existing-ticket match",
  wrong_recipient: "Not addressed to support",
  invalid_sender: "Sender needs review",
  not_customer_reply: "Not a customer reply",
};
export function SupportMailPanel({ caseId }: { caseId?: string }) {
  const [data, setData] = useState<MailOverview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/v1/admin/support/mail${caseId ? `?caseId=${caseId}` : ""}`,
        { cache: "no-store" },
      );
      if (!r.ok)
        throw Error("Email status unavailable. Check Owner sign-in and MFA.");
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function queueExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const emailId = String(new FormData(event.currentTarget).get("emailId"));
    try {
      const r = await fetch("/api/v1/admin/support/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (!r.ok)
        throw Error(
          "Not queued. Check the receiving email ID, Owner MFA, sender authentication and forwarding readiness in Resend.",
        );
      setError(
        "Forwarding request recorded. Existing messages are not forwarded twice. Refresh email status to check acceptance and delivery.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="admin-detail-card"
      style={{ padding: 18, marginBlock: 18 }}
    >
      <h3>
        {caseId ? "Emails linked to this ticket" : "Support email to Gmail"}
      </h3>
      <p>
        Private Owner view. Customer email contents and original attachments
        remain in Resend and Gmail. Ticket matching requires a reference and
        matching email address; it does not prove identity or publish email
        replies on the website.
      </p>
      <button type="button" disabled={busy} onClick={() => void load()}>
        {busy
          ? "Loading…"
          : data
            ? "Refresh email status"
            : "Open email status"}
      </button>
      {error && <p role="status">{error}</p>}
      {data && (
        <>
          <p>
            {data.enabled && data.configured
              ? "Forwarding enabled"
              : "Forwarding setup incomplete"}
            . Destination: glohausuk@gmail.com. Before replying in Gmail,
            confirm the From address is support@glohaus.shop.
          </p>
          <p>
            Queued:{" "}
            {(data.counts.queued ?? 0) +
              (data.counts.processing ?? 0) +
              (data.counts.retry ?? 0)}{" "}
            · Forwarded: {data.counts.forwarded ?? 0} · Matched outgoing:{" "}
            {data.counts.linked ?? 0} · Needs review:{" "}
            {(data.counts.quarantined ?? 0) + (data.counts.failed ?? 0)}
          </p>
          {data.items.map((item) => (
            <article className="service-edit-row" key={item.id}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <p>
                  <strong>
                    {item.kind === "received" ? "Incoming" : "Outgoing"} ·{" "}
                    {item.state}
                  </strong>{" "}
                  ·{" "}
                  {new Date(item.created_at).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                </p>
                <p>{reasons[item.reason ?? ""] ?? "Review provider status"}</p>
                <p>
                  Delivery:{" "}
                  {item.delivery_state ?? "No confirmed delivery event"} ·
                  Attempts: {item.attempts}
                </p>
                <p>
                  Ticket: {item.request_id ?? "Unmatched"} · Resend email:{" "}
                  {item.provider_email_id}
                </p>
              </div>
            </article>
          ))}
          {!data.items.length && (
            <p>No email transport records in this view yet.</p>
          )}
        </>
      )}
      {!caseId && (
        <details>
          <summary>Forward an existing incoming email</summary>
          <p>
            Use the received email ID from your Resend support inbox. Forwarding
            always goes to glohausuk@gmail.com and keeps the original sender as
            Reply-To. Existing jobs and message fingerprints prevent repeat
            forwarding.
          </p>
          <form className="editor-form" onSubmit={queueExisting}>
            <label>
              Received Resend email ID
              <input
                name="emailId"
                required
                pattern="[a-fA-F0-9-]{36}"
                maxLength={36}
              />
            </label>
            <button disabled={busy || !data?.enabled || !data?.configured}>
              Queue existing email to Gmail
            </button>
          </form>
        </details>
      )}
      <p>
        Sender-authentication failures, missing originals and oversized messages
        are held for review; original messages remain in Resend. No attachment
        is silently dropped. Gmail sending-identity setup and hands-on reply
        tests are separate from forwarding readiness.
      </p>
    </section>
  );
}
