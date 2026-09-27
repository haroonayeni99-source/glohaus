import { describe, expect, it } from "vitest";
import {
  assertBookingAllowed,
  assertProductPublishingAllowed,
  assertStarterServiceAllowed,
  assertWithdrawalAllowed,
  type ProfessionalAccessState,
} from "@/modules/professionals/verification";

const unverified: ProfessionalAccessState = {
  status: "unverified",
  verified: false,
  paymentReady: false,
  starterBookingsUsed: 0,
  starterBookingsRemaining: 5,
};

const verified: ProfessionalAccessState = {
  status: "verified",
  verified: true,
  paymentReady: true,
  starterBookingsUsed: 7,
  starterBookingsRemaining: null,
};

describe("professional verification limits", () => {
  it("allows a starter service up to £200 with no deposit", () => {
    expect(() =>
      assertStarterServiceAllowed(unverified, {
        active: true,
        pricePence: 20000,
        depositPence: 0,
      }),
    ).not.toThrow();
  });

  it("requires verification for deposits or higher-value starter services", () => {
    expect(() =>
      assertStarterServiceAllowed(unverified, {
        active: true,
        pricePence: 20001,
        depositPence: 0,
      }),
    ).toThrow("VERIFICATION_REQUIRED");

    expect(() =>
      assertStarterServiceAllowed(unverified, {
        active: true,
        pricePence: 10000,
        depositPence: 1000,
      }),
    ).toThrow("VERIFICATION_REQUIRED");
  });

  it("requires verification to publish products", () => {
    expect(() =>
      assertProductPublishingAllowed(unverified, "published"),
    ).toThrow("VERIFICATION_REQUIRED");
    expect(() =>
      assertProductPublishingAllowed(unverified, "draft"),
    ).not.toThrow();
  });

  it("stops starter bookings after the allowance and unlocks verified accounts", () => {
    expect(() =>
      assertBookingAllowed(
        { ...unverified, starterBookingsRemaining: 0 },
        { pricePence: 10000, depositPence: 0 },
      ),
    ).toThrow("VERIFICATION_REQUIRED");

    expect(() =>
      assertBookingAllowed(verified, {
        pricePence: 50000,
        depositPence: 10000,
      }),
    ).not.toThrow();
  });

  it("requires verification before any withdrawal", () => {
    expect(() => assertWithdrawalAllowed(unverified)).toThrow(
      "VERIFICATION_REQUIRED",
    );
    expect(() => assertWithdrawalAllowed(verified)).not.toThrow();
  });

  it("blocks restricted professional activity", () => {
    expect(() =>
      assertBookingAllowed(
        { ...unverified, status: "restricted" },
        { pricePence: 10000, depositPence: 0 },
      ),
    ).toThrow("PROFESSIONAL_RESTRICTED");
  });
});
