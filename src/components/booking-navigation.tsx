import Link from "next/link";
import type { ReactNode } from "react";
import { bookingViews, type BookingView } from "@/modules/bookings/listing";
export function BookingNavigation({
  view,
  base,
  next,
  after,
  children,
}: {
  view: BookingView;
  base: string;
  next: string | null;
  after: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <nav className="booking-view-tabs" aria-label="Appointment views">
        {bookingViews.map((item) => (
          <Link
            key={item}
            href={`${base}?view=${item}`}
            aria-current={item === view ? "page" : undefined}
          >
            {item === "upcoming"
              ? "Upcoming"
              : item === "history"
                ? "History"
                : "All appointments"}
          </Link>
        ))}
      </nav>
      {children}
      <nav className="booking-pagination" aria-label="Appointment pages">
        {after && (
          <Link className="text-link" href={`${base}?view=${view}`}>
            ← Back to first page
          </Link>
        )}
        {next && (
          <Link
            className="button small"
            href={`${base}?view=${view}&after=${encodeURIComponent(next)}`}
          >
            Next appointments →
          </Link>
        )}
      </nav>
    </>
  );
}
