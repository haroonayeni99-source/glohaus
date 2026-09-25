export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { customerPaymentOverview } from "@/modules/finance/repository";
import { money } from "@/modules/professionals/domain";

export const metadata = { title: "Payments & refunds" };

function paymentLabel(status: string) {
  switch (status) {
    case "paid":
      return "Deposit paid";
    case "refund_required":
      return "Refund review";
    case "partially_refunded":
      return "Partially refunded";
    case "refunded":
      return "Refunded";
    default:
      return "Payment pending";
  }
}

export default async function CustomerWalletPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const overview = await withIdentity(result.account.authId, (db) =>
    customerPaymentOverview(db, result.account.id),
  );

  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page customer-wallet-page">
        <p className="eyebrow">PAYMENTS & REFUNDS</p>
        <h1>Your money, clearly explained.</h1>
        <p className="lead">
          This page shows verified booking payments and refunds. GLOHAUS does
          not currently hold a separate customer cash balance.
        </p>

        <section className="customer-wallet-summary" aria-label="Payment totals">
          <article>
            <WalletCards size={20} aria-hidden />
            <span>Deposits paid</span>
            <strong>{money(overview.capturedPence)}</strong>
          </article>
          <article>
            <RefreshCcw size={20} aria-hidden />
            <span>Refunded</span>
            <strong>{money(overview.refundedPence)}</strong>
          </article>
          <article>
            <CircleDollarSign size={20} aria-hidden />
            <span>Refunds processing</span>
            <strong>{money(overview.refundPendingPence)}</strong>
          </article>
        </section>

        <section className="customer-wallet-note">
          <ShieldCheck size={20} aria-hidden />
          <div>
            <strong>No fake wallet balance.</strong>
            <p>
              Rewards and GLOHAUS credit will appear here only after a real
              customer ledger exists. Until then, every amount shown comes from
              a verified booking payment or refund record.
            </p>
          </div>
        </section>

        <section className="customer-payment-history">
          <div className="customer-wallet-section-heading">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Payment history</h2>
            </div>
            <Link href="/account/bookings">Bookings</Link>
          </div>

          {overview.records.length ? (
            <div className="customer-payment-list">
              {overview.records.map((record) => (
                <Link
                  href={`/account/bookings/${record.booking_id}`}
                  key={record.booking_id}
                >
                  <div>
                    <strong>{record.service_name}</strong>
                    <span>{record.professional_name}</span>
                    <small>
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(record.starts_at))}
                    </small>
                  </div>
                  <div className="customer-payment-amounts">
                    <strong>
                      {record.captured_pence
                        ? money(record.captured_pence)
                        : money(0)}
                    </strong>
                    <span className={`customer-payment-status status-${record.payment_status}`}>
                      {paymentLabel(record.payment_status)}
                    </span>
                    {record.refunded_pence > 0 && (
                      <small>
                        {money(record.refunded_pence)} refunded
                      </small>
                    )}
                    {record.refund_status &&
                      ["queued", "pending"].includes(record.refund_status) && (
                        <small>
                          {money(record.refund_amount_pence ?? 0)} refund processing
                        </small>
                      )}
                  </div>
                  <ArrowRight size={17} aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <div className="customer-wallet-empty">
              <WalletCards size={28} aria-hidden />
              <h3>No payment activity yet.</h3>
              <p>Your verified booking payments and refunds will appear here.</p>
              <Link href="/explore">Find a professional</Link>
            </div>
          )}
        </section>
      </main>
      <BottomNavigation />
    </>
  );
}
