// Fictional, isolated accounts. This module is used only by the audit harness.
import { defaultLabels } from "@/modules/platform/domain";
import type { AdminOverview } from "@/modules/admin/repository";
export const ids = { user: "11111111-1111-4111-8111-111111111111", pro: "22222222-2222-4222-8222-222222222222", customer: "33333333-3333-4333-8333-333333333333" };
const date = "2026-10-10T12:00:00Z";
export const overview: AdminOverview = {
  counts: { users: 2, active: 2, suspended: 0 }, professionals: 1,
  users: [
    { id: ids.user, display_name: "Maya Studio", email: "maya@example.test", status: "active", roles: ["professional"], restricted_until: null, restriction_reason: null, deleted_at: null },
    { id: ids.customer, display_name: "Alex Customer", email: "alex@example.test", status: "active", roles: ["customer"], restricted_until: null, restriction_reason: null, deleted_at: null },
  ],
  professionalTrust: [{ id: ids.pro, user_id: ids.user, business_name: "Maya Studio", verification_status: "verified", standing_status: "good", live_restricted_until: null }],
  bookings: [{ id: ids.pro, service_name: "Nail set", customer_name: "Alex Customer", professional_name: "Maya Studio", starts_at: date, status: "confirmed", price_pence: 4500 }],
  posts: [{ id: ids.pro, title: "New nail design", body: "Our latest work", moderation_status: "visible", business_name: "Maya Studio" }],
  reviews: [{ id: ids.pro, rating: 5, body: "Lovely service", public_name: "Alex", moderation_status: "visible" }],
  appeals: [{ id: ids.pro, service_name: "Nail set", customer_name: "Alex", professional_name: "Maya", reason: "Appointment support request", status: "open", created_at: date }],
  bookingDisputes: [{ id: ids.user, booking_id: ids.pro, status: "needs_response", reason: "product_unacceptable", amount_pence: 4500, reserved_pending_pence: 4500, reserved_available_pence: 0, reserve_shortfall_pence: 0, evidence_due_at: date, response_statement: "Fictional response for the UI audit", response_submitted_at: date, response_updated_at: date, updated_at: date }],
  safety: { counts: { open: 1, underReview: 0, resolved: 0, dismissed: 0 }, reports: [{ id: ids.pro, target_type: "post", target_id: ids.pro, category: "spam", description: "Duplicate content", status: "open", created_at: date, updated_at: date, reporter_name: "Alex" }] },
  shopOrders: { counts: { total: 0, paid: 0, processing: 0, shipped: 0, delivered: 0, refundPending: 0, refunded: 0, awaitingShipmentOver24h: 0 }, orders: [] },
};
function fail(name: string) { if (new URLSearchParams(location.search).get("fail") === name || new URLSearchParams(location.search).get("fail") === "all") throw new Error("Simulated loading failure"); }
export async function adminOverview() {
  if (new URLSearchParams(location.search).get("fail") === "all") return { ...overview, safety: null, shopOrders: null, professionalTrust: [], bookingDisputes: [], unavailableSections: ["safety", "shopOrders", "professionalTrust", "bookingDisputes"] };
  return overview;
}
export async function publicLabels() { return defaultLabels; }
export async function adminCategories() { fail("categories"); return [{ id: ids.pro, name: "Nails", slug: "nails", active: true, sort_order: 1 }]; }
export async function ownerControls() { fail("owner"); return { staff: [{ id: ids.user, display_name: "Example Admin", email: "admin@example.test", status: "active", created_at: date, roles: ["admin"], permissions: [] }], audit: [{ id: ids.pro, action: "profile_updated", actor_role: "owner", reason: "Updated public information", created_at: date }] }; }
export async function ownerProductFeeRule() { fail("product-fee"); return { id: ids.pro, percentageBasisPoints: 1000, fixedFeePence: 0, minimumFeePence: 0, maximumFeePence: null, minimumTransactionPence: 1, processingCostPayer: "platform", effectiveFrom: date }; }
export async function ownerBookingFeeRule() { fail("booking-fee"); return { id: null, fixedFeePence: 100, effectiveFrom: null, usingDefault: true }; }
export async function adminFinanceOverview() { fail("finance"); return { metrics: Object.fromEntries(["platformRevenuePence","platformRevenue30dPence","bookingCapturedPence","bookingRefundedPence","activePaidSubscriptions","activeSubscriptionMrrPence","professionalPendingPence","professionalAvailablePence","professionalOutstandingPence","payoutRequestedPence","payoutPaidPence","instantWithdrawalFeesPence"].map(key => [key, 0])), payoutCounts: { requested: 0, processing: 0, paid: 0, failed: 0, cancelled: 0 }, revenueBySource30d: [], recentPayouts: [] }; }
export async function paymentLaunchReadiness() { fail("payment"); return { ready: true, checks: [{ key: "database", label: "Payment database", ready: true, required: true }] }; }
export function emailLaunchReadiness() { return { transactionalReady: true, authSecurityReady: true, checks: [{ key: "email", label: "Email service", ready: true, required: true, group: "transactional" }] }; }
export async function ownerEmailDeliveryOverview() { fail("email"); return { queued: 0, accepted: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, suppressed: 0, lastProviderEventAt: null }; }
export async function ownerAuthAccountOverview() { fail("auth"); return [{ authId: ids.customer, email: "alex@example.test", createdAt: date, emailConfirmedAt: date, lastSignInAt: date, appUserId: ids.customer, appStatus: "active", roles: ["customer"] }]; }
export async function ownerProfessionalCommissionOverview() { fail("commission"); return [{ professionalId: ids.pro, businessName: "Maya Studio", email: "maya@example.test", planKey: "starter", defaultBasisPoints: 800, effectiveBasisPoints: 800, overrideBasisPoints: null, overrideReason: null, overrideUntil: null, overrideUpdatedAt: null }]; }
export async function ownerProfessionalReferralOverview() { fail("referrals"); return []; }
export async function ownerPublicSiteStatus() { fail("site"); return true; }
export async function ownerHomepageMedia() { fail("homepage"); return { desktopHero: null, mobileHero: null }; }
export async function ownerMarketingOverview() { fail("marketing"); return { optedInUsers: 0, queue: { pending: 0, retrying: 0, exhausted: 0 }, campaigns: [] }; }
export async function ownerBackendHealth() { fail("backend"); return { jobs: { maintenance: { lastSuccessAt: date, lastFailureAt: null, failures24h: 0 }, notifications: { lastSuccessAt: date, lastFailureAt: null, failures24h: 0 } }, queues: { bookingEmailPending: 0, bookingEmailExhausted: 0, productEmailPending: 0, productEmailExhausted: 0, marketingPending: 0, marketingExhausted: 0 }, integrity: { unbalancedLedgerTransactions: 0, negativeProfessionalAvailableBalances: 0, bookingsMissingQuote: 0, paidOrdersMissingPaymentLedger: 0, bookingRefundAmountMismatches: 0, bookingTransfersMissingProviderId: 0, productTransfersMissingProviderId: 0, payoutAmountMismatches: 0, openDisputeReserveMismatches: 0 } }; }
export async function pageAccount() { return { account: { id: ids.user, authId: "fictional", displayName: "Test Owner", email: "owner@example.test", status: "active", roles: [new URLSearchParams(location.search).get("role") === "admin" ? "admin" : "owner"], professionalId: null } }; }
export function createClient() { return { auth: { signOut: async () => undefined } }; }
