import { describe, expect, it } from "vitest";
import { verifiedSecondFactorAge } from "@/lib/auth-assurance";

describe("verified second-factor assurance", () => {
  const now = 1_800_000_000_000;
  it("only accepts a signed AAL2 TOTP challenge timestamp", () => {
    expect(
      verifiedSecondFactorAge(
        { aal: "aal2", amr: [{ method: "totp", timestamp: 1_799_999_700 }] },
        now,
      ),
    ).toBe(5);
  });
  it("fails closed for a first-factor, missing or future challenge", () => {
    expect(verifiedSecondFactorAge({ aal: "aal1", amr: [] }, now)).toBeNull();
    expect(verifiedSecondFactorAge({ aal: "aal2", amr: [] }, now)).toBeNull();
    expect(
      verifiedSecondFactorAge(
        { aal: "aal2", amr: [{ method: "totp", timestamp: 1_800_000_001 }] },
        now,
      ),
    ).toBeNull();
  });
});
