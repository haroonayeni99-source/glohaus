export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { customerPaymentOverview } from "@/modules/finance/repository";
import { money } from "@/modules/professionals/domain";

export const metadata = { title: "Wallet & payments" };

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function CustomerWalletPage() {
  const result = await pageAccount("customer");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const account = result.account;
  const wallet = await withIdentity(account.authId, (db) =>
    customerPaymentOverview(db, account.id),
  );

  return (
    <>
      <PublicHeader />
      <main id="main" className="customer-wallet-page">
        <section className="customer-wallet-hero">
          <div>
            <p className="eyebrow">WALLET & PAYMENTS</p>
            <h1>Your booking money, clearly explained.</h1>
            <p>
              Track deposits collected through GLOHAUS and any refunds returned
              through the booking system.
            </p>
          </div>
          <ShieldCheck size={38} aria-hidden />
        </section>

        <section
          className="customer-wallet-stats"
          aria-label="Payment and refund totals"
        >
          <article>
            <CircleDollarSign size={21} aria-hidden />
            <span>Deposits paid</span>
            <strong>{money(wallet.capturedPence)}</strong>
          </article>
          <article>
            <RotateCcw size={21} aria-hidden />
            <span>Refunds received</span>
            <strong>{money(wallet.refundedPence)}</strong>
          </article>
          <article>
            <ReceiptText size={21} aria-hidden />
            <span>Refunds processing</span>
            <strong>{money(wallet.pendingRefundPence)}</strong>
          </article>
        </section>

        <section className="customer-wallet-note">
          <strong>No stored cash balance yet.</strong>
          <p>
            GLOHAUS does not currently hold a spendable customer wallet balance.
            The figures above come from verified booking payment and refund
            records. Customer credits and rewards will only appear here once a
            protected customer-credit ledger and programme rules are launched.
          </p>
        </section>

        <section className="customer-wallet-history">
          <div className="customer-wallet-heading">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Payments & refunds</h2>
            </div>
            <Link href="/account/bookings">View bookings</Link>
          </div>

          {wallet.records.length ? (
            <div className="customer-payment-list">
              {wallet.records.map((record) => (
                <article key={record.bookingId}>
                  <div className="customer-payment-icon" aria-hidden>
                    {record.refundedPence > 0 ? (
                      <RotateCcw size={18} />
                    ) : (
                      <ReceiptText size={18} />
                    )}
                  </div>
                  <div className="customer-payment-copy">
                    <strong>{record.serviceName}</strong>
                    <span>{record.professionalName}</span>
                    <small>
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Europe/London",
                      }).format(new Date(record.startsAt))}
                    </small>
                  </div>
                  <div className="customer-payment-money">
                    <strong>{money(record.capturedPence)}</strong>
                    {record.refundedPence > 0 && (
                      <span>Refunded {money(record.refundedPence)}</span>
                    )}
                    {record.refundDecisionPence &&
                      ["queued", "pending"].includes(
                        record.refundDecisionStatus || "",
                      ) && (
                        <span>
                          Refund processing {money(record.refundDecisionPence)}
                        </span>
                      )}
                    <small>{statusLabel(record.paymentStatus)}</small>
                  </div>
                  <Link
                    href={`/account/bookings/${record.bookingId}`}
                    aria-label={`View ${record.serviceName} booking`}
                  >
                    <ArrowRight size={18} aria-hidden />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="customer-wallet-empty">
              <ReceiptText size={28} aria-hidden />
              <h3>No payment activity yet.</h3>
              <p>
                Deposits and refunds from your GLOHAUS bookings will appear
                here.
              </p>
              <Link href="/explore">Explore professionals</Link>
            </div>
          )}
        </section>
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
