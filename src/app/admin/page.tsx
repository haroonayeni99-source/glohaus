import { FoundingProgrammeControls } from "@/components/founding-programme-controls";
import type { ProgrammeOverview } from "@/modules/commission/programme";
import { AdminArrival, type ArrivalOverview } from "@/components/admin-arrival";
import { AdminCategoryManager } from "@/components/admin-category-manager";
import { productCategories } from "@/modules/shop/repository";
import { adminPushDeliveryOverview } from "@/modules/admin/repository";
import { AdminProfessionalActivity } from "@/components/admin-professional-activity";
import { activityOverview } from "@/modules/professional-activity/repository";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
import { AdminProfessionalPolicies } from "@/components/admin-professional-policies";
import { adminPolicies } from "@/modules/policies/repository";
import { supportInbox } from "@/modules/support/repository";
import { withAdmin } from "@/modules/admin/repository";
import { HomepageCategoryMediaControl } from "@/components/homepage-category-media-control";
import {
  AdminWorkspaceView,
  AdminSection,
} from "@/components/admin-workspace-view";
import { AdminSectionUnavailable } from "@/components/admin-section-unavailable";
import { AdminLabelEditor } from "@/components/admin-label-editor";
import {
  AdminTaxonomyManager,
  type TaxonomyOverview,
} from "@/components/admin-taxonomy-manager";
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
import { CommissionControlCentre } from "@/components/commission-control-centre";
import { commissionOverview } from "@/modules/commission/repository";
import { withOwner } from "@/modules/admin/repository";
import { OwnerReferralOverview } from "@/components/owner-referral-overview";
import { OwnerDashboardOverview } from "@/components/owner-dashboard-overview";
import { WebsiteStatusControl } from "@/components/website-status-control";
import { OwnerExampleProfiles } from "@/components/owner-example-profiles";
import "@/components/profile-examples.css";
import { readExampleVisibility } from "@/modules/professionals/example-visibility-repository";
import { profileExamples } from "@/modules/professionals/examples";
import { HomepageMediaControl } from "@/components/homepage-media-control";
import { OwnerMarketingPanel } from "@/components/owner-marketing-panel";
import { OwnerBackendHealthPanel } from "@/components/owner-backend-health-panel";
import {
  adminFinanceOverview,
  adminOverview,
  emailLaunchReadiness,
  ownerAuthAccountOverview,
  ownerBookingFeeRule,
  ownerControls,
  ownerEmailDeliveryOverview,
  ownerProductFeeRule,
  ownerProfessionalCommissionOverview,
  ownerProfessionalReferralOverview,
  ownerPublicSiteStatus,
  ownerHomepageMedia,
  ownerMarketingOverview,
  ownerBackendHealth,
  paymentLaunchReadiness,
} from "@/modules/admin/repository";
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
  const programme = isOwner ? await withOwner(async db => (await db.query<{data:ProgrammeOverview}>("SELECT beauty.owner_programme_overview() AS data")).rows[0]?.data ?? null).catch(() => null) : null;
  const support = await withAdmin(supportInbox).catch(() => null);
  const policies = await withAdmin((db) => adminPolicies(db)).catch(() => null);
  const activity = await withAdmin((db) => activityOverview(db)).catch(
    () => null,
  );
  const arrivals = await withAdmin(async db => (await db.query<{data:ArrivalOverview}>("SELECT beauty.admin_arrival_overview(NULL) AS data")).rows[0].data).catch(() => null);
  const labels = await publicLabels();
  const shopCategories = await withAdmin((db) =>
    productCategories(db, true),
  ).catch(() => null);
  const categories = await withAdmin(
    async (db) =>
      (
        await db.query<{ data: TaxonomyOverview }>(
          "SELECT beauty.admin_taxonomy_overview() AS data",
        )
      ).rows[0].data,
  ).catch(() => null);
  const owner = isOwner ? await ownerControls().catch(() => null) : null;
  const productFee = isOwner
    ? await ownerProductFeeRule().catch(() => undefined)
    : null;
  const bookingFee = isOwner
    ? await ownerBookingFeeRule().catch(() => null)
    : null;
  const finance = await adminFinanceOverview().catch(() => null);
  const paymentReadiness = isOwner
    ? await paymentLaunchReadiness().catch(() => null)
    : null;
  const emailDelivery = isOwner
    ? await ownerEmailDeliveryOverview().catch(() => null)
    : null;
  const pushDelivery = await adminPushDeliveryOverview().catch(() => null);
  const authAccounts = isOwner
    ? await ownerAuthAccountOverview().catch(() => null)
    : [];
  const commissions = isOwner
    ? await ownerProfessionalCommissionOverview().catch(() => null)
    : [];
  const commissionCentre = isOwner
    ? await withOwner(commissionOverview).catch(() => null)
    : null;
  const referrals = isOwner
    ? await ownerProfessionalReferralOverview().catch(() => null)
    : [];
  const emailReadiness = isOwner ? emailLaunchReadiness() : null;
  const publicSiteEnabled = isOwner
    ? await ownerPublicSiteStatus().catch(() => null)
    : true;
  const exampleVisibility = isOwner ? await withOwner(readExampleVisibility).catch(() => null) : null;
  const homepageMedia = isOwner
    ? await ownerHomepageMedia().catch(() => null)
    : null;
  const marketing = isOwner
    ? await ownerMarketingOverview().catch(() => null)
    : null;
  const backendHealth = isOwner
    ? await ownerBackendHealth().catch(() => null)
    : null;
  return (
    <main id="main" className="admin-workspace">
      <AdminNavigation account={result.account} />
      <AdminWorkspaceView>
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
        <section id="arrival-management" className="admin-workspace-section admin-detail-card"><h2>Arrival & customer communications</h2>{arrivals ? <AdminArrival initial={arrivals} owner={isOwner}/> : <p role="alert">Arrival management could not be loaded. Reload to try again.</p>}</section>
        <section
          id="professional-policies"
          className="admin-workspace-section admin-detail-card"
        >
          <p className="eyebrow">PROFESSIONAL BOOKING TERMS</p>
          <h2>Professional Policies</h2>
          {policies ? (
            <AdminProfessionalPolicies initial={policies} />
          ) : (
            <AdminSectionUnavailable label="Professional Policies" />
          )}
        </section>
        <section
          id="professional-activity"
          className="admin-workspace-section admin-detail-card"
        >
          <p className="eyebrow">PROFESSIONAL PARTICIPATION</p>
          <h2>Inactive Professionals</h2>
          {activity ? (
            <AdminProfessionalActivity initial={activity} owner={isOwner} />
          ) : (
            <AdminSectionUnavailable label="Professional activity" />
          )}
        </section>
        {isOwner && (
          <section
            id="website-status"
            className="admin-workspace-section admin-detail-card owner-website-status-section"
          >
            {publicSiteEnabled === null ? (
              <AdminSectionUnavailable label="Website status" />
            ) : (
              <WebsiteStatusControl initialEnabled={publicSiteEnabled} />
            )}
          </section>
        )}
        {isOwner && <section id="profile-examples" className="admin-workspace-section admin-detail-card">
          <p className="eyebrow">EXAMPLE CONTENT</p><h2>Example profiles</h2>
          {exampleVisibility ? <OwnerExampleProfiles initial={exampleVisibility} profiles={profileExamples.map(({ slug, name, category }) => ({ slug, name, category }))} /> : <AdminSectionUnavailable label="Example profile controls" />}
        </section>}
        {isOwner && marketing && (
          <section
            id="marketing"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">MARKETING & FEEDBACK</p>
            <h2>Preset campaigns and private feature votes</h2>
            <p className="lead">
              Launch optional marketing only to users who selected the matching
              preference. Transactional booking, order and security emails stay
              separate.
            </p>
            <OwnerMarketingPanel initial={marketing} />
          </section>
        )}
        {isOwner && homepageMedia && (
          <section
            id="homepage-media"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">HOMEPAGE CONTENT</p>
            <h2>Homepage images and categories</h2>
            <p className="lead">
              Change the homepage photos and category names without changing
              code. Desktop and mobile can use different names and images.
            </p>
            <HomepageMediaControl initial={homepageMedia} />
            <HomepageCategoryMediaControl
              initial={homepageMedia.categoryImages}
              initialNames={homepageMedia.categoryNames}
              initialMetadata={homepageMedia.categoryMetadata}
              taxonomy={categories ?? undefined}
            />
          </section>
        )}

        <section
          id="settings"
          className="admin-workspace-section admin-detail-card"
        >
          <p className="eyebrow">PLATFORM LANGUAGE</p>
          <h2>Platform labels</h2>
          <p className="lead">
            Set the professional title and the category language that customers
            see across GLOHAUS.
          </p>
          <AdminLabelEditor initial={labels} />
        </section>
        <section
          id="categories"
          className="admin-workspace-section admin-detail-card"
        >
          <p className="eyebrow">DISCOVERY & SERVICES</p>
          <h2>Categories</h2>
          <p className="lead">
            Add new beauty categories, rename them, control their order, or hide
            them without deleting existing data.
          </p>
          {categories ? (
            <AdminTaxonomyManager data={categories} />
          ) : (
            <AdminSectionUnavailable label="Categories" />
          )}
        </section>
        <section
          id="product-categories"
          className="admin-workspace-section admin-detail-card"
        >
          <p className="eyebrow">MARKETPLACE CATALOGUE</p>
          <h2>Product categories</h2>
          <p>
            Add, edit or remove categories from Shop browsing. Hide removes a
            category from browsing and new product choices, while retaining
            products and order history. Names are shared with the service
            catalogue; visibility and order are independent.
          </p>
          {shopCategories ? (
            <AdminCategoryManager initial={shopCategories} productMode />
          ) : (
            <AdminSectionUnavailable label="Product categories" />
          )}
        </section>
        {isOwner && bookingFee && (
          <section
            id="booking-fee"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">CUSTOMER BOOKING FEE</p>
            <h2>Booking fee control</h2>
            <p className="admin-action-warning">
              Financial setting · affects future booking quotes
            </p>
            <p className="lead">
              Change the customer-facing booking fee used by new service
              bookings. Existing paid bookings keep the fee recorded when they
              checked out, and every Owner change is added to the financial
              audit log.
            </p>
            <BookingFeeControl initial={bookingFee} />
          </section>
        )}
        {owner && (
          <section
            id="shop-fees"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">MARKETPLACE MONEY</p>
            <h2>Shop commission</h2>
            <p className="admin-action-warning">
              Financial setting · affects future Shop checkouts
            </p>
            <p className="lead">
              Set the professional-paid commission used by new Shop checkouts.
              Each paid order keeps the commission rate that applied when it was
              purchased.
            </p>
            {productFee === undefined ? (
              <AdminSectionUnavailable label="Shop fees" />
            ) : (
              <ShopFeeControl initial={productFee} />
            )}
          </section>
        )}
        {isOwner && (
          <section
            id="auth-accounts"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">SIGN-UPS & SIGN-INS</p>
            <h2>All sign-ups and sign-ins</h2>
            <p className="lead">
              See every sign-up, including accounts whose GLOHAUS setup is not
              complete. Check their email confirmation, account status, roles
              and most recent successful sign-in.
            </p>
            {authAccounts ? (
              <OwnerAuthAccounts accounts={authAccounts} />
            ) : (
              <AdminSectionUnavailable label="Sign-ups and sign-ins" />
            )}
          </section>
        )}
        {isOwner && (
          <section
            id="professional-commission"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">PROFESSIONAL COMMISSION</p>
            <h2>Commission Control Centre</h2>
            <p className="admin-action-warning">
              Financial setting · affects future quotes for the selected
              professional
            </p>
            <p className="lead">
              Manage scheduled service commission, founding rewards and
              read-only financial simulations. Every live change requires Owner
              confirmation.
            </p>
            <FoundingProgrammeControls data={programme} />
            {commissionCentre ? (
              <CommissionControlCentre data={commissionCentre} />
            ) : (
              <AdminSectionUnavailable label="Commission Control Centre" />
            )}
          </section>
        )}
        {isOwner && (
          <section
            id="referrals"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">PROFESSIONAL REFERRALS</p>
            <h2>Referral leaderboard</h2>
            <p><a href="/admin/growth">Open Growth &amp; Performance Centre →</a></p>
            <p className="lead">
              View every professional referral code and the completed GLOHAUS
              accounts attributed to it. Raw link clicks do not count toward
              these totals.
            </p>
            {referrals ? (
              <OwnerReferralOverview rows={referrals} />
            ) : (
              <AdminSectionUnavailable label="Referrals" />
            )}
          </section>
        )}
        {owner && (
          <section
            id="staff"
            className="admin-workspace-section admin-detail-card"
          >
            <h2>Staff & admins</h2>
            <p className="admin-action-warning">
              Privileged access · review the user and role before confirming
            </p>
            <p className="lead">
              Only the owner can add or remove staff permissions. You cannot
              grant owner access here.
            </p>
            <OwnerControls data={owner} users={data.users} />
          </section>
        )}
        {isOwner && backendHealth && (
          <section
            id="backend-health"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">SYSTEM HEALTH</p>
            <h2>Background tasks, emails and payments</h2>
            <p className="lead">
              Check whether scheduled tasks, automated emails and payment setup
              are working. These checks do not change settings or move money.
            </p>
            <OwnerBackendHealthPanel
              health={backendHealth}
              payment={paymentReadiness}
            />
          </section>
        )}
        {isOwner && paymentReadiness && (
          <section
            id="payment-readiness"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">LAUNCH READINESS</p>
            <h2>Booking → payment → payout</h2>
            <p className="lead">
              {paymentReadiness.ready
                ? "All required setup checks for booking payments and payouts are passing."
                : "Required payment setup is incomplete. Resolve the checks below before accepting real customer payments."}
            </p>
            <div className="service-edit-list">
              {paymentReadiness.checks.map((check) => (
                <article className="service-edit-row" key={check.key}>
                  <div>
                    <h3>{check.label}</h3>
                    <p>
                      {check.ready
                        ? "Ready"
                        : check.required
                          ? "Needs setup"
                          : "Optional / not configured"}
                    </p>
                  </div>
                  <span
                    className={`admin-status ${check.ready ? "admin-status-active" : "admin-status-suspended"}`}
                  >
                    {check.ready
                      ? "READY"
                      : check.required
                        ? "BLOCKED"
                        : "OPTIONAL"}
                  </span>
                </article>
              ))}
            </div>
          </section>
        )}
        {isOwner && emailReadiness && (
          <section
            id="email-readiness"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">EMAIL & SIGN-IN SETUP</p>
            <h2>Booking emails and sign-in security</h2>
            <div className="admin-readiness-summary">
              <p className="lead">
                <strong>Booking and order emails:</strong>{" "}
                {emailReadiness.transactionalReady
                  ? "Ready. Booking emails, reminder jobs and Resend delivery tracking are configured."
                  : "Needs setup before GLOHAUS should rely on automated booking and reminder emails."}
              </p>
              <p className="lead">
                <strong>Sign-in security:</strong>{" "}
                {emailReadiness.authSecurityReady
                  ? "Required sign-in security checks are confirmed."
                  : "Some sign-in protections still need setup. This does not stop booking and order emails from sending."}
              </p>
            </div>
            <div className="service-edit-list">
              {emailReadiness.checks.map((check) => (
                <article className="service-edit-row" key={check.key}>
                  <div>
                    <h3>{check.label}</h3>
                    <p>
                      {check.group === "transactional"
                        ? "Booking and order emails"
                        : "Sign-in security"}
                      {" · "}
                      {check.ready
                        ? "Ready"
                        : check.required
                          ? "Needs setup"
                          : "Recommended"}
                    </p>
                  </div>
                  <span
                    className={`admin-status ${check.ready ? "admin-status-active" : "admin-status-suspended"}`}
                  >
                    {check.ready
                      ? "READY"
                      : check.required
                        ? "NEEDS SETUP"
                        : "RECOMMENDED"}
                  </span>
                </article>
              ))}
            </div>
          </section>
        )}
        {pushDelivery && (
          <section
            id="push-delivery-health"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">PROFESSIONAL NOTIFICATION HEALTH</p>
            <h2>Push delivery</h2>
            <p className="lead">
              Push provider acceptance confirms receipt by the push service.
              Device display depends on permission, connectivity and browser
              support. These totals contain no private message content.
            </p>
            <p>
              {process.env.VAPID_PUBLIC_KEY &&
              process.env.VAPID_PRIVATE_KEY &&
              process.env.VAPID_SUBJECT
                ? "VAPID configuration present."
                : "Push awaits VAPID configuration."}
            </p>
            <div className="service-edit-list">
              {[
                ["Active devices", pushDelivery.activeDevices],
                ["Queued", pushDelivery.queued],
                ["Accepted", pushDelivery.accepted],
                ["Failed", pushDelivery.failed],
                ["Expired devices", pushDelivery.expired],
                ["Skipped / opted out", pushDelivery.skipped],
              ].map(([label, value]) => (
                <article className="service-edit-row" key={String(label)}>
                  <h3>{label}</h3>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <p>
              {pushDelivery.lastAcceptedAt
                ? `Last accepted: ${new Date(pushDelivery.lastAcceptedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
                : "No push deliveries accepted yet."}
            </p>
          </section>
        )}
        {isOwner && emailDelivery && (
          <section
            id="email-delivery-health"
            className="admin-workspace-section admin-detail-card"
          >
            <p className="eyebrow">TRANSACTIONAL EMAIL HEALTH</p>
            <h2>Delivery outcomes</h2>
            <p className="lead">
              Track booking and order emails. Accepted means Resend received the
              email; delivered means delivery was confirmed. Sending and
              delivery are separate steps.
            </p>
            <div className="service-edit-list">
              {[
                ["Queued", emailDelivery.queued],
                ["Accepted for sending", emailDelivery.accepted],
                ["Delivered", emailDelivery.delivered],
                ["Bounced", emailDelivery.bounced],
                ["Marked as spam", emailDelivery.complained],
                ["Failed", emailDelivery.failed],
                ["Blocked from sending", emailDelivery.suppressed],
              ].map(([label, value]) => (
                <article className="service-edit-row" key={String(label)}>
                  <div>
                    <h3>{label}</h3>
                  </div>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <p className="lead">
              {emailDelivery.lastProviderEventAt
                ? `Last delivery update: ${new Date(emailDelivery.lastProviderEventAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}`
                : "No delivery updates yet. Confirmed email results will appear here."}
            </p>
          </section>
        )}
        {isOwner &&
          [
            ["marketing", "Marketing", marketing],
            ["homepage-media", "Homepage images", homepageMedia],
            ["booking-fee", "Booking fee", bookingFee],
            ["shop-fees", "Shop fees", owner],
            ["staff", "Staff and admins", owner],
            ["audit", "Audit log", owner],
            ["backend-health", "System health", backendHealth],
            ["payment-readiness", "Payment setup", paymentReadiness],
            ["email-delivery-health", "Email delivery", emailDelivery],
          ]
            .filter(([, , data]) => !data)
            .map(([id, label]) => (
              <section
                key={String(id)}
                id={String(id)}
                className="admin-workspace-section admin-detail-card"
              >
                <AdminSectionUnavailable label={String(label)} />
              </section>
            ))}
        <AdminSection id="support" title="Support inbox">
          <AdminSupportInbox initial={support} />
        </AdminSection>
        <AdminFinancePanel data={finance} />
        <AdminManager
          data={data}
          owner={isOwner}
          hardDeleteConfigured={Boolean(
            process.env.SUPABASE_SECRET_KEY ||
            process.env.SUPABASE_SERVICE_ROLE_KEY,
          )}
        />
        {owner && (
          <AdminSection id="audit" title="Owner audit log">
            <div className="service-edit-list">
              {owner.audit.map((entry) => (
                <article className="service-edit-row" key={entry.id}>
                  <div>
                    <h3>{entry.action.replaceAll("_", " ")}</h3>
                    <p>
                      {entry.actor_role || "operator"} ·{" "}
                      {new Date(entry.created_at).toLocaleString("en-GB", {
                        timeZone: "Europe/London",
                      })}
                    </p>
                    <small>{entry.reason}</small>
                  </div>
                </article>
              ))}
              {!owner.audit.length && (
                <p className="lead">
                  No changes recorded yet. Owner actions and their reasons will
                  appear here.
                </p>
              )}
            </div>
          </AdminSection>
        )}
      </AdminWorkspaceView>
    </main>
  );
}
