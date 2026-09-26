import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Marketplace Terms" };

export default function MarketplaceTermsPage() {
  return (
    <PolicyPage
      title="Marketplace Terms"
      summary="Additional rules for products sold by professionals through the GLOHAUS Shop."
    >
      <section><h2>Product listings</h2><p>Professionals are responsible for accurate product descriptions, prices, stock, fulfilment information and any product-specific legal or safety obligations that apply to them.</p></section>
      <section><h2>Commission</h2><p>GLOHAUS currently applies a 10% professional-side commission to eligible product sales. This commission is visible to professionals and is not presented to customers as a professional commission charge.</p></section>
      <section><h2>Order protection</h2><p>Customer payment is handled through the GLOHAUS marketplace payment flow. Professional proceeds remain protected until the relevant fulfilment and delivery conditions have been satisfied. Confirmed delivery is followed by the platform release period before eligible professional proceeds become withdrawable.</p></section>
      <section><h2>Failure to ship or fulfil</h2><p>If a professional does not fulfil a paid order, the customer may be eligible for a refund. The professional side of the transaction should normally bear the refund impact before GLOHAUS commission, subject to applicable law, payment-provider requirements and the final launch terms.</p></section>
      <section><h2>Disputes</h2><p>GLOHAUS may request evidence, hold funds, restrict withdrawals or review accounts where an order is disputed, reported as missing, cancelled, refunded or otherwise requires investigation.</p></section>
    </PolicyPage>
  );
}
