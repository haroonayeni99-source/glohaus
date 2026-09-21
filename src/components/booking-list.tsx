import Link from "next/link";
import { money } from "@/modules/professionals/domain";
import type { BookingRecord } from "@/modules/bookings/repository";
export function BookingList({
  bookings,
  professional = false,
}: {
  bookings: BookingRecord[];
  professional?: boolean;
}) {
  return bookings.length ? (
    <div className="service-edit-list">
      {bookings.map((booking) => (
        <Link
          href={`/account/bookings/${booking.id}`}
          className="service-edit-row"
          key={booking.id}
        >
          <div>
            <h3>{booking.service_name}</h3>
            <p>
              {professional ? booking.customer_name : booking.professional_name}{" "}
              ·{" "}
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/London",
              }).format(new Date(booking.starts_at))}
            </p>
            <span className="muted-badge">
              {booking.status.replaceAll("_", " ")}
            </span>
          </div>
          <strong>{money(booking.price_pence)}</strong>
        </Link>
      ))}
    </div>
  ) : (
    <section className="catalog-empty">
      <h2>No appointments in this view.</h2>
      <p>
        {professional
          ? "Try another view to see your other appointments."
          : "Try another view, or find a professional for your next appointment."}
      </p>
      <Link className="text-link" href="/explore">
        Explore professionals
      </Link>
    </section>
  );
}
