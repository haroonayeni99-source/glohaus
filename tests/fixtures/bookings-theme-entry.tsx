import React from "react";
import { createRoot } from "react-dom/client";
import { BookingList } from "@/components/booking-list";
import { BookingNavigation } from "@/components/booking-navigation";
import type { BookingRecord } from "@/modules/bookings/repository";
// Fictional data, actual booking components; no accounts or network mutations.
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
const booking = {
  id: "fixture", starts_at: "2026-11-20T14:00:00Z", service_name: "Hair styling",
  customer_name: "Example customer", professional_name: "Example professional",
  price_pence: 5000, status: "confirmed", taxonomy_snapshot: { specialityName: "Hair" },
} as BookingRecord;
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
