import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Use"
      summary="The general rules for using GLOHAUS as a customer, visitor or account holder."
    >
      <section><h2>Using GLOHAUS</h2><p>GLOHAUS is a marketplace that helps customers discover independent beauty professionals, book services, buy eligible products, communicate and manage supported payments. Users must provide accurate account information and use the platform lawfully.</p></section>
      <section><h2>Bookings and prices</h2><p>Customer-facing booking prices show the professional service price plus the mandatory £1 GLOHAUS booking fee before checkout. Professional commissions, subscription charges and payout amounts are commercial terms between GLOHAUS and the professional and are not customer-facing charges.</p></section>
      <section><h2>Payments</h2><p>Supported payments are processed through GLOHAUS payment providers. A booking may include a professional-required deposit, capped by the platform rules, plus the separate GLOHAUS booking fee. Product purchases and professional payouts follow their own marketplace payment flows.</p></section>
      <section><h2>Behaviour and misuse</h2><p>Users must not misuse accounts, payment systems, messaging, reviews, location-sharing features, promotions or other platform tools. GLOHAUS may restrict features or accounts where necessary to protect users, professionals, payments or platform integrity.</p></section>
      <section><h2>Independent professionals</h2><p>Beauty professionals are responsible for the services and products they provide, their qualifications where required, their business information and their own tax obligations. GLOHAUS provides marketplace and payment infrastructure but does not promise that every service or product will suit every customer.</p></section>
      <section><h2>Changes</h2><p>These terms may be updated before public launch and after launch where the service changes. Material commercial terms for professionals should be presented before acceptance.</p></section>
    </PolicyPage>
  );
}
