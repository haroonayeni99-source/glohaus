import { describe, expect, it } from "vitest";
import {
  confirmationPlan,
  signedInDestination,
  storedAuthAudience,
} from "@/lib/auth-flow";

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

describe("signed-in role routing", () => {
  it("routes owner and admin accounts to administration", () => {
    expect(signedInDestination(["owner"], "customer", "/account")).toBe("/admin");
    expect(signedInDestination(["admin"], "professional", "/professional")).toBe(
      "/admin",
    );
  });

  it("keeps owner routing highest priority when the account also has customer and professional roles", () => {
    expect(
      signedInDestination(
        ["admin", "customer", "owner", "professional"],
        "customer",
        "/account",
      ),
    ).toBe("/admin");
    expect(
      signedInDestination(
        ["admin", "customer", "owner", "professional"],
        "professional",
        "/professional",
      ),
    ).toBe("/admin");
  });

  it("keeps customer and professional views separate when both roles exist", () => {
    expect(
      signedInDestination(["customer", "professional"], "customer", "/account"),
    ).toBe("/account");
    expect(
      signedInDestination(
        ["customer", "professional"],
        "professional",
        "/professional",
      ),
    ).toBe("/professional");
  });

  it("sends professional-only accounts to GLOHAUS PRO from normal sign-in", () => {
    expect(
      signedInDestination(["professional"], "customer", "/account"),
    ).toBe("/professional");
  });

  it("starts professional onboarding when that role is not enrolled yet", () => {
    expect(
      signedInDestination(["customer"], "professional", "/professional"),
    ).toBe("/onboarding?intent=professional");
  });

  it("never accepts an external requested destination", () => {
    expect(
      signedInDestination(["customer"], "customer", "//evil.example"),
    ).toBe("/account");
  });
});
