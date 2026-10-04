import { AdminLabelEditor } from "@/components/admin-label-editor";
import { AdminCategoryManager } from "@/components/admin-category-manager";
import { publicLabels } from "@/modules/platform/repository";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { AdminManager } from "@/components/admin-manager";
import { AdminFinancePanel } from "@/components/admin-finance-panel";
import { AdminNavigation } from "@/components/admin-navigation";
import { ShopFeeControl } from "@/components/shop-fee-control";
import { BookingFeeControl } from "@/components/booking-fee-control";
import { OwnerControls } from "@/components/owner-controls";
import { OwnerAuthAccounts } from "@/components/owner-auth-accounts";
import { ProfessionalCommissionControl } from "@/components/professional-commission-control";
import { OwnerReferralOverview } from "@/components/owner-referral-overview";
import { OwnerDashboardOverview } from "@/components/owner-dashboard-overview";
import { adminCategories, adminFinanceOverview, adminOverview, emailLaunchReadiness, ownerAuthAccountOverview, ownerBookingFeeRule, ownerControls, ownerEmailDeliveryOverview, ownerProductFeeRule, ownerProfessionalCommissionOverview, ownerProfessionalReferralOverview, paymentLaunchReadiness } from "@/modules/admin/repository";
export const dynamic = "force-dynamic";
export const metadata = { title: "Administration" };
export default async function Page() {
  const result = await pageAccount("admin");
  if (!result.account)
    return (
      <AuthFrame>
        <AccessMessage code={result.error ?? undefined} />
      </AuthFrame>
    );
  const isOwner = result.account.roles.includes("owner");
  // The serverless runtime intentionally has a one-connection pool. Avoid
  // starting a dozen transactions at once and timing out while they queue.
  const data = await adminOverview();
  const labels = await publicLabels();
  const categories = await adminCategories().catch(() => []);
  const owner = isOwner ? await ownerControls().catch(() => null) : null;
  const productFee = isOwner ? await ownerProductFeeRule().catch(() => null) : null;
  const bookingFee = isOwner ? await ownerBookingFeeRule().catch(() => null) : null;
  const finance = await adminFinanceOverview().catch(() => null);
  const paymentReadiness = isOwner ? await paymentLaunchReadiness().catch(() => null) : null;
  const emailDelivery = isOwner ? await ownerEmailDeliveryOverview().catch(() => null) : null;
  const authAccounts = isOwner ? await ownerAuthAccountOverview().catch(() => []) : [];
  const commissions = isOwner ? await ownerProfessionalCommissionOverview().catch(() => []) : [];
  const referrals = isOwner ? await ownerProfessionalReferralOverview().catch(() => []) : [];
  const emailReadiness = isOwner ? emailLaunchReadiness() : null;
  return (
    <main id="main" className="admin-workspace">
        <AdminNavigation account={result.account} />
        <div className="admin-workspace-content">
          <OwnerDashboardOverview
            account={result.account}
            data={data}
            finance={finance}
            bookingFee={bookingFee}
            authAccounts={authAccounts}
            commissions={commissions}
            referrals={referrals}
            owner={owner}
          />
          <section id="settings" className="admin-workspace-section admin-detail-card">
            <p className="eyebrow">PLATFORM LANGUAGE</p>
            <h2>Platform labels</h2>
            <p className="lead">Set the professional title and the category language that customers see across GLOHAUS.</p>
            <AdminLabelEditor initial={labels} />
          </section>
          <section id="categories" className="admin-workspace-section admin-detail-card">
            <p className="eyebrow">DISCOVERY & SERVICES</p>
            <h2>Categories</h2>
            <p className="lead">Add new beauty categories, rename them, control their order, or hide them without deleting existing data.</p>
            <AdminCategoryManager initial={categories} />
          </section>
          {isOwner && bookingFee && (
            <section id="booking-fee" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">CUSTOMER BOOKING FEE</p>
              <h2>Booking fee control</h2>
              <p className="lead">
                Change the customer-facing booking fee used by new service bookings. Existing paid bookings keep the fee recorded when they checked out, and every Owner change is added to the financial audit log.
              </p>
              <BookingFeeControl initial={bookingFee} />
            </section>
          )}
          {owner && (
            <section id="shop-fees" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">MARKETPLACE MONEY</p>
              <h2>Shop commission</h2>
              <p className="lead">
                Set the professional-paid commission used by new Shop checkouts.
                Each paid order keeps an immutable snapshot of the rule used at purchase.
              </p>
              <ShopFeeControl initial={productFee} />
            </section>
          )}
          {isOwner && (
            <section id="auth-accounts" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">AUTH & ACCOUNT PROVISIONING</p>
              <h2>All sign-ups and sign-ins</h2>
              <p className="lead">
                Supabase Auth users are shown here even if GLOHAUS account provisioning has not completed yet.
                This lets the Owner see email-confirmation, app-account linkage, roles and last successful sign-in in one place.
              </p>
              <OwnerAuthAccounts accounts={authAccounts} />
            </section>
          )}
          {isOwner && (
            <section id="professional-commission" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">PROFESSIONAL COMMISSION</p>
              <h2>Individual service commission rates</h2>
              <p className="lead">
                The normal plan commission remains the default. Use an audited custom rate only when a specific professional needs a commercial rate, such as a high-volume agreement. New booking quotes use the effective rate; existing paid bookings keep their original snapshot.
              </p>
              <ProfessionalCommissionControl professionals={commissions} />
            </section>
          )}
          {isOwner && (
            <section id="referrals" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">PROFESSIONAL REFERRALS</p>
              <h2>Referral leaderboard</h2>
              <p className="lead">
                View every professional referral code and the completed GLOHAUS accounts attributed to it. Raw link clicks do not count toward these totals.
              </p>
              <OwnerReferralOverview rows={referrals} />
            </section>
          )}
          {owner && (
            <section id="staff" className="admin-workspace-section admin-detail-card">
              <h2>Staff & admins</h2>
              <p className="lead">Only the owner can delegate or remove privileged access. Owner access cannot be granted here.</p>
              <OwnerControls data={owner} users={data.users} />
            </section>
          )}
          {isOwner && paymentReadiness && (
            <section id="payment-readiness" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">LAUNCH READINESS</p>
              <h2>Booking → payment → payout</h2>
              <p className="lead">
                {paymentReadiness.ready
                  ? "All required server, Stripe and database boundaries for the core booking money flow are present."
                  : "One or more required payment boundaries still need configuration before real customer money should be accepted."}
              </p>
              <div className="service-edit-list">
                {paymentReadiness.checks.map((check) => (
                  <article className="service-edit-row" key={check.key}>
                    <div>
                      <h3>{check.label}</h3>
                      <p>
                        {check.ready ? "Ready" : check.required ? "Needs setup" : "Optional / not configured"}
                      </p>
                    </div>
                    <span className={`admin-status ${check.ready ? "admin-status-active" : "admin-status-suspended"}`}>
                      {check.ready ? "READY" : check.required ? "BLOCKED" : "OPTIONAL"}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {isOwner && emailReadiness && (
            <section id="email-readiness" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">EMAIL & AUTH READINESS</p>
              <h2>Password reset → booking emails → notifications</h2>
              <p className="lead">
                {emailReadiness.ready
                  ? "Required email delivery and authentication safeguards are marked ready for production."
                  : "Email delivery still needs configuration before GLOHAUS should rely on password-reset and booking emails in production."}
              </p>
              <div className="service-edit-list">
                {emailReadiness.checks.map((check) => (
                  <article className="service-edit-row" key={check.key}>
                    <div>
                      <h3>{check.label}</h3>
                      <p>{check.ready ? "Ready" : check.required ? "Needs setup" : "Recommended before public launch"}</p>
                    </div>
                    <span className={`admin-status ${check.ready ? "admin-status-active" : "admin-status-suspended"}`}>
                      {check.ready ? "READY" : check.required ? "BLOCKED" : "RECOMMENDED"}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {isOwner && emailDelivery && (
            <section id="email-delivery-health" className="admin-workspace-section admin-detail-card">
              <p className="eyebrow">TRANSACTIONAL EMAIL HEALTH</p>
              <h2>Delivery outcomes</h2>
              <p className="lead">
                Provider-confirmed delivery totals only. Recipient addresses and raw webhook payloads are not exposed here.
              </p>
              <div className="service-edit-list">
                {[
                  ["Queued", emailDelivery.queued],
                  ["Accepted by provider", emailDelivery.accepted],
                  ["Delivered", emailDelivery.delivered],
                  ["Bounced", emailDelivery.bounced],
                  ["Complained", emailDelivery.complained],
                  ["Failed", emailDelivery.failed],
                  ["Suppressed recipients", emailDelivery.suppressed],
                ].map(([label, value]) => (
                  <article className="service-edit-row" key={String(label)}>
                    <div><h3>{label}</h3></div>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
              <p className="lead">
                {emailDelivery.lastProviderEventAt
                  ? `Last provider event: ${new Date(emailDelivery.lastProviderEventAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
                  : "No provider delivery event has been recorded yet."}
              </p>
            </section>
          )}
          <AdminFinancePanel data={finance} />
          <AdminManager data={data} owner={isOwner} />
          {owner && (
            <section id="audit" className="admin-workspace-section admin-detail-card">
              <h2>Owner audit log</h2>
              <div className="service-edit-list">
                {owner.audit.map((entry) => (
                  <article className="service-edit-row" key={entry.id}>
                    <div>
                      <h3>{entry.action}</h3>
                      <p>{entry.actor_role || "operator"} · {new Date(entry.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>
                      <small>{entry.reason}</small>
                    </div>
                  </article>
                ))}
                {!owner.audit.length && <p className="lead">No owner audit events yet.</p>}
              </div>
            </section>
          )}
        </div>
    </main>
  );
}
