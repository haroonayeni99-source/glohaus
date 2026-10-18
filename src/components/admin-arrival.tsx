"use client";
import { useState } from "react";
import type { ArrivalConfig } from "@/modules/arrival/domain";
import "./appointment-arrival.css";
export type ArrivalOverview = {
  config: ArrivalConfig;
  counts: Record<string, number>;
  policy: {
    acknowledgedAt: string | null;
    source: string;
    versionToken: string;
    rules: Record<string, unknown>;
  } | null;
  events: {
    id: string;
    booking_id: string;
    kind: string;
    created_at: string;
    details: Record<string, unknown>;
  }[];
  communications: {
    id: string;
    booking_id: string;
    recipient_role: "customer" | "professional";
    recipient_name: string;
    title: string;
    body: string;
    created_at: string;
    read_at: string | null;
    sent_at: string | null;
    delivered_at: string | null;
    delivery_status: string | null;
    attempts: number | null;
    last_error: string | null;
    push: { status: string; sentAt: string | null; error: string | null }[];
  }[];
};
export function AdminArrival({
  initial,
  owner,
}: {
  initial: ArrivalOverview;
  owner: boolean;
}) {
  const [data, setData] = useState(initial),
    [config, setConfig] = useState(initial.config),
    [booking, setBooking] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(body?: unknown, selectedBooking = booking) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        body
          ? "/api/v1/admin/arrival"
          : `/api/v1/admin/arrival${selectedBooking ? `?bookingId=${encodeURIComponent(selectedBooking)}` : ""}`,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          value.error?.message ||
            "Could not update arrival management. Check the booking reference and try again.",
        );
      if (value.config) {
        setData(value);
        setConfig(value.config);
      }
      setNotice(
        body
          ? "Saved and recorded in the audit log."
          : "Communication records refreshed.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load records.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="appointment-arrival">
      <p>
        Professional arrival tools and customer journey planning have separate
        switches. No private live customer location or starting address is shown
        here.
      </p>
      <p>
        Departure scheduler:{" "}
        {data.config.schedulerReady
          ? "Recent server check-in recorded"
          : "No recent server check-in — reminders cannot be enabled"}
      </p>
      {owner && (
        <details>
          <summary>Feature controls</summary>
          <form
            data-admin-decision
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void request({
                action: "settings",
                config,
                reason: String(form.get("reason")),
              });
            }}
          >
            {(
              [
                ["smartArrival", "Professional arrival tools"],
                ["journeyPlanner", "Customer journey planner"],
                ["journeySharing", "Optional live journey sharing"],
                ["departureReminders", "Customer departure reminders"],
              ] as const
            ).map(([key, label]) => (
              <label className="arrival-choice" key={key}>
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <label>
              Arrival radius (50–200 metres)
              <input
                type="number"
                min={50}
                max={200}
                value={config.radiusM}
                onChange={(e) =>
                  setConfig({ ...config, radiusM: Number(e.target.value) })
                }
                required
              />
            </label>
            <label>
              Default arrival buffer (minutes)
              <input
                type="number"
                min={0}
                max={120}
                value={config.defaultBuffer}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    defaultBuffer: Number(e.target.value),
                  })
                }
                required
              />
            </label>
            <label>
              Reason for change
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <p>
              Enable departure reminders only after the one-minute server
              schedule is configured and verified. Review the privacy assessment
              before enabling location features.
            </p>
            <button className="button" disabled={busy}>
              Save feature controls
            </button>
          </form>
        </details>
      )}
      <p>
        {Object.entries(data.counts)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" · ")}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void request();
        }}
      >
        <label>
          Booking reference (optional)
          <input
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
            placeholder="Full booking ID"
          />
        </label>
        <button disabled={busy}>Check communication records</button>
      </form>
      <p>
        Queued means saved for delivery. Sent means accepted by the email
        provider. Delivered is recorded only from a verified provider receipt.
        “Marked read” is an inbox action; it does not prove understanding.
        Explicit acknowledgement is recorded separately.
      </p>
      {data.policy && (
        <details>
          <summary>Accepted booking policies</summary>
          <p>
            {data.policy.source === "affirmative"
              ? `Acknowledged: ${data.policy.acknowledgedAt}`
              : "No affirmative acknowledgement recorded for this legacy booking."}
          </p>
          <p>Version: {data.policy.versionToken}</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(data.policy.rules, null, 2)}
          </pre>
        </details>
      )}
      {data.events.map((event) => (
        <details key={event.id}>
          <summary>
            {event.kind.replaceAll("_", " ")} ·{" "}
            {new Date(event.created_at).toLocaleString("en-GB", {
              timeZone: "Europe/London",
            })}
          </summary>
          <button
            type="button"
            onClick={() => {
              setBooking(event.booking_id);
              void request(undefined, event.booking_id);
            }}
          >
            Review booking {event.booking_id}
          </button>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(event.details, null, 2)}
          </pre>
        </details>
      ))}
      {data.communications.map((item) => (
        <article className="editor-form" key={item.id}>
          <strong>{item.title}</strong>
          <p>
            To:{" "}
            {item.recipient_role === "customer" ? "Customer" : "Professional"} ·{" "}
            {item.recipient_name}
          </p>
          <p>{item.body}</p>
          <p>Booking: {item.booking_id}</p>
          <p>
            Email:{" "}
            {item.delivery_status ??
              (item.attempts ? "Retry pending" : "Queued")}{" "}
            · Attempts: {item.attempts ?? 0}
            {item.last_error ? ` · ${item.last_error}` : ""}
          </p>
          {item.sent_at && <p>Provider accepted: {item.sent_at}</p>}
          {item.delivered_at && <p>Delivery receipt: {item.delivered_at}</p>}
          <p>
            Inbox:{" "}
            {item.read_at
              ? `Marked read ${item.read_at}`
              : "No read action recorded"}
          </p>
          <p>
            Push:{" "}
            {item.push.length
              ? item.push
                  .map((p) =>
                    p.status === "accepted"
                      ? "Accepted by push service (device display unconfirmed)"
                      : p.status,
                  )
                  .join(", ")
              : "No delivery queued for a registered device"}
          </p>
          {item.delivery_status &&
            ["failed", "bounced", "suppressed"].includes(
              item.delivery_status,
            ) && (
              <form
                data-admin-decision
                onSubmit={(e) => {
                  e.preventDefault();
                  void request({
                    action: "resend",
                    notificationId: item.id,
                    reason: String(new FormData(e.currentTarget).get("reason")),
                  });
                }}
              >
                <label>
                  Reason to resend
                  <input
                    name="reason"
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </label>
                <button disabled={busy}>Resend failed arrival notice</button>
              </form>
            )}
        </article>
      ))}
      {booking && (
        <form
          data-admin-decision
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void request({
              action: "correction",
              bookingId: booking,
              reason: String(form.get("reason")),
            });
          }}
        >
          <h3>Record a reviewed correction</h3>
          <label>
            Review outcome
            <textarea name="reason" minLength={10} maxLength={1000} required />
          </label>
          <p>
            This appends a correction to the timeline and preserves original
            evidence. It does not adjust payments.
          </p>
          <button disabled={busy}>Record review outcome</button>
        </form>
      )}
      {!data.events.length && !data.communications.length && (
        <p>No arrival communication records match this view.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
