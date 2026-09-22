import Link from "next/link";
import { ArrowUpRight, CircleAlert, ShieldCheck, WalletCards } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { PublicHeader } from "@/components/public-header";
import { AccessMessage } from "@/components/access-message";
import { professionalWallet } from "@/modules/finance/repository";
import { money } from "@/modules/professionals/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "GLOHAUS Wallet" };

export default async function ProfessionalWalletPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const wallet = await withIdentity(result.account.authId, professionalWallet);
  const restricted = wallet.withdrawalsBlocked || wallet.instantPayoutBlocked;
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link className="back-link" href="/professional">
          ← Your workspace
        </Link>
        <p className="eyebrow">GLOHAUS WALLET</p>
        <h1>
          Money, <em>made clear.</em>
        </h1>
        <p className="lead">
          Your balance is calculated from protected transaction records. Pending
          money becomes available only after the relevant booking or dispute
          protection period.
        </p>

        <section className="analytics-grid" aria-label="Wallet balances">
          <article>
            <strong>{money(wallet.availablePence)}</strong>
            <span>Available to withdraw</span>
          </article>
          <article>
            <strong>{money(wallet.pendingPence)}</strong>
            <span>Pending release</span>
          </article>
          <article>
            <strong>{money(wallet.reservedPence)}</strong>
            <span>Reserved</span>
          </article>
          <article>
            <strong>{money(wallet.processingPence)}</strong>
            <span>Withdrawal processing</span>
          </article>
          <article>
            <strong>{money(wallet.disputedPence)}</strong>
            <span>On hold or disputed</span>
          </article>
          <article>
            <strong>{money(wallet.outstandingObligationPence)}</strong>
            <span>Outstanding obligations</span>
          </article>
        </section>

        {restricted && (
          <section className="form-notice" role="status">
            <CircleAlert size={18} aria-hidden />
            <span>
              Financial controls are currently restricting one or more payout
              options. Your transaction records remain available here.
            </span>
          </section>
        )}

        <section className="welcome-panel wallet-explainer">
          <div>
            <span className="pill">
              <ShieldCheck size={14} aria-hidden /> Protected release
            </span>
            <h2>How money moves</h2>
            <p>
              Service proceeds begin as pending. After a completed appointment
              and the customer reporting window, eligible proceeds become
              available. Disputes, refunds, reserves and provider reviews can
              hold funds while they are reviewed.
            </p>
          </div>
          <WalletCards className="welcome-symbol" aria-hidden />
        </section>

        <section className="empty-panel wallet-tax-panel">
          <div className="panel-title">
            <h2>Tax Centre</h2>
            <span className="muted-badge">Earnings records</span>
          </div>
          <div className="empty-content">
            <h3>Your records, in one place.</h3>
            <p>
              GLOHAUS will provide earnings summaries and transaction records.
              They are not a tax return: you remain responsible for determining,
              reporting and paying any applicable tax, VAT, National Insurance
              or other obligations.
            </p>
            <p>
              Tax acknowledgements and payout requests are enabled only after
              GLOHAUS publishes the applicable terms and payment-provider
              onboarding is complete.
            </p>
            <Link className="text-link" href="/professional/bookings">
              View appointments <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
