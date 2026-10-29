import { PolicyPage } from "@/components/policy-page";
import { publicBookingFees } from "@/modules/bookings/public-fees";

export const metadata = { title: "Terms of Use" };

export default async function TermsPage() {
  const fees = await publicBookingFees();
  return (
    <PolicyPage
      title="Terms of Use"
      updated="29 October 2026"
      summary="The general rules for using GLOHAUS as a customer, visitor or account holder."
    >
      <section><h2>Using GLOHAUS</h2><p>GLOHAUS is a marketplace that helps customers discover independent beauty professionals, book services, buy eligible products, communicate and manage supported payments. Users must provide accurate account information and use the platform lawfully.</p></section>
      <section><h2>Bookings and prices</h2><p>Customer-facing booking prices show the service price plus the GLOHAUS booking fee before checkout. {fees ? <>The standard fee is £{(fees.standardFeePence / 100).toFixed(2)}. {fees.promotionEnabled && <>Eligible new customers using a valid recorded referral pay £{(fees.promotionalFeePence / 100).toFixed(2)} on their first qualifying booking across GLOHAUS. </>}</> : <>The current applicable fee is shown in your booking summary. </>}Existing bookings retain their accepted fee. Professional commissions, subscription charges and payout amounts are commercial terms between GLOHAUS and the professional and are not customer-facing charges.</p><p>The first-booking referral offer applies once per eligible customer across the platform, including valid invitations from professionals bringing existing clients to GLOHAUS. Referral attribution must be recorded before booking. An active checkout temporarily reserves eligibility to prevent duplicate discounts. Failed, expired, cancelled or refunded bookings do not permanently consume the offer. Self-referrals, duplicate accounts and manipulated activity are not eligible; suspected abuse may require review. A later settings change does not alter an existing quoted booking fee. The exact fee and discount shown and accepted before payment govern that booking.</p></section>
      <section><h2>Payments</h2><p>Supported payments are processed through GLOHAUS payment providers. A booking may include a professional-required deposit, capped by the platform rules, plus the separate GLOHAUS booking fee. Product purchases and professional payouts follow their own marketplace payment flows.</p></section>
      <section><h2>Behaviour and misuse</h2><p>Users must not misuse accounts, payment systems, messaging, reviews, location-sharing features, promotions or other platform tools. GLOHAUS may restrict features or accounts where necessary to protect users, professionals, payments or platform integrity.</p></section>
      <section><h2>Independent professionals</h2><p>Beauty professionals are responsible for the services and products they provide, their qualifications where required, their business information and their own tax obligations. GLOHAUS provides marketplace and payment infrastructure but does not promise that every service or product will suit every customer.</p></section>
      <section><h2>Optional travel estimates</h2><p>Travel estimates and departure reminders support appointment planning and are not guarantees of arrival, traffic conditions, transport operation, accessibility or attendance. Check current directions before travelling. Optional Google Maps services are subject to the <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer">Google Maps Terms of Service</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>. GPS, route estimates and reminders do not automatically create a lateness penalty or cancel an appointment.</p></section>
      <section><h2>Changes</h2><p>These terms may be updated before public launch and after launch where the service changes. Material commercial terms for professionals should be presented before acceptance.</p></section>
    </PolicyPage>
  );
}
