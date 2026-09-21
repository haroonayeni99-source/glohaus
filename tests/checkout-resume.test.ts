import { describe, it, expect } from "vitest";
import {
  resumedCheckoutUrl,
  type CheckoutSessionState,
} from "@/modules/payments/checkout-resume";
const reference = {
  bookingId: "booking-1",
  sessionId: "cs_1",
  depositPence: 1500,
};
const session: CheckoutSessionState = {
  id: "cs_1",
  metadata: { booking_id: "booking-1" },
  amount_total: 1500,
  currency: "gbp",
  status: "open",
  payment_status: "unpaid",
  url: "https://checkout.stripe.com/c/pay/cs_1",
  expires_at: 2000,
};
describe("resuming the original hosted deposit checkout", () => {
  it("returns only the matching unpaid unexpired Stripe URL", () =>
    expect(resumedCheckoutUrl(reference, session, 1000000)).toBe(session.url));
  it("rejects payment, booking, currency or amount mismatches", () => {
    for (const change of [
      { id: "cs_other" },
      { metadata: { booking_id: "someone-else" } },
      { amount_total: 1600 },
      { currency: "usd" },
    ])
      expect(() =>
        resumedCheckoutUrl(reference, { ...session, ...change }, 1000000),
      ).toThrow("UNAVAILABLE");
  });
  it("does not resume completed, expired or already paid sessions", () => {
    for (const change of [
      { status: "complete" },
      { status: "expired" },
      { payment_status: "paid" },
      { expires_at: 1000 },
      { url: null },
    ])
      expect(() =>
        resumedCheckoutUrl(reference, { ...session, ...change }, 1000000),
      ).toThrow("INVALID_REQUEST");
  });
  it("rejects non-Stripe, insecure and credential-bearing redirects", () => {
    for (const url of [
      "https://checkout.stripe.com.evil.test/pay",
      "http://checkout.stripe.com/pay",
      "https://attacker@checkout.stripe.com/pay",
      "javascript:alert(1)",
    ])
      expect(() =>
        resumedCheckoutUrl(reference, { ...session, url }, 1000000),
      ).toThrow("UNAVAILABLE");
  });
});
