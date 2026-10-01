"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/modules/professionals/domain";

type OwnLastMinuteSlot = {
  id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  caption: string;
  service_name: string;
};

export function LastMinuteEditor({
  services,
  slots,
}: {
  services: Service[];
  slots: OwnLastMinuteSlot[];
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [date, setDate] = useState("");
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!serviceId || !date) {
      setAvailable([]);
      return;
    }
    const controller = new AbortController();
    setLoadingSlots(true);
    fetch(
      `/api/v1/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setAvailable(Array.isArray(data.slots) ? data.slots : []);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice("Could not load available times.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });
    return () => controller.abort();
  }, [serviceId, date]);

  const timeLabel = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  return (
    <section className="last-minute-editor">
      <div className="last-minute-heading">
        <p className="pro-kicker">FILL A CANCELLATION OR FREE SLOT</p>
        <h2>Last-minute availability</h2>
        <p>
          Promote a free appointment coming up in the next 7 days. It will appear
          to customers as a last-minute slot and links straight to booking.
        </p>
      </div>

      {!!slots.length && (
        <div className="last-minute-own-list">
          {slots.map((slot) => (
            <article key={slot.id}>
              <div>
                <strong>{slot.service_name}</strong>
                <span>{timeLabel(slot.starts_at)}</span>
                <small>{slot.caption}</small>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/professional/last-minute/${slot.id}`,
                      { method: "DELETE", headers: { "Content-Type": "application/json" } },
                    );
                    if (!response.ok) throw new Error("Could not withdraw this slot.");
                    router.refresh();
                  } catch (error) {
                    setNotice(
                      error instanceof Error ? error.message : "Could not withdraw slot.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Withdraw
              </button>
            </article>
          ))}
        </div>
      )}

      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const startsAt = String(data.get("startsAt") || "");
          const caption = String(data.get("caption") || "").trim();

          if (!startsAt) {
            setNotice("Choose an available time.");
            return;
          }

          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/v1/professional/last-minute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ serviceId, startsAt, caption }),
            });
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              if (payload?.error?.code === "BOOKING_CONFLICT")
                throw new Error("That slot is no longer free. Choose another time.");
              throw new Error("Could not publish this last-minute slot.");
            }
            setNotice("Last-minute slot is now live.");
            form.reset();
            setAvailable([]);
            setDate("");
            router.refresh();
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not publish slot.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Service
          <select
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            required
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        <label>
          Available time
          <select name="startsAt" disabled={!date || loadingSlots} required defaultValue="">
            <option value="">
              {loadingSlots
                ? "Checking availability…"
                : available.length
                  ? "Choose a free time"
                  : "No free times loaded"}
            </option>
            {available.map((slot) => (
              <option key={slot} value={slot}>
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Europe/London",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(slot))}
              </option>
            ))}
          </select>
        </label>
        <label>
          Message
          <input
            name="caption"
            minLength={1}
            maxLength={160}
            defaultValue="Last-minute appointment available"
            required
          />
        </label>
        <button className="button" disabled={busy || !services.length}>
          {busy ? "Publishing…" : "Promote this slot"}
        </button>
      </form>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </section>
  );
}
