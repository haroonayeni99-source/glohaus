"use client";
import { useEffect, useRef, useState } from "react";
import { SupportMailPanel } from "@/components/support-mail-panel";
import { SupportOperationsPanel } from "@/components/support-operations";
import type { SupportCase } from "@/modules/support/cases";
import type { SupportRequest } from "@/modules/support/domain";

export function AdminSupportInbox({
  initial,
  owner = false,
}: {
  initial: SupportRequest[] | null;
  owner?: boolean;
}) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SupportCase | null>(null);
  const [notice, setNotice] = useState("");
  const [refreshNeeded, setRefreshNeeded] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const loading = useRef<{ sequence: number; controller?: AbortController }>({
    sequence: 0,
  });
  const selectedId = useRef<string | null>(null);
  const dirty = useRef(false);
  const savingNow = useRef(false);
  useEffect(
    () => () => {
      loading.current.sequence++;
      loading.current.controller?.abort();
    },
    [],
  );
  async function loadCase(id: string): Promise<boolean> {
    const sequence = ++loading.current.sequence;
    loading.current.controller?.abort();
    const controller = new AbortController();
    loading.current.controller = controller;
    setBusy(id);
    try {
      const response = await fetch(`/api/v1/support/${id}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error("Could not load the case. Check staff sign-in and MFA.");
      const data = await response.json();
      if (sequence !== loading.current.sequence || controller.signal.aborted)
        return false;
      selectedId.current = id;
      setSelected(data);
      setRefreshNeeded(null);
      return true;
    } catch (error) {
      if (sequence === loading.current.sequence && !controller.signal.aborted)
        setNotice(error instanceof Error ? error.message : "Could not load.");
      return false;
    } finally {
      if (sequence === loading.current.sequence) setBusy("");
    }
  }
  async function openCase(id: string) {
    if (savingNow.current) return;
    if (
      dirty.current &&
      selectedId.current !== id &&
      !window.confirm("Discard the unsaved reply and open another case?")
    )
      return;
    setNotice("");
    const previous = selectedId.current;
    if (await loadCase(id)) {
      if (previous !== id) {
        dirty.current = false;
        setFormVersion((v) => v + 1);
      }
    }
  }
  async function refreshCase() {
    if (!selectedId.current || savingNow.current) return;
    setNotice("");
    if (await loadCase(selectedId.current))
      setNotice(
        "Case history refreshed. Review the latest replies before sending another response.",
      );
  }
  function closeCase() {
    if (
      savingNow.current ||
      (dirty.current &&
        !window.confirm("Discard the unsaved reply and close case details?"))
    )
      return;
    loading.current.sequence++;
    loading.current.controller?.abort();
    selectedId.current = null;
    dirty.current = false;
    setSelected(null);
    setBusy("");
    setRefreshNeeded(null);
    setNotice("");
  }
  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || savingNow.current || busy || refreshNeeded) return;
    const id = selected.id;
    const f = new FormData(event.currentTarget);
    const status = String(f.get("status"));
    savingNow.current = true;
    setSaving(true);
    setNotice("");
    let confirmed = false;
    try {
      const response = await fetch(`/api/v1/admin/support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note: f.get("note"),
          public: f.get("public") === "yes",
        }),
      });
      if (!response.ok) {
        if (response.status >= 500) throw Error("SAVE_UNCONFIRMED");
        setNotice(
          "Not saved. Check your reply, staff sign-in and MFA. Privacy cases also require the recorded identity review and a customer-visible outcome.",
        );
        return;
      }
      confirmed = true;
      dirty.current = false;
      setRequests(
        (current) =>
          current?.map((item) =>
            item.id === id
              ? { ...item, status: status as SupportRequest["status"] }
              : item,
          ) ?? null,
      );
      setSelected((current) =>
        current?.id === id ? { ...current, status } : current,
      );
      setFormVersion((v) => v + 1);
      const refreshed = await loadCase(id);
      setRefreshNeeded(refreshed ? null : id);
      setNotice(
        refreshed
          ? "Response and status saved. Case history updated. Public replies are visible on the private ticket; Gmail is not synchronised."
          : "Response and status saved, but case history could not be refreshed. Refresh case history before sending another response.",
      );
    } catch {
      setRefreshNeeded(id);
      setNotice(
        confirmed
          ? "Response and status saved, but case history could not be refreshed."
          : "Save could not be confirmed. Refresh case history and check for your reply before sending it again.",
      );
    } finally {
      savingNow.current = false;
      setSaving(false);
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
        Support address: support@glohaus.shop. The Owner email status below
        shows forwarding readiness and delivery to glohausuk@gmail.com.
      </p>
      {notice && <p role="status">{notice}</p>}
      {refreshNeeded && (
        <button
          type="button"
          disabled={saving || Boolean(busy)}
          onClick={() => void refreshCase()}
        >
          Refresh case history
        </button>
      )}
      {owner && <SupportMailPanel />}
      {owner && (
        <SupportOperationsPanel onOpenCase={(id) => void openCase(id)} />
      )}
      {selected && (
        <section
          className="admin-detail-card"
          style={{ padding: 18, overflowWrap: "anywhere" }}
        >
          <h3>Case {selected.id}</h3>
          <p>Status: {selected.status.replaceAll("_", " ")}</p>
          {owner && (
            <>
              <SupportOperationsPanel key={selected.id} caseId={selected.id} />
              <SupportMailPanel
                key={`mail-${selected.id}`}
                caseId={selected.id}
              />
            </>
          )}
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
          <form
            key={`${selected.id}-${formVersion}`}
            onSubmit={update}
            onChange={() => {
              dirty.current = true;
            }}
            className="editor-form"
          >
            <fieldset
              disabled={saving || Boolean(busy) || Boolean(refreshNeeded)}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
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
              <button
                disabled={saving || Boolean(busy) || Boolean(refreshNeeded)}
                className="button"
              >
                Save response and status
              </button>
            </fieldset>
          </form>
          <button disabled={saving} onClick={closeCase}>
            Close case details
          </button>
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
                disabled={saving || busy === item.id}
                onClick={() => openCase(item.id)}
              >
                {busy === item.id ? "Loading…" : "Open case / reply"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!requests.length && <p>No support requests yet.</p>}
    </>
  );
}
