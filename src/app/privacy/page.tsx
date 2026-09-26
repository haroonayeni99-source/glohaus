import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      summary="How GLOHAUS expects to handle account, booking, marketplace and safety information."
    >
      <section><h2>Information GLOHAUS uses</h2><p>This may include account details, profile information, booking and order records, payment references, messages, reviews, professional business information, support or refund evidence, device/security information and other information users choose to provide.</p></section>
      <section><h2>Payments</h2><p>Card and payout details are handled by payment providers such as Stripe rather than being stored as raw card or bank credentials by GLOHAUS. GLOHAUS may retain payment references, transaction status, fees, refunds and payout records needed to operate the marketplace.</p></section>
      <section><h2>Location sharing</h2><p>Booking-related journey location sharing is optional and consent-based. When a customer chooses to share while travelling to a confirmed appointment, the linked professional can see the latest shared location, its approximate accuracy and update time. GLOHAUS stores the latest shared position plus sharing start/stop information for booking support and dispute evidence; it does not create a continuous permanent location trail. Live sharing is limited to the booking journey, can be stopped by the customer and expires when the appointment ends. Browser background restrictions may pause updates when the booking page is not active.</p></section>
      <section><h2>Why information is used</h2><p>Information may be used to provide accounts and bookings, process supported payments, operate the Shop, communicate between users, prevent abuse, resolve disputes, provide customer support, maintain records and improve platform reliability.</p></section>
      <section><h2>Retention and rights</h2><p>Retention periods and the final process for access, correction, deletion, objection and other privacy rights must be confirmed in the solicitor-reviewed and privacy-reviewed launch version of this policy.</p></section>
    </PolicyPage>
  );
}
