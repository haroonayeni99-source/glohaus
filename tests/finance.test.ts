import { describe, expect, it } from "vitest";
import {
  calculatePlatformFee,
  FinanceError,
  quoteBookingPayment,
  quoteWithdrawal,
  taxAcknowledgementSchema,
} from "@/modules/finance/domain";

const rule = {
  percentageBasisPoints: 200,
  fixedFeePence: 0,
  minimumFeePence: 30,
  maximumFeePence: null,
  minimumTransactionPence: 100,
};

describe("configurable financial quotes", () => {
  it("uses the server-supplied rule and keeps money in integer pence", () => {
    expect(calculatePlatformFee(5_000, rule)).toBe(100);
    expect(
      calculatePlatformFee(1_000, {
        ...rule,
        percentageBasisPoints: 0,
        fixedFeePence: 20,
        minimumFeePence: 50,
      }),
    ).toBe(50);
  });

  it("applies customer-paid fees without reducing professional proceeds", () => {
    expect(
      quoteBookingPayment({
        servicePricePence: 8_000,
        payableNowPence: 2_000,
        feeRule: rule,
        feePayer: "customer",
        estimatedProviderCostPence: 70,
        processingCostPayer: "platform",
      }),
    ).toMatchObject({
      customerPlatformFeePence: 40,
      professionalPlatformFeePence: 0,
      customerTotalPence: 2_040,
      professionalProceedsPence: 2_000,
      platformGrossRevenuePence: 40,
      platformNetRevenuePence: -30,
      negativeMargin: true,
    });
  });

  it("shows business-absorbed fees and processing costs before payment", () => {
    expect(
      quoteBookingPayment({
        servicePricePence: 5_000,
        payableNowPence: 5_000,
        feeRule: rule,
        feePayer: "professional",
        estimatedProviderCostPence: 150,
        processingCostPayer: "professional",
      }),
    ).toMatchObject({
      customerTotalPence: 5_000,
      professionalPlatformFeePence: 100,
      professionalProcessingCostPence: 150,
      professionalProceedsPence: 4_750,
      platformNetRevenuePence: 100,
    });
  });

  it("never allows an overdrawn wallet to create a withdrawal", () => {
    const balances = {
      pendingPence: 100,
      availablePence: 1_000,
      reservedPence: 0,
      processingPence: 0,
      disputedPence: 0,
      outstandingObligationPence: 600,
      taxPotPence: 0,
    };
    expect(quoteWithdrawal(balances, 500, rule)).toEqual({
      withdrawalPence: 500,
      feePence: 30,
      bankAmountPence: 470,
    });
    expect(() => quoteWithdrawal(balances, 1_001, rule)).toThrow(
      FinanceError,
    );
  });

  it("requires a real tax acknowledgement and a versioned term", () => {
    expect(
      taxAcknowledgementSchema.safeParse({
        accepted: true,
        termsVersion: "uk-tax-2026-01",
      }).success,
    ).toBe(true);
    expect(
      taxAcknowledgementSchema.safeParse({
        accepted: false,
        termsVersion: "uk-tax-2026-01",
      }).success,
    ).toBe(false);
  });
});
