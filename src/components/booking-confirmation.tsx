"use client";

import Link from "next/link";
import { bookingCalendarDownload } from "@/modules/bookings/calendar-download";
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
    const event = bookingCalendarDownload({
      id: bookingId,
      startsAt,
      endsAt,
      summary: `${serviceName} with ${professionalName}`,
      description: `Booked through GLOHAUS. ${remainingPence === 0 ? "Service payment" : "Deposit"} paid: ${money(depositPence)}. Remaining service balance: ${money(remainingPence)}.`,
    });
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
          <dt>{remainingPence === 0 ? "Service paid in full" : "Deposit paid"}</dt>
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
        <Link href={`/messages?booking=${bookingId}`}>
          <MessageCircle size={17} aria-hidden /> Message professional
        </Link>
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
