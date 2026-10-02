import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Use"
      summary="The general rules for using GLOHAUS as a customer, visitor or account holder."
    >
      <section><h2>Using GLOHAUS</h2><p>GLOHAUS is a marketplace that helps customers discover independent beauty professionals, book services, buy eligible products, communicate and manage supported payments. Users must provide accurate account information and use the platform lawfully.</p></section>
      <section><h2>Bookings and prices</h2><p>Customer-facing booking prices show the professional service price plus the current GLOHAUS booking fee before checkout. GLOHAUS may update that fee for future bookings, but an existing paid booking keeps the fee recorded when the customer checked out. Professional commissions, subscription charges and payout amounts are commercial terms between GLOHAUS and the professional and are not customer-facing charges.</p></section>
      <section><h2>Payments</h2><p>Supported online payments are processed through GLOHAUS payment providers. A booking may include an online booking payment toward the service, plus the separate GLOHAUS booking fee shown for that booking. The online booking payment is credited toward the service balance and may be increased by a professional-selected deposit, subject to the platform&apos;s 40% maximum.</p></section>
      <section><h2>Cash and off-platform payments</h2><p>Where a professional offers cash for the remaining service balance, a customer may choose to pay cash at the appointment. Cash and other payments made outside GLOHAUS are made at the customer&apos;s own risk. GLOHAUS may have limited or no ability to trace, reverse or recover money paid outside its payment system. Customers are encouraged to pay through GLOHAUS where the option is available.</p></section>
      <section><h2>Keep booking conversations on GLOHAUS</h2><p>Customers and professionals are encouraged to keep booking-related messages, price discussions, changes and payment arrangements in GLOHAUS messaging. If a conversation or payment is moved outside GLOHAUS, the platform may have less evidence available to investigate a complaint, dispute or scam and may be unable to recover money paid outside the platform.</p></section>
      <section><h2>Accurate service prices and anti-circumvention</h2><p>The service price displayed on GLOHAUS must reflect the genuine price the customer is expected to pay for the booked service. A professional must not deliberately advertise a reduced or artificial price on GLOHAUS and then require an undisclosed mandatory cash or off-platform top-up in order to avoid GLOHAUS fees or commission. Optional extras requested after booking should be agreed clearly. Repeated or deliberate fee circumvention may result in booking, payout, visibility or account restrictions.</p></section>
      <section><h2>Behaviour and misuse</h2><p>Users must not misuse accounts, payment systems, messaging, reviews, location-sharing features, promotions or other platform tools. GLOHAUS may restrict features or accounts where necessary to protect users, professionals, payments or platform integrity.</p></section>
      <section><h2>Independent professionals</h2><p>Beauty professionals are responsible for the services and products they provide, their qualifications where required, their business information and their own tax obligations. GLOHAUS provides marketplace and payment infrastructure but does not promise that every service or product will suit every customer.</p></section>
      <section><h2>Changes</h2><p>These terms may be updated before public launch and after launch where the service changes. Material commercial terms for professionals should be presented before acceptance.</p></section>
    </PolicyPage>
  );
}
