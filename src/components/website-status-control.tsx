"use client";

import { useState } from "react";
import { Globe2, LockKeyhole } from "lucide-react";

export function WebsiteStatusControl({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function change(nextEnabled: boolean) {
    const action = nextEnabled ? "make GLOHAUS public again" : "take GLOHAUS offline for public visitors";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/site-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          reason: nextEnabled
            ? "Owner restored public website access"
            : "Owner disabled public website access",
        }),
      });
      if (!response.ok) throw new Error("Website status could not be changed.");
      setEnabled(nextEnabled);
      setNotice(nextEnabled ? "GLOHAUS is now public." : "Public visitors now see maintenance mode.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Website status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="website-status-control">
      <div className="website-status-copy">
        <span className={enabled ? "website-status-icon is-public" : "website-status-icon is-private"}>
          {enabled ? <Globe2 size={21} aria-hidden /> : <LockKeyhole size={21} aria-hidden />}
        </span>
        <div>
          <p className="eyebrow">WEBSITE STATUS</p>
          <h2>{enabled ? "PUBLIC — Website is ON" : "PRIVATE — Maintenance mode is ON"}</h2>
          <p>
            {enabled
              ? "Customers and professionals can access the public GLOHAUS website."
              : "Public visitors are blocked from the website. Owner/Admin access remains available."}
          </p>
        </div>
      </div>
      <button
        type="button"
        className={enabled ? "website-status-toggle is-on" : "website-status-toggle is-off"}
        aria-pressed={enabled}
        disabled={busy}
        onClick={() => void change(!enabled)}
      >
        <span aria-hidden />
        {busy ? "Saving..." : enabled ? "Turn website OFF" : "Turn website ON"}
      </button>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </div>
  );
}
