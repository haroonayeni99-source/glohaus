import Link from "next/link";
import { CalendarDays, ChevronRight, Clock } from "lucide-react";
import { money } from "@/modules/professionals/domain";
import type { BookingRecord } from "@/modules/bookings/repository";
export type ArrivalSummary = {
  detectedAt: string | null;
  manualAt: string | null;
  attendanceAt: string | null;
  sharing: boolean;
  late: boolean;
  eta: string | null;
};
const day = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  timeZone: "Europe/London",
});
const month = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "Europe/London",
});
const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});
export function BookingList({
  bookings,
  professional = false,
  arrivals = {},
}: {
  bookings: BookingRecord[];
  professional?: boolean;
  arrivals?: Record<string, ArrivalSummary>;
}) {
  return bookings.length ? (
    <div className="appointment-card-list">
      {bookings.map((booking) => (
        <Link
          href={`/account/bookings/${booking.id}`}
          className="appointment-card"
          key={booking.id}
        >
          <span className="appointment-date">
            <strong>{day.format(new Date(booking.starts_at))}</strong>
            <span>{month.format(new Date(booking.starts_at))}</span>
          </span>
          <div className="appointment-card-copy">
            <h3>{booking.service_name}</h3>
            {booking.taxonomy_snapshot?.specialityName && (
              <small>{booking.taxonomy_snapshot.specialityName}</small>
            )}
            {booking.service_options_snapshot && (
              <small>
                {[
                  booking.service_options_snapshot.variationName,
                  ...(booking.service_options_snapshot.extraNames ?? []),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            )}
            <p>
              {professional ? booking.customer_name : booking.professional_name}
            </p>
            <span className="appointment-time">
              <Clock size={13} aria-hidden />{" "}
              {time.format(new Date(booking.starts_at))} ·{" "}
              {money(booking.price_pence)}
            </span>
          </div>
          {professional && arrivals[booking.id] && (
            <div
              className="appointment-time"
              style={{ display: "grid", gap: 4, fontSize: 12 }}
            >
              <span>
                {arrivals[booking.id].attendanceAt
                  ? "Attendance confirmed"
                  : arrivals[booking.id].detectedAt
                    ? "Detected nearby"
                    : arrivals[booking.id].manualAt
                      ? "Manual check-in recorded"
                      : "Arrival not recorded"}
              </span>
              {(arrivals[booking.id].detectedAt ||
                arrivals[booking.id].manualAt) && (
                <span>
                  {time.format(
                    new Date(
                      arrivals[booking.id].detectedAt ||
                        arrivals[booking.id].manualAt!,
                    ),
                  )}
                </span>
              )}
              <span>
                {arrivals[booking.id].sharing
                  ? "Journey sharing active"
                  : "Journey not shared"}
              </span>
              {arrivals[booking.id].late && (
                <span>
                  Customer reported running late
                  {arrivals[booking.id].eta
                    ? ` · Estimated ${time.format(new Date(arrivals[booking.id].eta!))}`
                    : ""}
                </span>
              )}
            </div>
          )}
          <div className="appointment-card-status">
            <span
              className={`appointment-badge appointment-badge-${booking.status}`}
            >
              {booking.status.replaceAll("_", " ")}
            </span>
            <span className="appointment-detail-label">
              Details & accepted policies <ChevronRight size={14} aria-hidden />
            </span>
          </div>
        </Link>
      ))}
    </div>
  ) : (
    <section className="catalog-empty">
      <CalendarDays size={30} aria-hidden />
      <h2>No appointments in this view.</h2>
      <p>
        {professional
          ? "Your appointments will appear here as clients book. Try another view for past visits."
          : "Your next beauty moment starts with a professional you love."}
      </p>
      <Link
        className="text-link"
        href={professional ? "/professional/availability" : "/explore"}
      >
        {professional ? "Manage availability" : "Explore professionals"}
      </Link>
    </section>
  );
}
