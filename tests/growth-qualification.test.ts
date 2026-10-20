import {describe,it,expect} from "vitest";
import {qualifyReferral,eligibleViewToBooking,referralReviewSignals,AUTOMATIC_REFERRAL_REWARDS_ENABLED} from "@/modules/admin/growth-qualification";
const now=Date.parse("2026-10-20T12:00:00Z");
const base={referrerUserId:"a",referredUserId:"b",registrationAtMs:now,claimAtMs:now+1000,accountClaims:1};
const booking={status:"completed" as const,capturedPence:5000,refundedPence:0,disputed:false,customerId:"b",professionalOwnerUserId:"c"};
describe("referral qualification — no money movement",()=>{
 it("requires genuine paid completed booking",()=>expect(qualifyReferral({...base,paidBooking:booking}).status).toBe("qualified"));
 it("does not reward registration alone",()=>expect(qualifyReferral(base).status).toBe("pending"));
 it("rejects self referral and duplicate",()=>{expect(qualifyReferral({...base,referrerUserId:"b"}).status).toBe("rejected");expect(qualifyReferral({...base,accountClaims:2}).status).toBe("rejected")});
 it("honours 24-hour claim boundary",()=>{expect(qualifyReferral({...base,claimAtMs:now+86400001}).status).toBe("rejected");expect(qualifyReferral({...base,claimAtMs:now+86400000,paidBooking:booking}).status).toBe("qualified")});
 it("never qualifies unpaid or no-show bookings",()=>{expect(qualifyReferral({...base,paidBooking:{...booking,status:"payment_pending"}}).status).toBe("pending");expect(qualifyReferral({...base,paidBooking:{...booking,status:"no_show"}}).status).toBe("rejected")});
 it("flags disputes and invalid payment",()=>{expect(qualifyReferral({...base,paidBooking:{...booking,disputed:true}}).status).toBe("flagged");expect(qualifyReferral({...base,paidBooking:{...booking,refundedPence:9999}}).status).toBe("flagged")});
 it("rejects full refund and suspicious booking ownership",()=>{expect(qualifyReferral({...base,paidBooking:{...booking,refundedPence:5000}}).status).toBe("rejected");expect(qualifyReferral({...base,paidBooking:{...booking,customerId:"not-b"}}).status).toBe("flagged")});
 it("never enables automatic rewards",()=>expect(AUTOMATIC_REFERRAL_REWARDS_ENABLED).toBe(false));
});
describe("consented attribution and review signals",()=>{
 const visit={optedIn:true,viewerUserId:"b",bookingCustomerUserId:"b",viewedProfessionalId:"pro",bookedProfessionalId:"pro",viewedAtMs:now,bookedAtMs:now+1000,viewerOwnsProfessional:false};
 it("only attributes same customer and same professional with consent",()=>{expect(eligibleViewToBooking(visit)).toBe(true);expect(eligibleViewToBooking({...visit,optedIn:false})).toBe(false);expect(eligibleViewToBooking({...visit,bookedProfessionalId:"other"})).toBe(false);expect(eligibleViewToBooking({...visit,viewerUserId:null})).toBe(false)});
 it("rejects expired, future and self visits",()=>{expect(eligibleViewToBooking({...visit,bookedAtMs:now+8*86400000})).toBe(false);expect(eligibleViewToBooking({...visit,bookedAtMs:now-1000})).toBe(false);expect(eligibleViewToBooking({...visit,viewerOwnsProfessional:true})).toBe(false)});
 it("raises review signals without adjudicating guilt",()=>expect(referralReviewSignals({claimsInHour:12,accountsOnSameVerifiedPaymentMethod:1,overlappingDeviceSignal:true,confirmedSelfReferral:false})).toEqual(["UNUSUAL_CLAIM_VELOCITY","OVERLAPPING_DEVICE_REVIEW"]));
});
