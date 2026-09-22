"use client";

import Link from "next/link";
import { CalendarPlus, Check, MessageCircle, ArrowRight } from "lucide-react";
import { money } from "@/modules/professionals/domain";

export function BookingConfirmation({
  bookingId,
  serviceName,
  professionalName,
  startsAt,
  endsAt,
  depositPence,
  remainingPence,
}: {
  bookingId: string;
  serviceName: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  depositPence: number;
  remainingPence: number;
}) {
  function addToCalendar() {
    const escape = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
    const calendarDate = (value: string) =>
      new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const event = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//GLOHAUS//Booking//EN",
      "BEGIN:VEVENT",
      `UID:glohaus-${bookingId}`,
      `DTSTART:${calendarDate(startsAt)}`,
      `DTEND:${calendarDate(endsAt)}`,
      `SUMMARY:${escape(`${serviceName} with ${professionalName}`)}`,
      `DESCRIPTION:${escape(`Booked through GLOHAUS. Deposit paid: ${money(depositPence)}. Remaining service balance: ${money(remainingPence)}.`)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([event], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "glohaus-appointment.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="booking-confirmation" aria-label="Booking confirmed">
      <span className="booking-confirmation-icon">
        <Check size={25} aria-hidden />
      </span>
      <p className="eyebrow">BOOKING CONFIRMED</p>
      <h2>You&apos;re booked in.</h2>
      <p className="booking-confirmation-intro">
        {serviceName} with <strong>{professionalName}</strong>
      </p>
      <dl>
        <div>
          <dt>Date & time</dt>
          <dd>
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/London",
            }).format(new Date(startsAt))}
          </dd>
        </div>
        <div>
          <dt>Deposit paid</dt>
          <dd>{money(depositPence)}</dd>
        </div>
        <div>
          <dt>Remaining service balance</dt>
          <dd>{money(remainingPence)}</dd>
        </div>
      </dl>
      <div className="booking-confirmation-actions">
        <button type="button" onClick={addToCalendar}>
          <CalendarPlus size={17} aria-hidden /> Add to calendar
        </button>
        <button type="button" disabled title="Messaging will be available when conversations are enabled.">
          <MessageCircle size={17} aria-hidden /> Message professional
        </button>
        <Link href={`/account/bookings/${bookingId}`}>
          View booking <ArrowRight size={17} aria-hidden />
        </Link>
      </div>
      <Link className="booking-confirmation-done" href="/">
        Done
      </Link>
    </section>
  );
}
