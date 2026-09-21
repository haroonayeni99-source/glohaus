"use client";
import { useEffect, useState } from "react";
import { money, type Service } from "@/modules/professionals/domain";
import { AuthGate } from "./auth-gate";
export function BookingPicker({
  services,
  ready,
  returnPath,
  initialSelection,
}: {
  services: Service[];
  ready: boolean;
  returnPath: string;
  initialSelection?: { serviceId?: string; date?: string; startsAt?: string };
}) {
  const validInitialService = services.some(
    (service) => service.id === initialSelection?.serviceId,
  )
    ? initialSelection?.serviceId
    : undefined;
  const [serviceId, setServiceId] = useState(
    validInitialService || services[0]?.id || "",
  );
  const [date, setDate] = useState(
    /^\d{4}-\d{2}-\d{2}$/.test(initialSelection?.date || "")
      ? initialSelection!.date!
      : "",
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const service = services.find((s) => s.id === serviceId);
  async function loadSlots(preferredStart?: string) {
    setBusy(true);
    setNotice("");
    setSelected("");
    setSlots([]);
    try {
      const response = await fetch(
        `/api/v1/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error("Availability could not be loaded.");
      setSlots(data.slots);
      if (preferredStart && data.slots.includes(preferredStart))
        setSelected(preferredStart);
      if (!data.slots.length)
        setNotice("No appointments on this date. Try another day.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load times.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !date ||
      !initialSelection?.startsAt ||
      initialSelection.serviceId !== serviceId ||
      initialSelection.date !== date
    )
      return;
    const controller = new AbortController();
    async function restoreAvailability() {
      try {
        const response = await fetch(
          `/api/v1/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok || controller.signal.aborted) return;
        setSlots(data.slots);
        if (data.slots.includes(initialSelection!.startsAt!))
          setSelected(initialSelection!.startsAt!);
      } catch {
        // The standard availability control keeps a visible retry path.
      }
    }
    void restoreAvailability();
    return () => controller.abort();
  }, [date, initialSelection, serviceId]);
  return (
    <section className="booking-widget">
      <p className="eyebrow">YOUR NEXT BEAUTY MOMENT</p>
      <h2>Make time for you.</h2>
      <label>
        Choose a service
        <select
          value={serviceId}
          onChange={(event) => {
            setServiceId(event.target.value);
            setSlots([]);
            setSelected("");
          }}
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {money(service.price_pence)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setSlots([]);
            setSelected("");
          }}
        />
      </label>
      <button
        className="button small"
        type="button"
        disabled={!date || busy}
        onClick={() => void loadSlots()}
      >
        See available times
      </button>
      <div className="booking-times">
        {slots.map((slot) => (
          <button
            key={slot}
            className={selected === slot ? "selected" : ""}
            aria-pressed={selected === slot}
            onClick={() => setSelected(slot)}
          >
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/London",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            }).format(new Date(slot))}
          </button>
        ))}
      </div>
      {service && (
        <div className="booking-price">
          <span>
            Deposit today<strong>{money(service.deposit_pence)}</strong>
          </span>
          <span>
            Remaining at appointment
            <strong>
              {money(service.price_pence - service.deposit_pence)}
            </strong>
          </span>
        </div>
      )}
      <details className="booking-policy">
        <summary>Cancellation & deposit policy</summary>
        <p>
          Cancel at least 24 hours before your appointment for a full deposit
          refund. Within 24 hours, reasonable circumstances are reviewed
          individually by the professional, who decides any partial or full
          refund. Without an accepted reason, no discretionary refund is
          offered. Your statutory rights still apply. Professional cancellations
          receive a full deposit refund.
        </p>
      </details>
      <label className="policy-check">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        I have read and accept the deposit and cancellation policy.
      </label>
      <button
        className="button full-width"
        disabled={
          (!ready && service?.deposit_pence !== 0) ||
          !selected ||
          !accepted ||
          busy
        }
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch("/api/v1/bookings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                serviceId,
                startsAt: selected,
                acceptPolicy: true,
              }),
            });
            const result = await response.json();
            if (!response.ok) {
              if (
                response.status === 401 ||
                result.error?.code === "ONBOARDING_REQUIRED"
              ) {
                setNeedsAccount(true);
                setBusy(false);
                return;
              }
              throw new Error(
                result.error?.code === "SLOT_TAKEN"
                  ? "That time has just been taken. Please choose another."
                  : "Booking is unavailable right now. Please try again.",
              );
            }
            window.location.href = result.url;
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not book.",
            );
            setBusy(false);
          }
        }}
      >
        {service?.deposit_pence
          ? "Continue to secure deposit"
          : "Confirm appointment"}
      </button>
      {!ready && service?.deposit_pence !== 0 && (
        <p className="booking-help">
          Online booking opens once secure payments are connected.
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      <p className="booking-help">
        Times shown in London time.{" "}
        {service?.deposit_pence === 0
          ? "No deposit is required. Pay the service price at your appointment."
          : "Card details are handled by Stripe."}
      </p>
      {needsAccount && (
        <AuthGate
          returnTo={`${returnPath}?${new URLSearchParams({ bookService: serviceId, bookDate: date, bookTime: selected })}`}
          onClose={() => setNeedsAccount(false)}
        />
      )}
    </section>
  );
}
