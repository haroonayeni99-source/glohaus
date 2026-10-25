"use client";
import { useState } from "react";
import type { SupportCase } from "@/modules/support/cases";
import type { SupportRequest } from "@/modules/support/domain";

export function AdminSupportInbox({
  initial,
}: {
  initial: SupportRequest[] | null;
}) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<SupportCase | null>(null);
  const [notice, setNotice] = useState("");
  async function openCase(id: string) {
    setBusy(id);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/support/${id}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw Error("Could not load the case. Check staff sign-in and MFA.");
      setSelected(await response.json());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load.");
    } finally {
      setBusy("");
    }
  }
  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const f = new FormData(event.currentTarget);
    const status = String(f.get("status"));
    setBusy(selected.id);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/admin/support/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note: f.get("note"),
          public: f.get("public") === "yes",
        }),
      });
      if (!response.ok)
        throw Error(
          "Could not save. Resolving an escalated case or appeal requires the Owner.",
        );
      setRequests(
        (current) =>
          current?.map((item) =>
            item.id === selected.id
              ? { ...item, status: status as SupportRequest["status"] }
              : item,
          ) ?? null,
      );
      await openCase(selected.id);
      setNotice(
        "Case history updated. Public replies are visible on the private ticket; Gmail is not synchronised.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
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
        Private support cases. Reply on the ticket to maintain the case history.
        Alerts are queued to glohausuk@gmail.com; inbound Gmail replies are not
        synchronised. Initial response target: two weekdays (Monday–Friday),
        subject to public-holiday delays. The latest 100 cases are shown,
        unresolved cases first.
      </p>
      <p>
        Future public address: support@glohaus.shop. Keep using
        glohausuk@gmail.com until mailbox or forwarding setup is verified.
      </p>
      {notice && <p role="status">{notice}</p>}
      {selected && (
        <section
          className="admin-detail-card"
          style={{ padding: 18, overflowWrap: "anywhere" }}
        >
          <h3>Case {selected.id}</h3>
          <p>Status: {selected.status.replaceAll("_", " ")}</p>
          {selected.events.map((e) => (
            <article key={e.id}>
              <p>
                {e.fromStaff ? "Staff" : "Customer"} ·{" "}
                {e.public ? "Visible on private ticket" : "Internal note"} ·{" "}
                {new Date(e.created_at).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                })}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{e.body}</p>
            </article>
          ))}
          {selected.evidence.map((file) => (
            <p key={file.id}>
              <a
                href={`/api/v1/support/${selected.id}/evidence/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Evidence: {file.caption}
              </a>
            </p>
          ))}
          <form onSubmit={update} className="editor-form">
            <label>
              Status
              <select name="status" defaultValue={selected.status}>
                {[
                  "open",
                  "under_review",
                  "awaiting_customer",
                  "escalated",
                  "resolved",
                  "appealed",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason / reply
              <textarea name="note" minLength={5} maxLength={4000} required />
            </label>
            <label>
              <input type="checkbox" name="public" value="yes" /> Show this
              reply to the customer on their private ticket
            </label>
            <button disabled={Boolean(busy)} className="button">
              Save response and status
            </button>
          </form>
          <button onClick={() => setSelected(null)}>Close case details</button>
        </section>
      )}
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
              <p>{item.status.replaceAll("_", " ")}</p>
              {item.response_due_at && (
                <p>
                  First response target:{" "}
                  {new Date(item.response_due_at).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}
                  {item.first_response_at ? " · Responded" : ""}
                </p>
              )}
              <button
                type="button"
                disabled={busy === item.id}
                onClick={() => openCase(item.id)}
              >
                {busy === item.id ? "Saving…" : "Open case / reply"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!requests.length && <p>No support requests yet.</p>}
    </>
  );
}
