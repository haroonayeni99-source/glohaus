import { describe, expect, it } from "vitest";
import { confirmationPlan, storedAuthAudience } from "@/lib/auth-flow";

describe("auth confirmation flow", () => {
  it("provisions customers to the account by default", () => {
    expect(confirmationPlan(null, {})).toEqual({
      audience: "customer",
      redirectTo: "/account",
    });
  });

  it("preserves a safe customer return path", () => {
    expect(confirmationPlan("/p/studio", { glohaus_audience: "customer" })).toEqual({
      audience: "customer",
      redirectTo: "/p/studio",
    });
  });

  it("unwraps legacy customer onboarding links", () => {
    expect(
      confirmationPlan("/onboarding?returnTo=%2Faccount%2Fbookings", {}),
    ).toEqual({
      audience: "customer",
      redirectTo: "/account/bookings",
    });
  });

  it("keeps professional confirmations in professional onboarding", () => {
    expect(
      confirmationPlan("/onboarding?intent=professional", {}),
    ).toEqual({
      audience: "professional",
      redirectTo: "/onboarding?intent=professional",
    });
    expect(
      confirmationPlan("/account", { glohaus_audience: "professional" }),
    ).toEqual({
      audience: "professional",
      redirectTo: "/onboarding?intent=professional",
    });
  });

  it("rejects unsafe return targets", () => {
    expect(confirmationPlan("//evil.example", {})).toEqual({
      audience: "customer",
      redirectTo: "/account",
    });
    expect(storedAuthAudience({ glohaus_audience: "admin" })).toBeNull();
  });
});
