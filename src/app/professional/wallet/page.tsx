import Link from "next/link";
import { ArrowUpRight, CircleAlert, ShieldCheck, WalletCards } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import {
  professionalWallet,
  releaseMatureBookingProceeds,
  releaseMatureProductProceeds,
} from "@/modules/finance/repository";
import { money } from "@/modules/professionals/domain";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ConnectButton } from "@/components/connect-button";
import { PayoutDashboardButton } from "@/components/payout-dashboard-button";

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

  const finance = await withIdentity(result.account.authId, async (db) => {
    await releaseMatureProductProceeds(db);
    await releaseMatureBookingProceeds(db);
    const wallet = await professionalWallet(db);
    const pricing = (
      await db.query<{
        data: {
          planName: string;
          monthlyPricePence: number;
          serviceCommissionBasisPoints: number;
          productCommissionBasisPoints: number;
          instantWithdrawalBasisPoints: number;
        };
      }>("SELECT beauty.my_professional_pricing() AS data")
    ).rows[0].data;
    const paymentAccount = (
      await db.query<{ stripe_account_id: string }>(
        "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
        [result.account!.professionalId],
      )
    ).rows[0];
    return {
      wallet,
      pricing,
      hasStripeAccount: Boolean(paymentAccount?.stripe_account_id),
    };
  });
  const { wallet, pricing, hasStripeAccount } = finance;
  const restricted = wallet.withdrawalsBlocked || wallet.instantPayoutBlocked;
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="wallet" displayName={result.account.displayName} />
      <main id="main" className="pro-main pro-list-page">
        <p className="pro-kicker">GLOHAUS WALLET</p>
        <h1>Money, made clear.</h1>
        <p className="pro-page-lead">
          Your balance is calculated from protected transaction records. Pending
          money becomes available only after the relevant booking or dispute
          protection period.
        </p>

        <section className="pro-stat-grid pro-wallet-balances" aria-label="Wallet balances">
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
          <section className="pro-finance-notice" role="status">
            <CircleAlert size={18} aria-hidden />
            <span>
              Financial controls are currently restricting one or more payout
              options. Your transaction records remain available here.
            </span>
          </section>
        )}

        <section className="pro-panel">
          <div className="pro-panel-title">
            <h2>Your GLOHAUS pricing</h2>
            <span className="pro-status pro-status-confirmed">{pricing.planName}</span>
          </div>
          <p>
            Service commission: {(pricing.serviceCommissionBasisPoints / 100).toFixed(0)}% ·
            Product commission: {(pricing.productCommissionBasisPoints / 100).toFixed(0)}% ·
            Standard withdrawal: Free · Instant withdrawal: {(pricing.instantWithdrawalBasisPoints / 100).toFixed(0)}%
          </p>
          <p>
            {pricing.monthlyPricePence
              ? `Subscription: ${money(pricing.monthlyPricePence)}/month`
              : "Subscription: £0/month"}
          </p>
          <Link href="/professional/plans">
            View plans & fee details <ArrowUpRight size={18} aria-hidden />
          </Link>
        </section>

        <section className="pro-panel">
          <div className="pro-panel-title">
            <h2>Payout setup</h2>
            <span className="pro-status pro-status-confirmed">
              {hasStripeAccount ? "Stripe connected" : "Setup required"}
            </span>
          </div>
          <p>
            {hasStripeAccount
              ? "Eligible released product earnings can be sent from GLOHAUS to your connected Stripe balance here. You can then manage your payout bank details and payout status in Stripe."
              : "Connect Stripe before GLOHAUS can release professional earnings to your payout account."}
          </p>
          {hasStripeAccount ? <PayoutDashboardButton /> : <ConnectButton />}
        </section>

        <section className="pro-panel pro-wallet-explainer">
          <div>
            <span className="pro-finance-pill">
              <ShieldCheck size={14} aria-hidden /> Protected release
            </span>
            <h2>How money moves</h2>
            <p>
              Service deposit proceeds begin as pending and become eligible
              after a completed appointment has remained clear for 24 hours.
              Product proceeds remain pending until tracked delivery is confirmed
              by the customer, then become eligible after 48 hours. Disputes,
              refunds, reserves and provider reviews can hold funds while they
              are reviewed.
            </p>
          </div>
          <WalletCards className="pro-wallet-symbol" aria-hidden />
        </section>

        <section className="pro-panel pro-tax-panel">
          <div className="pro-panel-title">
            <h2>Tax Centre</h2>
            <span className="pro-status pro-status-confirmed">Earnings records</span>
          </div>
          <div className="pro-tax-copy">
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
            <Link href="/professional/bookings">
              View appointments <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
