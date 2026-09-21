import { describe, it, expect } from "vitest";
import {
  balancePence,
  bookingSnapshotSchema,
  cancellationRefund,
  canTransition,
  overlaps,
  reviewEligible,
  type CancellationDecision,
} from "@/modules/bookings/domain";
const start = Date.parse("2026-10-26T12:00:00Z");
const decision: CancellationDecision = {
  startsAt: start,
  requestedAt: start - 60 * 60 * 1000,
  capturedDepositPence: 2500,
  alreadyRefundedPence: 0,
  cancelledBy: "customer",
  reasonableCause: "pending",
};
describe("cancellation decisions", () => {
  it("requires a human review inside 24 hours", () =>
    expect(cancellationRefund(decision)).toEqual({
      state: "needs_review",
      refundPence: null,
    }));
  it("refunds in full at the exact 24 hour boundary", () =>
    expect(
      cancellationRefund({ ...decision, requestedAt: start - 86400000 }),
    ).toEqual({ state: "decided", refundPence: 2500 }));
  it("does not treat 23:59:59 as 24 hours", () =>
    expect(
      cancellationRefund({ ...decision, requestedAt: start - 86399000 }).state,
    ).toBe("needs_review"));
  it("professional cancellation returns the remaining captured deposit", () =>
    expect(
      cancellationRefund({
        ...decision,
        cancelledBy: "professional",
        alreadyRefundedPence: 500,
      }).refundPence,
    ).toBe(2000));
  it("accepted cause still requires a chosen percentage", () =>
    expect(
      cancellationRefund({
        ...decision,
        reasonableCause: "accepted",
        decisionReason: "Exceptional circumstances accepted",
      }).state,
    ).toBe("needs_review"));
  it("applies case-by-case percentages in integer pence", () =>
    expect(
      cancellationRefund({
        ...decision,
        reasonableCause: "accepted",
        decisionReason: "Travel disruption",
        discretionaryPercent: 35,
      }).refundPence,
    ).toBe(875));
  it("does not pay an approved refund twice", () =>
    expect(
      cancellationRefund({
        ...decision,
        reasonableCause: "accepted",
        decisionReason: "Travel disruption",
        discretionaryPercent: 35,
        alreadyRefundedPence: 875,
      }).refundPence,
    ).toBe(0));
  it("rejected cause proposes no discretionary refund", () =>
    expect(
      cancellationRefund({
        ...decision,
        reasonableCause: "rejected",
        decisionReason: "Reason reviewed and not accepted",
      }).refundPence,
    ).toBe(0));
  it("requires a reason for rejection", () =>
    expect(() =>
      cancellationRefund({ ...decision, reasonableCause: "rejected" }),
    ).toThrow("REASON_REQUIRED"));
  it.each([-1, 101, NaN, 50.1])("rejects invalid percentage %s", (percent) =>
    expect(() =>
      cancellationRefund({
        ...decision,
        reasonableCause: "accepted",
        decisionReason: "Reviewed",
        discretionaryPercent: percent,
      }),
    ).toThrow("INVALID_PERCENTAGE"),
  );
  it("allows an explicitly reasoned consumer-rights override", () =>
    expect(
      cancellationRefund({
        ...decision,
        reasonableCause: "rejected",
        statutoryOverridePence: 2500,
        decisionReason: "Admin reviewed the consumer-rights claim",
      }).refundPence,
    ).toBe(2500));
  it("rejects refund beyond funds actually captured", () =>
    expect(() =>
      cancellationRefund({
        ...decision,
        statutoryOverridePence: 3000,
        decisionReason: "Reviewed",
      }),
    ).toThrow("INVALID_OVERRIDE"));
});
describe("booking integrity", () => {
  it("uses half-open intervals for back-to-back appointments", () => {
    expect(overlaps({ start: 0, end: 60 }, { start: 60, end: 120 })).toBe(
      false,
    );
    expect(overlaps({ start: 0, end: 61 }, { start: 60, end: 120 })).toBe(true);
  });
  it("rejects invalid intervals", () =>
    expect(() =>
      overlaps({ start: 0, end: NaN }, { start: 1, end: 2 }),
    ).toThrow());
  it("only the verified payment worker can confirm a pending deposit", () => {
    expect(
      canTransition("payment_pending", "confirmed", "customer", start, start),
    ).toBe(false);
    expect(
      canTransition(
        "payment_pending",
        "confirmed",
        "professional",
        start,
        start,
      ),
    ).toBe(false);
    expect(
      canTransition(
        "payment_pending",
        "confirmed",
        "payment_worker",
        start,
        start,
      ),
    ).toBe(true);
  });
  it("cannot complete appointments before they end or reopen cancelled ones", () => {
    expect(
      canTransition("confirmed", "completed", "professional", start, start - 1),
    ).toBe(false);
    expect(
      canTransition("cancelled", "confirmed", "payment_worker", start, start),
    ).toBe(false);
  });
  it("only the booking customer can review a completed, ended appointment once", () => {
    const booking = {
      status: "completed" as const,
      customerId: "alice",
      endsAt: start,
      hasReview: false,
    };
    expect(reviewEligible(booking, "alice", start)).toBe(true);
    expect(reviewEligible(booking, "bob", start)).toBe(false);
    expect(
      reviewEligible({ ...booking, hasReview: true }, "alice", start),
    ).toBe(false);
    expect(
      reviewEligible({ ...booking, status: "no_show" }, "alice", start),
    ).toBe(false);
  });
  it("snapshots keep balances and deposit separate", () => {
    const snapshot = bookingSnapshotSchema.parse({
      serviceId: "00000000-0000-4000-8000-000000000001",
      professionalId: "00000000-0000-4000-8000-000000000002",
      customerId: "00000000-0000-4000-8000-000000000003",
      serviceName: "Gel manicure",
      startsAt: "2026-10-26T12:00:00Z",
      durationMinutes: 60,
      pricePence: 4500,
      depositPence: 1500,
      currency: "GBP",
      timezone: "Europe/London",
      cancellationPolicyVersion: "2026-09-v1",
    });
    expect(balancePence(snapshot, 1500)).toBe(3000);
    expect(() => balancePence(snapshot, 5000)).toThrow("OVERPAYMENT");
  });
});
