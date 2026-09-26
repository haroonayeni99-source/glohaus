import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Refunds & Cancellations" };

export default function RefundsPage() {
  return (
    <PolicyPage
      title="Refunds & Cancellations"
      summary="How GLOHAUS expects refunds, cancellations and professional non-fulfilment to be handled."
    >
      <section><h2>Customer requests</h2><p>Refund eligibility depends on the booking or product circumstances, the evidence available, the applicable cancellation terms and any rights that cannot lawfully be excluded. GLOHAUS may issue full or partial refunds where appropriate.</p></section>
      <section><h2>Professional non-fulfilment</h2><p>If a professional does not provide an agreed service or fails to fulfil a product order, an eligible customer refund should normally be funded from the professional side of the transaction before GLOHAUS revenue, subject to applicable law, payment-provider requirements and the final terms.</p></section>
      <section><h2>GLOHAUS fees</h2><p>Professional commissions and other GLOHAUS platform revenue are generally intended to be non-refundable to the professional. The final launch terms must preserve any customer rights or payment-provider obligations that override this commercial rule.</p></section>
      <section><h2>Protection periods</h2><p>Professional service proceeds remain protected before release, and product proceeds remain protected around confirmed delivery. Refunds, disputes, chargebacks or reviews may delay or restrict release and withdrawal.</p></section>
      <section><h2>Shortfalls</h2><p>If a professional-caused refund exceeds funds currently held for that professional, GLOHAUS may record an outstanding professional obligation and offset future eligible earnings before further withdrawals.</p></section>
    </PolicyPage>
  );
}
