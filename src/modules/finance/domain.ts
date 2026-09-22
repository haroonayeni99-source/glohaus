import { z } from "zod";

export class FinanceError extends Error {
  constructor(
    public code:
      | "INVALID_AMOUNT"
      | "BELOW_MINIMUM_TRANSACTION"
      | "NEGATIVE_AVAILABLE_BALANCE"
      | "INSUFFICIENT_AVAILABLE_BALANCE",
  ) {
    super(code);
  }
}

export const feeRuleSchema = z
  .object({
    percentageBasisPoints: z.number().int().min(0).max(10_000),
    fixedFeePence: z.number().int().min(0).max(100_000),
    minimumFeePence: z.number().int().min(0).max(100_000),
    maximumFeePence: z.number().int().min(0).max(100_000).nullable(),
    minimumTransactionPence: z.number().int().min(1).max(100_000_000),
  })
  .superRefine((value, context) => {
    if (
      value.maximumFeePence !== null &&
      value.maximumFeePence < value.minimumFeePence
    )
      context.addIssue({
        code: "custom",
        path: ["maximumFeePence"],
        message: "Maximum fee must be at least the minimum fee.",
      });
  });

export type FeeRule = z.infer<typeof feeRuleSchema>;
export type FeePayer = "customer" | "professional";
export type ProcessingCostPayer = "platform" | "professional";

export type BookingQuoteInput = {
  servicePricePence: number;
  payableNowPence: number;
  feeRule: FeeRule;
  feePayer: FeePayer;
  estimatedProviderCostPence: number;
  otherPlatformCostPence?: number;
  processingCostPayer: ProcessingCostPayer;
};

export type BookingQuote = {
  servicePricePence: number;
  payableNowPence: number;
  customerPlatformFeePence: number;
  professionalPlatformFeePence: number;
  estimatedProviderCostPence: number;
  professionalProcessingCostPence: number;
  customerTotalPence: number;
  professionalProceedsPence: number;
  platformGrossRevenuePence: number;
  platformNetRevenuePence: number;
  negativeMargin: boolean;
};

function validPence(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Calculates a prospective fee from a rule loaded by the server. Percentages
 * are stored as basis points so the browser never has to perform money math.
 */
export function calculatePlatformFee(
  transactionPence: number,
  ruleInput: FeeRule,
): number {
  if (!validPence(transactionPence) || transactionPence === 0)
    throw new FinanceError("INVALID_AMOUNT");
  const rule = feeRuleSchema.parse(ruleInput);
  if (transactionPence < rule.minimumTransactionPence)
    throw new FinanceError("BELOW_MINIMUM_TRANSACTION");
  const percentage = Math.round(
    (transactionPence * rule.percentageBasisPoints) / 10_000,
  );
  const beforeCap = Math.max(
    rule.minimumFeePence,
    percentage + rule.fixedFeePence,
  );
  return rule.maximumFeePence === null
    ? beforeCap
    : Math.min(beforeCap, rule.maximumFeePence);
}

/**
 * A transparent quote for the amount collected in this checkout. A deposit is
 * deliberately distinct from the total service value: later balance payments
 * can receive their own quote and immutable fee snapshot.
 */
export function quoteBookingPayment(input: BookingQuoteInput): BookingQuote {
  const otherPlatformCostPence = input.otherPlatformCostPence ?? 0;
  if (
    !validPence(input.servicePricePence) ||
    !validPence(input.payableNowPence) ||
    input.servicePricePence === 0 ||
    input.payableNowPence === 0 ||
    input.payableNowPence > input.servicePricePence ||
    !validPence(input.estimatedProviderCostPence) ||
    !validPence(otherPlatformCostPence)
  )
    throw new FinanceError("INVALID_AMOUNT");

  const platformFeePence = calculatePlatformFee(
    input.payableNowPence,
    input.feeRule,
  );
  const customerPlatformFeePence =
    input.feePayer === "customer" ? platformFeePence : 0;
  const professionalPlatformFeePence =
    input.feePayer === "professional" ? platformFeePence : 0;
  const professionalProcessingCostPence =
    input.processingCostPayer === "professional"
      ? input.estimatedProviderCostPence
      : 0;
  const platformCosts =
    (input.processingCostPayer === "platform"
      ? input.estimatedProviderCostPence
      : 0) + otherPlatformCostPence;
  const professionalProceedsPence = Math.max(
    0,
    input.payableNowPence -
      professionalPlatformFeePence -
      professionalProcessingCostPence,
  );
  const platformNetRevenuePence = platformFeePence - platformCosts;

  return {
    servicePricePence: input.servicePricePence,
    payableNowPence: input.payableNowPence,
    customerPlatformFeePence,
    professionalPlatformFeePence,
    estimatedProviderCostPence: input.estimatedProviderCostPence,
    professionalProcessingCostPence,
    customerTotalPence: input.payableNowPence + customerPlatformFeePence,
    professionalProceedsPence,
    platformGrossRevenuePence: platformFeePence,
    platformNetRevenuePence,
    negativeMargin: platformNetRevenuePence < 0,
  };
}

export type WalletBalances = {
  pendingPence: number;
  availablePence: number;
  reservedPence: number;
  processingPence: number;
  disputedPence: number;
  outstandingObligationPence: number;
  taxPotPence: number;
};

export function validateWalletBalances(balances: WalletBalances): WalletBalances {
  for (const amount of Object.values(balances))
    if (!validPence(amount)) throw new FinanceError("INVALID_AMOUNT");
  if (balances.availablePence < 0)
    throw new FinanceError("NEGATIVE_AVAILABLE_BALANCE");
  return balances;
}

export function quoteWithdrawal(
  balances: WalletBalances,
  withdrawalPence: number,
  feeRule: FeeRule,
): { withdrawalPence: number; feePence: number; bankAmountPence: number } {
  validateWalletBalances(balances);
  if (!validPence(withdrawalPence) || withdrawalPence === 0)
    throw new FinanceError("INVALID_AMOUNT");
  if (withdrawalPence > balances.availablePence)
    throw new FinanceError("INSUFFICIENT_AVAILABLE_BALANCE");
  const feePence = calculatePlatformFee(withdrawalPence, feeRule);
  if (feePence > withdrawalPence) throw new FinanceError("INVALID_AMOUNT");
  return {
    withdrawalPence,
    feePence,
    bankAmountPence: withdrawalPence - feePence,
  };
}

export const taxAcknowledgementSchema = z
  .object({
    accepted: z.literal(true),
    termsVersion: z.string().trim().min(1).max(80),
  })
  .strict();
