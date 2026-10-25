"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupportCase } from "@/modules/support/cases";
const subscribeHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
const readToken = () =>
  new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
export function SupportTicket({ id }: { id: string }) {
  const token = useSyncExternalStore(subscribeHash, readToken, () => "");
  const [ticket, setTicket] = useState<SupportCase | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    let active = true;
    fetch(`/api/v1/support/${id}`, {
      headers: { "x-support-token": token },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const data = await response.json();
        if (active) setTicket(data);
      })
      .catch(() => {
        if (active)
          setNotice(
            "Could not load this ticket. Check your private link and refresh to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, token]);
  async function refresh() {
    const response = await fetch(`/api/v1/support/${id}`, {
      headers: { "x-support-token": token },
      cache: "no-store",
    });
    if (!response.ok) throw Error("Could not refresh your case.");
    setTicket(await response.json());
  }
  async function reply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/support/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-support-token": token,
        },
        body: JSON.stringify({
          body: f.get("body"),
          appeal: f.get("appeal") === "yes",
        }),
      });
      if (!response.ok)
        throw Error("Could not save your reply. Please try again.");
      await refresh();
      setNotice(
        "Your message was recorded. Support has been notified through the delivery queue.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || file.size > 3 * 1024 * 1024) {
      setNotice("Choose a JPEG, PNG or WebP screenshot under 3 MB.");
      return;
    }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = "";
      for (const byte of bytes) raw += String.fromCharCode(byte);
      const response = await fetch(`/api/v1/support/${id}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-support-token": token,
        },
        body: JSON.stringify({ base64: btoa(raw), altText: f.get("caption") }),
      });
      if (!response.ok)
        throw Error(
          "Could not save the screenshot. Check its type and the five-file limit.",
        );
      await refresh();
      setNotice("Private screenshot saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload.");
    } finally {
      setBusy(false);
    }
  }
  async function openEvidence(fileId: string) {
    try {
      const response = await fetch(`/api/v1/support/${id}/evidence/${fileId}`, {
        headers: { "x-support-token": token },
      });
      if (!response.ok) throw Error();
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "support-evidence.webp";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("Could not download this evidence.");
    }
  }
  return (
    <div className="editor-form">
      {!token && (
        <p>
          Open the private ticket link saved when you submitted your request. If
          you lost it, contact glohausuk@gmail.com with your ticket ID.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {ticket && (
        <>
          <p>
            Ticket {ticket.id} ·{" "}
            <strong>{ticket.status.replaceAll("_", " ")}</strong>
          </p>
          <p>
            Initial response target:{" "}
            {new Date(ticket.response_due_at).toLocaleString("en-GB", {
              timeZone: "Europe/London",
            })}
            . We aim for two weekdays (Monday–Friday), subject to public-holiday
            delays; delays are possible.
          </p>
          <h2>{ticket.topic}</h2>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {ticket.message}
          </p>
          <h2>Case history</h2>
          {ticket.events.map((e) => (
            <article key={e.id}>
              <p>
                <strong>
                  {e.fromStaff ? "GLOHAUS support" : "Your message"}
                </strong>{" "}
                · {e.status.replaceAll("_", " ")} ·{" "}
                {new Date(e.created_at).toLocaleString("en-GB", {
                  timeZone: "Europe/London",
                })}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {e.body}
              </p>
            </article>
          ))}
          <form onSubmit={reply} className="editor-form">
            <label>
              Reply or provide more information
              <textarea name="body" minLength={10} maxLength={4000} required />
            </label>
            {ticket.status === "resolved" && (
              <label>
                <input name="appeal" type="checkbox" value="yes" /> Request an
                Owner review of this decision (appeal)
              </label>
            )}
            <button disabled={busy} className="button">
              Send message
            </button>
          </form>
          <h2>Private evidence</h2>
          <p>
            Up to five JPEG, PNG or WebP screenshots, 3 MB each. Remove
            passwords, card details, identity documents and unnecessary personal
            details before uploading.
          </p>
          {ticket.evidence.map((file) => (
            <p key={file.id}>
              <button onClick={() => openEvidence(file.id)}>
                {file.caption}
              </button>
            </p>
          ))}
          {ticket.evidence.length < 5 && (
            <form onSubmit={upload} className="editor-form">
              <label>
                Screenshot
                <input
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>
              <label>
                Description
                <input name="caption" minLength={3} maxLength={200} required />
              </label>
              <button disabled={busy} className="button">
                Upload private screenshot
              </button>
            </form>
          )}
          <p>
            Gmail replies do not automatically appear here. For progress,
            refresh this ticket or contact glohausuk@gmail.com with your ticket
            ID.
          </p>
        </>
      )}
    </div>
  );
}
