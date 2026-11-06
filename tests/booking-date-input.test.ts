import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BookingPicker } from "@/components/booking-picker";
const service = {
  id: "00000000-0000-4000-8000-000000000001",
  professional_id: "test",
  name: "Test service",
  description: "",
  duration_minutes: 60,
  price_pence: 5000,
  deposit_pence: 1500,
};
it("ignores impossible dates in incoming booking links rather than crashing or rolling them forward", () => {
  for (const date of ["2026-99-99", "2026-02-30", "2026-02-29"]) {
    const html = renderToStaticMarkup(
      React.createElement(BookingPicker, {
        services: [service],
        ready: true,
        returnPath: "/p/test",
        professionalName: "Test",
        bookingFeePence: 100,
        initialSelection: { serviceId: service.id, date },
        verificationStatus: "verified",
      }),
    );
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="' + date + '"');
  }
});
