"use client";
import "./seller-tools.css";
import { useState } from "react";
import {
  sellerIsAway,
  sellerSettingsSchema,
  type SellerSettings,
} from "@/modules/shop/seller";
export function SellerAwaySettings({
  initialSettings,
}: {
  initialSettings: SellerSettings;
}) {
  const [saved, setSaved] = useState(initialSettings);
  const [away, setAway] = useState(() => sellerIsAway(initialSettings));
  const [until, setUntil] = useState(() =>
    sellerIsAway(initialSettings)
      ? (initialSettings.awayUntil?.slice(0, 16) ?? "")
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNotice("");
    const date = until ? new Date(`${until}Z`) : null;
    if (away && date && !Number.isFinite(date.getTime())) {
      setNotice("Choose a valid return time.");
      return;
    }
    const parsed = sellerSettingsSchema.safeParse({
      away,
      awayUntil: away && date ? date.toISOString() : null,
    });
    if (!parsed.success) {
      setNotice(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/professional/seller-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          "Your Time Away settings could not be saved. Please try again.",
        );
      setSaved(data.settings);
      setNotice(
        parsed.data.away
          ? "Time Away saved. New product orders are paused until you return."
          : "Your shop is accepting new product orders again.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="seller-panel" aria-labelledby="away-heading">
      <div className="seller-section-title">
        <h2 id="away-heading">Time Away</h2>
        <span className="seller-badge">
          {sellerIsAway(saved) ? "New orders paused" : "Accepting orders"}
        </span>
      </div>
      <p>
        Pause new product orders while you’re away. Listings stay visible with a
        Seller away label. Service bookings keep their existing availability.
      </p>
      <form onSubmit={save} className="seller-settings-form">
        <label className="seller-checkbox">
          <input
            type="checkbox"
            checked={away}
            disabled={busy}
            onChange={(e) => setAway(e.target.checked)}
          />
          Pause new product orders
        </label>
        <label>
          Resume orders at (UTC)
          <input
            type="datetime-local"
            value={until}
            disabled={!away || busy}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <p className="seller-muted">
          Leave the time blank to resume manually. Existing paid orders still
          need fulfilling. Customers with an already-reserved checkout may
          complete it before it expires.
        </p>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Time Away"}
        </button>
        {notice && <p role="status">{notice}</p>}
      </form>
    </section>
  );
}
