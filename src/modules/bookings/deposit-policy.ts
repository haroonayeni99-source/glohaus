/**
 * GLOHAUS policy: a professional may require at most 40% of the service
 * price to secure an appointment. All amounts are integer pence.
 */
export const MAXIMUM_PROFESSIONAL_DEPOSIT_PERCENT = 40;

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
    depositPence >= 0 &&
    depositPence <= maximumRequiredDepositPence(pricePence)
  );
}

export function depositLimitMessage(pricePence: number) {
  if (!Number.isSafeInteger(pricePence) || pricePence < 0)
    return "Deposits cannot exceed 40% of the service price.";
  const maximum = maximumRequiredDepositPence(pricePence);
  return `Deposits cannot exceed 40% of the service price. The maximum deposit for this service is £${(maximum / 100).toFixed(2)}.`;
}
