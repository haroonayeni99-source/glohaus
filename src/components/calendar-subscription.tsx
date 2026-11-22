"use client";
import { useRef, useState } from "react";
export function CalendarSubscription() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  async function change(action: "regenerate" | "revoke") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice("");
    // Stop offering a potentially revoked link even if the response is lost.
    setUrl("");
    try {
      const response = await fetch("/api/v1/professional/calendar-subscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      setUrl(data.url || "");
      setNotice(action === "revoke" ? "Subscription revoked. Previously downloaded events may remain on your device; remove the old subscribed calendar." : "Private link created. Any previous link has stopped working. Add the new link to your calendar.");
    } catch { setNotice("The change could not be confirmed. Try again before using a previous subscription link."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section aria-label="Apple Calendar subscription">
    <h3>Subscribe to GLOHAUS bookings</h3>
    <p>See your GLOHAUS appointments in Apple Calendar or another calendar that supports subscriptions. Updates travel one way from GLOHAUS; manage bookings here. Your calendar controls refresh timing.</p>
    <p>The feed includes appointment times only, from the last 90 days through the next year. Keep its private link secret: anyone with it can see those times.</p>
    <button type="button" className="button" disabled={busy} onClick={() => void change("regenerate")}>Create / replace private subscription link</button>{" "}
    <button type="button" className="button secondary" disabled={busy} onClick={() => void change("revoke")}>Revoke subscription access</button>
    {url && <div>
      <p><a className="button" href={url.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer">Subscribe to Calendar</a></p>
      <label>Private calendar URL<input readOnly type="url" value={url} onFocus={event => event.currentTarget.select()} /></label>
      <p>On iPhone: Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar. Paste the URL above.</p>
    </div>}
    <p role="status">{notice}</p>
  </section>;
}
