/** Integer-pence qualification only; never authorises or executes a payout. */
export type Contribution = {
  commissionCollected: number;
  bookingFeesBeforeDiscount: number;
  processingCosts: number | null;
  reversedRevenue: number;
  referralDiscounts: number;
  attributableCosts: number | null;
};
export function qualifyReward(input: Contribution, reward: number, profitBuffer: number) {
  const amounts = [...Object.values(input).filter((v): v is number => v !== null), reward, profitBuffer];
  if (amounts.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error("INVALID_PENCE");
  if (input.processingCosts === null || input.attributableCosts === null) {
    return { status: "pending_costs" as const, contributionPence: null, cashPayoutAuthorised: false as const };
  }
  const contribution = input.commissionCollected + input.bookingFeesBeforeDiscount
    - input.processingCosts - input.reversedRevenue - input.referralDiscounts - input.attributableCosts;
  if (!Number.isSafeInteger(contribution) || !Number.isSafeInteger(reward + profitBuffer)) throw new Error("INVALID_PENCE");
  return {
    status: contribution >= reward + profitBuffer ? "pending_approval" as const : "pending_qualification" as const,
    contributionPence: contribution,
    cashPayoutAuthorised: false as const,
  };
}
