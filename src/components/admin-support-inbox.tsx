"use client";
import { useState } from "react";
import type { SupportRequest } from "@/modules/support/domain";

export function AdminSupportInbox({
  initial,
}: {
  initial: SupportRequest[] | null;
}) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  async function update(item: SupportRequest) {
    setBusy(item.id);
    setNotice("");
    const status = item.status === "open" ? "resolved" : "open";
    try {
      const response = await fetch(`/api/v1/admin/support/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok)
        throw new Error("The request could not be updated. Try again.");
      setRequests(
        (current) =>
          current?.map((request) =>
            request.id === item.id ? { ...request, status } : request,
          ) ?? null,
      );
      setNotice(
        status === "resolved"
          ? "Request marked resolved."
          : "Request reopened.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The request could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }
  if (requests === null)
    return (
      <p role="status">
        Support requests could not be loaded. Refresh to try again.
      </p>
    );
  return (
    <>
      <p>
        Private requests from Contact Us. Email the customer from your support
        mailbox to follow up, then mark the request resolved. The latest 100
        requests are shown, with open requests first.
      </p>
      {notice && <p role="status">{notice}</p>}
      <div className="service-edit-list">
        {requests.map((item) => (
          <article className="service-edit-row" key={item.id}>
            <div style={{ overflowWrap: "anywhere", minWidth: 0 }}>
              <h3>
                {item.topic} · {item.name}
              </h3>
              <p>
                <a href={`mailto:${encodeURIComponent(item.email)}`}>
                  {item.email}
                </a>{" "}
                ·{" "}
                {new Date(item.created_at).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                })}
              </p>
              <p>
                Reference: {item.id}
                {item.reference ? ` · Booking/order: ${item.reference}` : ""}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {item.message}
              </p>
              <p>{item.status === "open" ? "Open" : "Resolved"}</p>
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => update(item)}
              >
                {busy === item.id
                  ? "Saving…"
                  : item.status === "open"
                    ? "Mark resolved"
                    : "Reopen"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!requests.length && <p>No support requests yet.</p>}
    </>
  );
}
