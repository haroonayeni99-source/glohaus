/**
 * GLOHAUS verified-professional deposit policy.
 * Starter/unverified bookings are handled separately as full prepayment through GLOHAUS.
 * All amounts are integer pence.
 */
export const MINIMUM_PROFESSIONAL_DEPOSIT_PERCENT = 15;
export const MAXIMUM_PROFESSIONAL_DEPOSIT_PERCENT = 40;

export function minimumRequiredDepositPence(pricePence: number) {
  if (!Number.isSafeInteger(pricePence) || pricePence < 0)
    throw new Error("INVALID_SERVICE_PRICE");
  return Math.ceil(
    (pricePence * MINIMUM_PROFESSIONAL_DEPOSIT_PERCENT) / 100,
  );
}

export function maximumRequiredDepositPence(pricePence: number) {
  if (!Number.isSafeInteger(pricePence) || pricePence < 0)
    throw new Error("INVALID_SERVICE_PRICE");
  return Math.floor(
    (pricePence * MAXIMUM_PROFESSIONAL_DEPOSIT_PERCENT) / 100,
  );
}

export function isRequiredDepositWithinLimit(
  pricePence: number,
  depositPence: number,
) {
  return (
    Number.isSafeInteger(pricePence) &&
    pricePence >= 0 &&
    Number.isSafeInteger(depositPence) &&
    depositPence >= minimumRequiredDepositPence(pricePence) &&
    depositPence <= maximumRequiredDepositPence(pricePence)
  );
}

export function depositLimitMessage(pricePence: number) {
  if (!Number.isSafeInteger(pricePence) || pricePence < 0)
    return "Verified professional deposits must be between 15% and 40% of the service price.";
  const minimum = minimumRequiredDepositPence(pricePence);
  const maximum = maximumRequiredDepositPence(pricePence);
  return `Verified professional deposits must be between 15% and 40% of the service price. For this service, that is £${(minimum / 100).toFixed(2)} to £${(maximum / 100).toFixed(2)}.`;
}
