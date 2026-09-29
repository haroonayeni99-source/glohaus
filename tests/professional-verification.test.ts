import { describe, expect, it } from "vitest";
import {
  assertBookingAllowed,
  assertProductPublishingAllowed,
  assertStarterServiceAllowed,
  assertProfilePublishingAllowed,
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
  it("allows professionals to prepare services before verification", () => {
    expect(() =>
      assertStarterServiceAllowed(unverified, {
        active: true,
        pricePence: 50000,
        depositPence: 10000,
      }),
    ).not.toThrow();
  });

  it("requires verification before publishing the professional profile", () => {
    expect(() =>
      assertProfilePublishingAllowed(unverified, "published"),
    ).toThrow("VERIFICATION_REQUIRED");
    expect(() =>
      assertProfilePublishingAllowed(unverified, "draft"),
    ).not.toThrow();
    expect(() =>
      assertProfilePublishingAllowed(verified, "published"),
    ).not.toThrow();
  });

  it("requires verification to publish products", () => {
    expect(() =>
      assertProductPublishingAllowed(unverified, "published"),
    ).toThrow("VERIFICATION_REQUIRED");
    expect(() =>
      assertProductPublishingAllowed(unverified, "draft"),
    ).not.toThrow();
  });

  it("requires verification for marketplace bookings and unlocks verified accounts", () => {
    expect(() =>
      assertBookingAllowed(
        unverified,
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
