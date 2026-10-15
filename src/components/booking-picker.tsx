"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CircleHelp, LockKeyhole } from "lucide-react";
import { ViewportVideo } from "./viewport-video";
import { optionSearch } from "@/modules/taxonomy/domain";
import { money, type Service } from "@/modules/professionals/domain";
import { AuthGate } from "./auth-gate";
import { PaymentSummary } from "./payment-summary";
import { ProfessionalPolicySummary } from "./professional-policy-summary";
import type { PolicyPreview } from "@/modules/policies/domain";
import {
  isRequiredDepositWithinLimit,
  depositLimitMessage,
} from "@/modules/bookings/deposit-policy";

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
  verificationStatus = "unverified",
  starterBookingsRemaining = null,
}: {
  services: Service[];
  ready: boolean;
  returnPath: string;
  professionalName: string;
  bookingFeePence: number;
  initialSelection?: { serviceId?: string; date?: string; startsAt?: string };
  verificationStatus?: "unverified" | "pending" | "verified" | "restricted";
  starterBookingsRemaining?: number | null;
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
  const [variationId,setVariationId]=useState<string|null>(null);const [extraIds,setExtraIds]=useState<string[]>([]);
  const optionsQuery=optionSearch(variationId,extraIds);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState(
    initialDate && initialSelection?.startsAt ? initialSelection.startsAt : "",
  );
  const [clientBlocked, setClientBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(Boolean(initialDate));
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [earlyServiceRequested,setEarlyServiceRequested] = useState(false);
  const [earlyServiceBefore,setEarlyServiceBefore] = useState(0);
  const [policy,setPolicy] = useState<PolicyPreview|null>(null);
  const [policyReload,setPolicyReload] = useState(0);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [step, setStep] = useState<"appointment" | "summary">("appointment");

  const listedService = services.find((item) => item.id === serviceId);
  const service = listedService && policy ? {...listedService,price_pence:policy.pricePence,deposit_pence:policy.depositPence,duration_minutes:policy.serviceOptions?.durationMinutes??listedService?.duration_minutes??0} : listedService;
  const starterFullPrepayment = policy ? policy.fullPrepayment : verificationStatus !== "verified";
  const invalidVerifiedDeposit =
    !!service &&
    !starterFullPrepayment &&
    !isRequiredDepositWithinLimit(service.price_pence, service.deposit_pence);
  const effectiveBookingFeePence = policy?.bookingFeePence ?? bookingFeePence;
  const amountDueNowPence = service
    ? starterFullPrepayment
      ? service.price_pence + effectiveBookingFeePence
      : service.deposit_pence + effectiveBookingFeePence
    : effectiveBookingFeePence;
  const [today] = useState(() => londonDateString());
  const earlyServiceNeeded=Boolean(selected&&Date.parse(selected)<earlyServiceBefore);
  const policyService=service&&policy?{...service,price_pence:policy.pricePence,deposit_pence:policy.depositPence,duration_minutes:policy.serviceOptions?.durationMinutes??listedService?.duration_minutes??0}:service;
  const quickDates = useMemo(() => dateChoices(today), [today]);

  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/v1/policies?serviceId=${encodeURIComponent(serviceId)}${optionsQuery?`&${optionsQuery}`:""}`,{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error?.message||"Booking policies could not be loaded.");if(!controller.signal.aborted){setPolicy(result.policy);setEarlyServiceBefore(Date.parse(result.earlyServiceBefore));setAccepted(false);setEarlyServiceRequested(false);}}).catch(e=>{if(!controller.signal.aborted){setPolicy(null);setNotice(e instanceof Error?e.message:"Could not load booking policies.");}});
    return ()=>controller.abort();
  },[serviceId,policyReload,optionsQuery]);

  useEffect(() => {
    if (!date || !serviceId) return;

    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          "/api/v1/availability?serviceId=" +
            encodeURIComponent(serviceId) +
            "&date=" +
            encodeURIComponent(date)+(optionsQuery?`&${optionsQuery}`:""),
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
  }, [date, serviceId,optionsQuery]);

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
    if (!service || !selected || !accepted || !policy || (earlyServiceNeeded&&!earlyServiceRequested)) return;
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,variationId,extraIds,
          startsAt: selected,
          acceptPolicy: true,
          policyToken:policy.token,
          earlyServiceRequested,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if(result.error?.code==="POLICY_CHANGED"){setAccepted(false);setEarlyServiceRequested(false);setPolicyReload(v=>v+1);}
        setClientBlocked(result.error?.code === "CLIENT_BLOCKED");
        if (
          response.status === 401 ||
          result.error?.code === "ONBOARDING_REQUIRED"
        ) {
          setNeedsAccount(true);
          setSubmitting(false);
          return;
        }
        throw new Error(
          result.error?.code === "CLIENT_BLOCKED"
            ? "This professional is not accepting new bookings from your account. You can choose another professional on Explore."
            : result.error?.code === "SLOT_TAKEN"
            ? "That time has just been taken. Please choose another."
            : result.error?.code === "VERIFICATION_REQUIRED"
              ? "This professional has reached an unverified account limit. They need to complete identity verification before taking this booking."
              : result.error?.code === "PROFESSIONAL_RESTRICTED"
                ? "This professional is temporarily unable to accept new bookings."
                : result.error?.code === "TOO_MANY_ATTEMPTS"
                  ? "You’ve tried several bookings recently. Please try again later."
                  : result.error?.code === "PAYMENTS_NOT_READY"
                    ? "This professional is not ready to accept online booking payments yet."
                    : result.error?.code === "DEPOSIT_LIMIT"
                      ? "This service has an invalid deposit setup. Verified deposits must be 40% or less of the service price."
                      : result.error?.code === "CHECKOUT_CONFLICT"
                        ? "This booking already has a payment session. Refresh the page and try again."
                        : result.error?.code === "INVALID_REQUEST"
                          ? "This service or booking setup needs to be corrected before it can be booked."
                          : result.error?.code === "UNAVAILABLE"
                            ? "Secure booking services are temporarily unavailable. Please refresh and try again."
                            : result.error?.code === "INVALID_APPOINTMENT"
                              ? "That appointment is no longer available. Please choose another date or time."
              : result.error?.message || "Booking is unavailable right now. Please try again.",
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
          {verificationStatus !== "verified" && (
            <div className="form-notice" role="status">
              {verificationStatus === "restricted"
                ? "This professional account is currently restricted from new marketplace activity."
                : verificationStatus === "pending"
                  ? "Identity verification is pending. Starter bookings remain available within starter limits, and the full service price is paid securely through GLOHAUS."
                  : `Identity has not yet been verified. Starter bookings are limited to services up to £200 and are paid in full through GLOHAUS${starterBookingsRemaining === null ? "." : `, with ${starterBookingsRemaining} starter booking${starterBookingsRemaining === 1 ? "" : "s"} remaining.`}`}
            </div>
          )}
          <div className="booking-journey-heading">
            <p className="eyebrow">BOOK YOUR APPOINTMENT</p>
            <h2>Choose your service and time.</h2>
          </div>

          <label className="booking-service-select">
            Service
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);setVariationId(null);setExtraIds([]);
                setPolicy(null);
                setAccepted(false);
                setEarlyServiceRequested(false);
                setSlots([]);
                setSelected("");
                setNotice("");
                setLoadingSlots(Boolean(date));
                setStep("appointment");
              }}
            >
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {money(item.price_pence + effectiveBookingFeePence)}{" "}
                  total
                </option>
              ))}
            </select>
          </label>

          {!!listedService?.options?.length&&<fieldset><legend>Personalise your service</legend>
          {listedService.options.some(o=>o.kind==="variation")&&<label>Size, length or style<select value={variationId??""} onChange={e=>{setVariationId(e.target.value||null);setPolicy(null);setAccepted(false);setSelected("");setSlots([]);setLoadingSlots(Boolean(date));}}><option value="">Standard · {money(listedService.price_pence)} · {listedService.duration_minutes} min</option>{listedService.options.filter(o=>o.kind==="variation").map(o=><option key={o.id} value={o.id}>{o.name} · {Object.values(o.attributes).filter(Boolean).join(" / ")} · {money(o.pricePence)} · {o.durationMinutes} min</option>)}</select></label>}
          {listedService.options.filter(o=>o.kind==="extra").map(o=><label key={o.id} className="policy-check"><input type="checkbox" checked={extraIds.includes(o.id)} onChange={e=>{setExtraIds(e.target.checked?[...extraIds,o.id]:extraIds.filter(id=>id!==o.id));setPolicy(null);setAccepted(false);setSelected("");setSlots([]);setLoadingSlots(Boolean(date));}}/>{o.name} · +{money(o.pricePence)} · +{o.durationMinutes} min</label>)}
          </fieldset>}
          <div className="booking-service-preview booking-service-reference">
            {service.asset_id ? (service.asset_media_type==="video"?<ViewportVideo src={`/api/media/${service.asset_id}`} label={service.image_alt||service.name}/>:<Image
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
                {money(service.price_pence + effectiveBookingFeePence)} total ·{" "}
                {service.duration_minutes} min
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
              <p className="booking-help">
                Choose a date to see available times.
              </p>
            ) : null}
          </fieldset>

          <div className="booking-deposit-callout">
            <CircleHelp size={18} aria-hidden />
            <div>
              <strong>
                {invalidVerifiedDeposit
                  ? "Service setup needs attention"
                  : starterFullPrepayment
                    ? "Starter booking · full payment online"
                    : "Deposit required · " + money(service.deposit_pence)}
              </strong>
              <span>
                {invalidVerifiedDeposit
                  ? "The professional needs to correct this service’s deposit before it can be booked online."
                  : starterFullPrepayment
                    ? "The full service price is paid securely through GLOHAUS at booking, plus the booking fee. This keeps the booking and GLOHAUS commission protected while the professional is unverified or pending verification."
                    : "This secures the appointment. The remaining " +
                      money(service.price_pence - service.deposit_pence) +
                      " is due for the service."}
              </span>
              <small>
                {invalidVerifiedDeposit
                  ? depositLimitMessage(service.price_pence)
                  : starterFullPrepayment
                    ? "Starter professionals cannot switch this booking to a zero-payment or cash-only booking."
                    : "Verified professional deposits must be between 15% and 40% of the service price."}
              </small>
              {invalidVerifiedDeposit && (
                <Link href="/explore">Find another professional →</Link>
              )}
            </div>
          </div>

          <button
            type="button"
            className="button full-width booking-continue"
            disabled={
              !selected ||
              !policy ||
              loadingSlots ||
              invalidVerifiedDeposit ||
              verificationStatus === "restricted" ||
              starterBookingsRemaining === 0
            }
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
              {clientBlocked && <Link className="text-link" href="/explore">Find another professional</Link>}
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
            {service.asset_id ? (service.asset_media_type==="video"?<ViewportVideo src={`/api/media/${service.asset_id}`} label={service.image_alt||service.name}/>:<Image
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

          {policy?.serviceOptions&&<p>{[policy.serviceOptions.variationName,...policy.serviceOptions.extraNames].filter(Boolean).join(" · ")} · {policy.serviceOptions.durationMinutes} minutes</p>}
          <PaymentSummary
            servicePricePence={policyService!.price_pence}
            depositPence={policyService!.deposit_pence}
            bookingFeePence={policy?.bookingFeePence??bookingFeePence}
          />

          <details className="booking-policy" open>
            <summary>Professional rules & booking policies</summary>
            {policy?<ProfessionalPolicySummary policy={policy}/>:<p role="status">Loading the applicable booking policies…</p>}
          </details>

          <label className="policy-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              I have read and acknowledge these professional rules and booking policies, and confirm the
              appointment details above.
            </span>
          </label>

          {earlyServiceNeeded&&<label className="policy-check"><input type="checkbox" checked={earlyServiceRequested} onChange={e=>setEarlyServiceRequested(e.target.checked)}/><span>I expressly request this appointment to take place within the 14-day cooling-off period. My statutory rights remain; any lawful charge for work already provided must be assessed separately.</span></label>}

          <button
            className="button full-width booking-pay-button"
            type="button"
            disabled={!ready || !accepted || !policy || submitting || (earlyServiceNeeded&&!earlyServiceRequested)}
            onClick={() => void submitBooking()}
          >
            {submitting
              ? "Confirming…"
              : "Continue to pay " + money(policy?policy.depositPence+policy.bookingFeePence:amountDueNowPence)}
          </button>

          <p className="booking-secure-note">
            <LockKeyhole size={14} aria-hidden />
            Payment details are handled securely by Stripe.
          </p>

          {!ready && (
            <p className="form-notice">
              Secure online payment is not connected yet, so this booking cannot
              be paid through GLOHAUS right now.
            </p>
          )}

          {notice && (
            <p className="form-notice" role="status">
              {notice}
              {clientBlocked && <Link className="text-link" href="/explore">Find another professional</Link>}
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
