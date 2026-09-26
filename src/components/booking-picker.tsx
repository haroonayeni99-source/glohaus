"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CalendarDays, CircleHelp, LockKeyhole } from "lucide-react";
import { money, type Service } from "@/modules/professionals/domain";
import { AuthGate } from "./auth-gate";
import { PaymentSummary } from "./payment-summary";

function londonDateString(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function dateChoices(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  return Array.from({ length: 5 }, (_, offset) => {
    const value = new Date(base + offset * 86400000);
    const iso = value.toISOString().slice(0, 10);
    return {
      iso,
      weekday: new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        timeZone: "UTC",
      }).format(value),
      day: new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        timeZone: "UTC",
      }).format(value),
    };
  });
}

export function BookingPicker({
  services,
  ready,
  returnPath,
  professionalName,
  bookingFeePence,
  initialSelection,
}: {
  services: Service[];
  ready: boolean;
  returnPath: string;
  professionalName: string;
  bookingFeePence: number;
  initialSelection?: { serviceId?: string; date?: string; startsAt?: string };
}) {
  const validInitialService = services.some(
    (service) => service.id === initialSelection?.serviceId,
  )
    ? initialSelection?.serviceId
    : undefined;

  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(initialSelection?.date || "")
    ? initialSelection!.date!
    : "";

  const [serviceId, setServiceId] = useState(
    validInitialService || services[0]?.id || "",
  );
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState(
    initialDate && initialSelection?.startsAt ? initialSelection.startsAt : "",
  );
  const [notice, setNotice] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(Boolean(initialDate));
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [step, setStep] = useState<"appointment" | "summary">("appointment");

  const service = services.find((item) => item.id === serviceId);
  const [today] = useState(() => londonDateString());
  const quickDates = useMemo(() => dateChoices(today), [today]);

  useEffect(() => {
    if (!date || !serviceId) return;

    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          "/api/v1/availability?serviceId=" +
            encodeURIComponent(serviceId) +
            "&date=" +
            encodeURIComponent(date),
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error("Availability could not be loaded.");
        if (controller.signal.aborted) return;
        setSlots(data.slots);
        setSelected((current) =>
          current && data.slots.includes(current) ? current : "",
        );
        if (!data.slots.length)
          setNotice("No appointments on this date. Try another day.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSlots([]);
        setSelected("");
        setNotice(
          error instanceof Error ? error.message : "Could not load times.",
        );
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [date, serviceId]);

  const selectedDateLabel = date
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeZone: "UTC",
      }).format(new Date(date + "T12:00:00Z"))
    : "";

  const selectedTimeLabel = selected
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(selected))
    : "";

  async function submitBooking() {
    if (!service || !selected || !accepted) return;
    setSubmitting(true);
    setNotice("");
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
          setSubmitting(false);
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
      setNotice(error instanceof Error ? error.message : "Could not book.");
      setSubmitting(false);
    }
  }

  if (!service) return null;

  return (
    <section className="booking-widget booking-journey">
      {step === "appointment" ? (
        <>
          <div className="booking-journey-heading">
            <p className="eyebrow">BOOK YOUR APPOINTMENT</p>
            <h2>Choose your service and time.</h2>
          </div>

          <label className="booking-service-select">
            Service
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setSlots([]);
                setSelected("");
                setNotice("");
                setLoadingSlots(Boolean(date));
                setStep("appointment");
              }}
            >
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {money(item.price_pence + bookingFeePence)} total
                </option>
              ))}
            </select>
          </label>

          <div className="booking-service-preview booking-service-reference">
            {service.asset_id ? (
              <Image
                src={"/api/media/" + service.asset_id}
                alt={service.image_alt || service.name}
                width={96}
                height={96}
                unoptimized
              />
            ) : (
              <span aria-hidden>{service.name.slice(0, 1)}</span>
            )}
            <div>
              <strong>{service.name}</strong>
              <small>{professionalName}</small>
              <small>
                {money(service.price_pence + bookingFeePence)} total · {service.duration_minutes} min
              </small>
            </div>
          </div>

          <fieldset className="booking-date-section">
            <legend>Select Date</legend>
            <div className="booking-date-strip">
              {quickDates.map((item) => (
                <button
                  type="button"
                  key={item.iso}
                  className={date === item.iso ? "selected" : ""}
                  aria-pressed={date === item.iso}
                  onClick={() => {
                    setDate(item.iso);
                    setSlots([]);
                    setSelected("");
                    setNotice("");
                    setLoadingSlots(true);
                  }}
                >
                  <span>{item.weekday}</span>
                  <strong>{item.day}</strong>
                </button>
              ))}
            </div>
            <label className="booking-custom-date">
              <CalendarDays size={16} aria-hidden />
              Another date
              <input
                type="date"
                min={today}
                value={date}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setDate(nextDate);
                  setSlots([]);
                  setSelected("");
                  setNotice("");
                  setLoadingSlots(Boolean(nextDate));
                }}
              />
            </label>
          </fieldset>

          <fieldset className="booking-time-section">
            <legend>Select Time</legend>
            {loadingSlots ? (
              <p className="booking-help">Checking availability…</p>
            ) : date && slots.length ? (
              <div className="booking-times">
                {slots.map((slot) => (
                  <button
                    type="button"
                    key={slot}
                    className={selected === slot ? "selected" : ""}
                    aria-pressed={selected === slot}
                    onClick={() => setSelected(slot)}
                  >
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: "Europe/London",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(slot))}
                  </button>
                ))}
              </div>
            ) : !date ? (
              <p className="booking-help">Choose a date to see available times.</p>
            ) : null}
          </fieldset>

          <div className="booking-deposit-callout">
            <CircleHelp size={18} aria-hidden />
            <div>
              <strong>
                {service.deposit_pence
                  ? "Deposit required · " + money(service.deposit_pence)
                  : "No deposit required"}
              </strong>
              <span>
                {service.deposit_pence
                  ? "This secures the appointment. The remaining " +
                    money(service.price_pence - service.deposit_pence) +
                    " is due for the service."
                  : "You can confirm this appointment without an online payment."}
              </span>
              <small>
                Professional-required deposits can never exceed 40% of the
                service price.
              </small>
            </div>
          </div>

          <button
            type="button"
            className="button full-width booking-continue"
            disabled={!selected || loadingSlots}
            onClick={() => {
              setAccepted(false);
              setNotice("");
              setStep("summary");
            }}
          >
            Continue
          </button>
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="booking-back"
            onClick={() => {
              setStep("appointment");
              setNotice("");
            }}
          >
            <ArrowLeft size={17} aria-hidden /> Back to appointment
          </button>
          <div className="booking-journey-heading">
            <p className="eyebrow">PAYMENT SUMMARY</p>
            <h2>Review before you confirm.</h2>
          </div>

          <div className="booking-service-preview booking-service-reference">
            {service.asset_id ? (
              <Image
                src={"/api/media/" + service.asset_id}
                alt={service.image_alt || service.name}
                width={96}
                height={96}
                unoptimized
              />
            ) : (
              <span aria-hidden>{service.name.slice(0, 1)}</span>
            )}
            <div>
              <strong>{service.name}</strong>
              <small>{professionalName}</small>
              <small>
                {selectedDateLabel} · {selectedTimeLabel}
              </small>
            </div>
          </div>

          <PaymentSummary
            servicePricePence={service.price_pence}
            depositPence={service.deposit_pence}
            bookingFeePence={bookingFeePence}
          />

          <details className="booking-policy" open>
            <summary>Cancellation & no-show policy</summary>
            <p>
              Cancel at least 24 hours before your appointment for a full
              deposit refund. Within 24 hours, reasonable circumstances are
              reviewed individually by the professional. Professional
              cancellations receive a full deposit refund. Your statutory
              rights still apply.
            </p>
          </details>

          <label className="policy-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              I agree to the cancellation and no-show policy and confirm the
              appointment details above.
            </span>
          </label>

          <button
            className="button full-width booking-pay-button"
            type="button"
            disabled={
              !ready ||
              !accepted ||
              submitting
            }
            onClick={() => void submitBooking()}
          >
            {submitting
              ? "Confirming…"
              : "Continue to secure " +
                money(service.deposit_pence + bookingFeePence)}
          </button>

          <p className="booking-secure-note">
            <LockKeyhole size={14} aria-hidden />
            Payment details are handled securely by Stripe.
          </p>

          {!ready && (
            <p className="form-notice">
              Secure online payment is not connected yet, so paid-deposit
              bookings remain disabled.
            </p>
          )}

          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}
        </>
      )}

      {needsAccount && (
        <AuthGate
          returnTo={
            returnPath +
            "?" +
            new URLSearchParams({
              bookService: serviceId,
              bookDate: date,
              bookTime: selected,
            }).toString()
          }
          onClose={() => setNeedsAccount(false)}
        />
      )}
    </section>
  );
}
