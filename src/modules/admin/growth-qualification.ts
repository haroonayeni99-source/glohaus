/**
 * Pure, server-side qualification rules. This module never issues money or rewards.
 * Callers must enforce authentication, consent, database idempotency and RLS.
 */
export type ReferralStatus = "attributed" | "pending" | "qualified" | "flagged" | "rejected" | "reversed";
export type BookingEvidence = {
  onPlatformPaid: boolean;
  completedAtMs?: number;
  status: "payment_pending" | "confirmed" | "cancelled" | "completed" | "no_show" | "expired";
  capturedPence: number;
  refundedPence: number;
  disputed: boolean;
  customerId: string;
  professionalOwnerUserId: string;
};
export type ReferralEvidence = {
  referrerUserId: string;
  referredUserId: string;
  registrationAtMs: number;
  claimAtMs: number;
  accountClaims: number;
  evaluatedAtMs?: number;
  holdDays?: number;
  paidBooking?: BookingEvidence;
};
export type QualificationResult = {status: ReferralStatus; reason: string};
export function qualifyReferral(e: ReferralEvidence): QualificationResult {
  if (e.referrerUserId === e.referredUserId) return {status:"rejected",reason:"SELF_REFERRAL"};
  if (e.accountClaims !== 1) return {status:"rejected",reason:"DUPLICATE_OR_MISSING_CLAIM"};
  if (!Number.isFinite(e.claimAtMs) || !Number.isFinite(e.registrationAtMs) ||
      e.claimAtMs < e.registrationAtMs || e.claimAtMs > e.registrationAtMs + 24*60*60*1000)
    return {status:"rejected",reason:"CLAIM_WINDOW_EXPIRED"};
  if (!e.paidBooking) return {status:"pending",reason:"NO_ELIGIBLE_BOOKING"};
  const b=e.paidBooking;
  if (b.customerId !== e.referredUserId || b.professionalOwnerUserId === e.referredUserId)
    return {status:"flagged",reason:"BOOKING_OWNERSHIP_CONFLICT"};
  if (b.disputed) return {status:"flagged",reason:"PAYMENT_DISPUTED"};
  if (b.status === "cancelled" || b.status === "no_show" || b.status === "expired")
    return {status:"rejected",reason:"BOOKING_NOT_COMPLETED"};
  if (b.status !== "completed") return {status:"pending",reason:"BOOKING_NOT_COMPLETED"};
  if (!Number.isSafeInteger(b.capturedPence) || !Number.isSafeInteger(b.refundedPence) ||
      b.capturedPence <= 0 || b.refundedPence < 0 || b.refundedPence > b.capturedPence)
    return {status:"flagged",reason:"INVALID_PAYMENT_EVIDENCE"};
  if (!b.onPlatformPaid) return {status:"pending",reason:"ON_PLATFORM_PAYMENT_REQUIRED"};
  if (b.refundedPence > 0) return {status:"rejected",reason:"REFUNDED"};
  const holdDays=e.holdDays??14;
  if (!Number.isSafeInteger(holdDays) || holdDays<0 || holdDays>365 ||
      !Number.isFinite(e.evaluatedAtMs) || !Number.isFinite(b.completedAtMs))
    return {status:"pending",reason:"MISSING_HOLD_EVIDENCE"};
  if (e.evaluatedAtMs! < b.completedAtMs! + holdDays*86400000)
    return {status:"pending",reason:"REFUND_WINDOW_OPEN"};
  return {status:"qualified",reason:"COMPLETED_PAID_BOOKING"};
}
/** Attribution is deliberately limited to consented authenticated first-party interactions. */
export function eligibleViewToBooking(args:{
  optedIn:boolean; viewerUserId:string|null; bookingCustomerUserId:string;
  viewedProfessionalId:string; bookedProfessionalId:string;
  viewedAtMs:number; bookedAtMs:number; viewerOwnsProfessional:boolean;
  attributionWindowDays?:number;
}):boolean {
  const days=args.attributionWindowDays??7;
  return args.optedIn && !!args.viewerUserId &&
    args.viewerUserId===args.bookingCustomerUserId &&
    args.viewedProfessionalId===args.bookedProfessionalId &&
    !args.viewerOwnsProfessional && Number.isFinite(days) && days>0 && days<=30 &&
    Number.isFinite(args.bookedAtMs) && Number.isFinite(args.viewedAtMs) &&
    args.viewedAtMs<=args.bookedAtMs &&
    args.bookedAtMs-args.viewedAtMs<=days*86400000;
}
/** Indicators need a review, never automatically classify a human as fraudulent. */
export function referralReviewSignals(args:{
  claimsInHour:number; accountsOnSameVerifiedPaymentMethod:number;
  overlappingDeviceSignal:boolean; confirmedSelfReferral:boolean;
}):string[] {
  const flags:string[]=[];
  if(args.confirmedSelfReferral) flags.push("CONFIRMED_SELF_REFERRAL");
  if(args.claimsInHour>=10) flags.push("UNUSUAL_CLAIM_VELOCITY");
  if(args.accountsOnSameVerifiedPaymentMethod>=2) flags.push("REPEATED_PAYMENT_METHOD");
  if(args.overlappingDeviceSignal) flags.push("OVERLAPPING_DEVICE_REVIEW");
  return flags;
}
/** Monetary or physical gifts are never triggered by the above qualification. */
export const AUTOMATIC_REFERRAL_REWARDS_ENABLED = false as const;
