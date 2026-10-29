import { describe, expect, it } from "vitest";
import { qualifyReward, type Contribution } from "../src/modules/rewards/qualification";
const base: Contribution = { commissionCollected: 600, bookingFeesBeforeDiscount: 150, processingCosts: 100, reversedRevenue: 0, referralDiscounts: 50, attributableCosts: 0 };
describe("retained contribution reward qualification", () => {
  it("requires the reward and buffer, and never authorises cash", () => {
    expect(qualifyReward(base, 500, 100)).toEqual({ status: "pending_approval", contributionPence: 600, cashPayoutAuthorised: false });
    expect(qualifyReward(base, 500, 101).status).toBe("pending_qualification");
  });
  it("does not assume standard commission during founding", () => {
    expect(qualifyReward({ ...base, commissionCollected: 0 }, 500, 100).status).toBe("pending_qualification");
  });
  it("waits for actual costs instead of treating unknown costs as free", () => {
    expect(qualifyReward({ ...base, processingCosts: null }, 500, 100).status).toBe("pending_costs");
  });
  it("deducts reversed revenue and attributable costs", () => {
    expect(qualifyReward({ ...base, reversedRevenue: 500, attributableCosts: 150 }, 500, 0).contributionPence).toBe(-50);
  });
  it("rejects invalid money and unsafe arithmetic", () => {
    expect(() => qualifyReward({ ...base, processingCosts: -1 }, 500, 0)).toThrow("INVALID_PENCE");
    expect(() => qualifyReward(base, 5.5, 0)).toThrow("INVALID_PENCE");
    expect(() => qualifyReward(base, Number.MAX_SAFE_INTEGER, 1)).toThrow("INVALID_PENCE");
  });
});
