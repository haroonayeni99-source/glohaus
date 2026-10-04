"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Globe2 } from "lucide-react";
import type { OwnerSiteAvailability } from "@/modules/admin/repository";

export function OwnerSiteAccessControl({
  initial,
}: {
  initial: OwnerSiteAvailability;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initial.publicSiteOpen);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function save(nextOpen: boolean) {
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setNotice("Enter a short reason before changing public access.");
      return;
    }

    const action = nextOpen ? "reopen GLOHAUS to the public" : "close GLOHAUS to the public";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/site-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicSiteOpen: nextOpen, reason: cleanReason }),
      });
      if (!response.ok) throw new Error("The public access setting was not saved.");
      setOpen(nextOpen);
      setReason("");
      setNotice(nextOpen ? "GLOHAUS is open to the public." : "Public access is now closed. Owner/Admin access remains available.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the setting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`owner-site-access-control ${open ? "is-open" : "is-closed"}`}>
      <div className="owner-site-access-status">
        <span className="owner-site-access-icon">
          {open ? <Globe2 size={21} aria-hidden /> : <LockKeyhole size={21} aria-hidden />}
        </span>
        <div>
          <p className="eyebrow">PUBLIC WEBSITE ACCESS</p>
          <h3>{open ? "Website open to the public" : "Website closed to the public"}</h3>
          <p>
            {open
              ? "Customers and professionals can access the public GLOHAUS website."
              : "Visitors are sent to the temporary closed-site page. Owner/Admin, authentication and API routes remain reachable."}
          </p>
        </div>
        <span className="owner-site-access-badge">{open ? "OPEN" : "CLOSED"}</span>
      </div>

      <label>
        Reason for change
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={5}
          maxLength={500}
          placeholder={open ? "e.g. Close during maintenance" : "e.g. Reopen after maintenance"}
        />
      </label>

      <div className="owner-site-access-actions">
        {open ? (
          <button className="owner-danger-button" type="button" disabled={busy} onClick={() => void save(false)}>
            <LockKeyhole size={16} aria-hidden /> Close website to public
          </button>
        ) : (
          <button className="button" type="button" disabled={busy} onClick={() => void save(true)}>
            <Globe2 size={16} aria-hidden /> Reopen website
          </button>
        )}
        <small>Every change is recorded in the Owner audit log.</small>
      </div>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </div>
  );
}
