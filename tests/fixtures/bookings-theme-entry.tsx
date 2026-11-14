import React from "react";
import { createRoot } from "react-dom/client";
import { BookingList } from "@/components/booking-list";
import { BookingNavigation } from "@/components/booking-navigation";
import type { BookingRecord } from "@/modules/bookings/repository";
// Fictional data, actual booking components; no accounts or network mutations.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
const booking: BookingRecord = {
  id: "fixture", starts_at: new Date("2026-11-20T14:00:00Z"), ends_at: new Date("2026-11-20T15:00:00Z"), service_name: "Hair styling",
  customer_name: "Example customer", professional_name: "Example professional",
  price_pence: 5000, status: "confirmed", taxonomy_snapshot: { specialityName: "Hair" },
  deposit_pence: 1000, cancellation_reason: null, captured_pence: 1000, refunded_pence: 0,
  payment_status: "succeeded", completed_at: null, has_ended: false, cancellable: true, location_window_open: false,
};
createRoot(document.getElementById("root")!).render(
  <div className="pro-app"><main className="pro-main pro-list-page">
    <section className="pro-panel pro-bookings-list-panel">
      <BookingNavigation view="upcoming" base="/professional/bookings" next={null} after={false}>
        <BookingList bookings={[booking]} professional />
        <BookingList bookings={[]} professional />
      </BookingNavigation>
    </section>
  </main></div>
);
