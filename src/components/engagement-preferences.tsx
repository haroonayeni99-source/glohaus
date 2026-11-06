"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  clearAnalyticsIdentity,
  startEngagement,
} from "@/modules/website-analytics/browser";
import "./engagement.css";
const rejectionKey = "glohaus-analytics-rejected";
function locallyRejected() {
  try {
    return localStorage.getItem(rejectionKey) === "true";
  } catch {
    return true;
  }
}
type Preferences = { enabled: boolean; choice: "accepted" | "rejected" | null };
export function EngagementPreferences() {
  const path = usePathname(),
    [preferences, setPreferences] = useState<Preferences | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    function refresh() {
      void fetch("/api/v1/engagement/preferences", { cache: "no-store" })
        .then((r) => r.json())
        .then((p: Preferences) => {
          if (!disposed) {
            if (locallyRejected()) p = { ...p, choice: "rejected" };
            setPreferences(p);
            if (p.choice !== "accepted") clearAnalyticsIdentity();
          }
        })
        .catch(() => {});
    }
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key === rejectionKey) {
        if (locallyRejected()) {
          clearAnalyticsIdentity();
          setPreferences((p) => (p ? { ...p, choice: "rejected" } : p));
        } else refresh();
      }
    };
    window.addEventListener("storage", changed);
    const show = () => setOpen(true);
    window.addEventListener("glohaus:analytics-preferences", show);
    return () => {
      disposed = true;
      window.removeEventListener("storage", changed);
      window.removeEventListener("glohaus:analytics-preferences", show);
    };
  }, []);
  useEffect(() => {
    if (preferences?.enabled && preferences.choice === "accepted")
      return startEngagement(path);
  }, [path, preferences]);
  async function choose(choice: "accepted" | "rejected") {
    setBusy(true);
    setError("");
    // Immediately stop collection before withdrawing server-side permission.
    if (choice === "rejected") {
      setPreferences((p) => (p ? { ...p, choice } : p));
      clearAnalyticsIdentity();
      try {
        localStorage.setItem(rejectionKey, "true");
      } catch {}
    }
    try {
      const r = await fetch("/api/v1/engagement/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      if (!r.ok) throw new Error();
      if (choice === "accepted") {
        try {
          localStorage.removeItem(rejectionKey);
        } catch {
          throw new Error();
        }
      }
      setPreferences((p) => (p ? { ...p, choice } : p));
      setOpen(false);
    } catch {
      clearAnalyticsIdentity();
      try {
        localStorage.setItem(rejectionKey, "true");
      } catch {}
      setError(
        "Your choice could not be saved. Analytics remain paused; please try again.",
      );
      setPreferences((p) => (p ? { ...p, choice: "rejected" } : p));
    } finally {
      setBusy(false);
    }
  }
  if (
    path.startsWith("/admin") ||
    path.startsWith("/professional") ||
    (!open && (!preferences?.enabled || preferences.choice))
  )
    return null;
  return (
    <aside
      className="engagement-preferences"
      aria-labelledby="analytics-preference-title"
    >
      <h2 id="analytics-preference-title">Your analytics choice</h2>
      {preferences?.enabled ? (
        <>
          <p>
            May GLOHAUS measure the pages you use, active reading and video
            watch time, clicks and completed purchases to improve the website?
            This is optional. We do not collect what you type, private messages
            or payment details, and we do not share this activity with
            advertisers.
          </p>
          <p>
            Browser identifiers last up to 30 days; activity is retained for up
            to 90 days. You can change your choice below or through the footer
            at any time. <Link href="/privacy">Privacy details</Link>
          </p>
          <div className="engagement-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => choose("rejected")}
            >
              Reject analytics
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => choose("accepted")}
            >
              Allow analytics
            </button>
          </div>
        </>
      ) : (
        <p>
          Optional website engagement tracking is currently disabled. No
          optional analytics activity is being collected by this feature.
        </p>
      )}
      {open && (
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(false)}
        >
          Close preferences
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
