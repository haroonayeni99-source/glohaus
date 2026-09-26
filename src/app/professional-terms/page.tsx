import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Professional Terms" };

export default function ProfessionalTermsPage() {
  return (
    <PolicyPage
      title="Professional Terms"
      summary="The commercial terms professionals should review before providing services or selling products through GLOHAUS."
    >
      <section><h2>Eligibility</h2><p>Professional/service-provider accounts are intended for users aged 18 or over. Professionals must provide accurate business and payout information and complete required payment-provider onboarding before receiving payouts.</p></section>
      <section><h2>Service plans and commission</h2><p>Starter is £0/month with 8% GLOHAUS service commission. Pro is £19.99/month with 6% service commission. Premium is £39.99/month with 4% service commission. The applicable rate should be shown before a professional accepts or changes a plan.</p></section>
      <section><h2>Products and withdrawals</h2><p>Product sales carry a 10% GLOHAUS commission. Standard withdrawal has no GLOHAUS withdrawal fee. Instant withdrawal carries a 4% GLOHAUS fee and is only available where the connected payout account is eligible.</p></section>
      <section><h2>Earnings visibility</h2><p>Professionals can see their commission, subscription, withdrawal fees and professional earnings breakdown inside professional-only areas. Customers are not shown the professional commission percentage or the professional payout amount.</p></section>
      <section><h2>Fulfilment and refunds</h2><p>Professionals are responsible for fulfilling accepted services and product orders. Professional-caused failures may reduce pending or available earnings, create outstanding obligations or delay withdrawals. GLOHAUS commission is generally intended to remain non-refundable to the professional, subject to applicable law and final legal terms.</p></section>
      <section><h2>Tax</h2><p>Professionals remain responsible for determining, reporting and paying their own applicable taxes, VAT, National Insurance and other business obligations. GLOHAUS transaction summaries are records, not tax advice or a tax return.</p></section>
    </PolicyPage>
  );
}
