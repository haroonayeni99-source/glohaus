import { z } from "zod";
import { isRequiredDepositWithinLimit } from "./deposit-policy";
// Money is always integer pence. These policies do not authorize payment/refund execution.
const pence = z.number().int().min(0).max(1000000);
export const bookingSnapshotSchema = z
  .object({
    serviceId: z.uuid(),
    professionalId: z.uuid(),
    customerId: z.uuid(),
    serviceName: z.string().min(2).max(100),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480).multipleOf(5),
    pricePence: pence,
    depositPence: pence,
    currency: z.literal("GBP"),
    timezone: z.literal("Europe/London"),
    cancellationPolicyVersion: z.string().min(1).max(50),
  })
  .strict()
  .refine(
    (value) =>
      isRequiredDepositWithinLimit(value.pricePence, value.depositPence),
    {
      message: "Deposit exceeds GLOHAUS's 40% maximum.",
      path: ["depositPence"],
    },
  );
export type BookingSnapshot = z.infer<typeof bookingSnapshotSchema>;
export type BookingStatus =
  | "payment_pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"
  | "expired";
export function balancePence(snapshot: BookingSnapshot, netPaidPence: number) {
  const valid = bookingSnapshotSchema.parse(snapshot);
  pence.parse(netPaidPence);
  if (netPaidPence > valid.pricePence) throw new Error("OVERPAYMENT");
  return valid.pricePence - netPaidPence;
}
export function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  if (
    ![a.start, a.end, b.start, b.end].every(Number.isFinite) ||
    a.end <= a.start ||
    b.end <= b.start
  )
    throw new Error("INVALID_INTERVAL");
  return a.start < b.end && b.start < a.end;
}
export function reviewEligible(
  booking: {
    status: BookingStatus;
    customerId: string;
    endsAt: number;
    hasReview: boolean;
  },
  customerId: string,
  now: number,
) {
  return (
    Number.isFinite(now) &&
    Number.isFinite(booking.endsAt) &&
    booking.customerId === customerId &&
    booking.status === "completed" &&
    booking.endsAt <= now &&
    !booking.hasReview
  );
}
export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: "customer" | "professional" | "payment_worker" | "expiry_worker",
  endsAt: number,
  now: number,
) {
  if (!Number.isFinite(endsAt) || !Number.isFinite(now)) return false;
  if (actor === "payment_worker")
    return from === "payment_pending" && to === "confirmed";
  if (actor === "expiry_worker")
    return from === "payment_pending" && to === "expired";
  if (actor === "customer")
    return (
      (from === "confirmed" || from === "payment_pending") && to === "cancelled"
    );
  return (
    from === "confirmed" &&
    (to === "cancelled" ||
      ((to === "completed" || to === "no_show") && now >= endsAt))
  );
}
export type CancellationDecision = {
  startsAt: number;
  requestedAt: number;
  capturedDepositPence: number;
  alreadyRefundedPence: number;
  cancelledBy: "customer" | "professional";
  reasonableCause: "pending" | "accepted" | "rejected";
  discretionaryPercent?: number;
  decisionReason?: string;
  statutoryOverridePence?: number;
};
export function cancellationRefund(input: CancellationDecision): {
  state: "needs_review" | "decided";
  refundPence: number | null;
} {
  if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.requestedAt))
    throw new Error("INVALID_TIME");
  pence.parse(input.capturedDepositPence);
  pence.parse(input.alreadyRefundedPence);
  const remaining = input.capturedDepositPence - input.alreadyRefundedPence;
  if (remaining < 0) throw new Error("INVALID_REFUND_TOTAL");
  if (input.statutoryOverridePence !== undefined) {
    pence.parse(input.statutoryOverridePence);
    if (
      !input.decisionReason?.trim() ||
      input.statutoryOverridePence > remaining
    )
      throw new Error("INVALID_OVERRIDE");
    return { state: "decided", refundPence: input.statutoryOverridePence };
  }
  if (
    input.cancelledBy === "professional" ||
    input.startsAt - input.requestedAt >= 24 * 60 * 60 * 1000
  )
    return { state: "decided", refundPence: remaining };
  if (input.reasonableCause === "pending")
    return { state: "needs_review", refundPence: null };
  if (!input.decisionReason?.trim()) throw new Error("REASON_REQUIRED");
  if (input.reasonableCause === "rejected")
    return { state: "decided", refundPence: 0 };
  const percent = input.discretionaryPercent;
  if (percent === undefined)
    return { state: "needs_review", refundPence: null };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100)
    throw new Error("INVALID_PERCENTAGE");
  // Percentage applies to original captured deposit; repeated decisions never duplicate refunds.
  const target = Math.floor((input.capturedDepositPence * percent) / 100);
  return {
    state: "decided",
    refundPence: Math.max(0, target - input.alreadyRefundedPence),
  };
}
