import Link from "next/link";
import { ArrowUpRight, CircleAlert, ShieldCheck, WalletCards } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import {
  professionalWallet,
  professionalDisputeOverview,
  releaseMatureBookingProceeds,
  releaseMatureProductProceeds,
} from "@/modules/finance/repository";
import { money } from "@/modules/professionals/domain";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { ConnectButton } from "@/components/connect-button";
import { PayoutDashboardButton } from "@/components/payout-dashboard-button";
import { WithdrawalForm } from "@/components/withdrawal-form";
import { professionalAccessState } from "@/modules/professionals/verification";

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
    await db.query("SELECT beauty.recover_my_outstanding_obligation()");
    const wallet = await professionalWallet(db);
    const disputes = await professionalDisputeOverview(db);
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
    const access = await professionalAccessState(db, result.account!.professionalId!);
    const paymentAccount = (
      await db.query<{ stripe_account_id: string }>(
        "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
        [result.account!.professionalId],
      )
    ).rows[0];
    return {
      wallet,
      disputes,
      pricing,
      access,
      hasStripeAccount: Boolean(paymentAccount?.stripe_account_id),
    };
  });
  const { wallet, disputes, pricing, access, hasStripeAccount } = finance;
  const restricted = wallet.withdrawalsBlocked || wallet.instantPayoutBlocked;
  return (
    <div className="pro-app">
      <ProfessionalNavigation active="wallet" displayName={result.account.displayName} />
      <main id="main" className="pro-main pro-list-page">
        <p className="pro-kicker">GLOHAUS WALLET</p>
        <h1>Money, made clear.</h1>
        <p className="pro-page-lead">
          Your balance is calculated from protected transaction records. If a
          booking is disputed, only the money connected to that booking is held
          by default. Unrelated available earnings remain withdrawable unless a
          wider risk or account review restriction is required.
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

        {disputes.disputes.length > 0 && (
          <section className="pro-panel">
            <div className="pro-panel-title">
              <h2>Booking disputes</h2>
              <span className="pro-status pro-status-confirmed">
                {disputes.counts.open} open
              </span>
            </div>
            <p>
              Money linked to a disputed booking is ring-fenced while the
              payment provider reviews the case. Other available earnings stay
              withdrawable unless a wider account review is required.
            </p>
            <div className="pro-dispute-list">
              {disputes.disputes.map((dispute) => {
                const open = [
                  "warning_needs_response",
                  "warning_under_review",
                  "needs_response",
                  "under_review",
                ].includes(dispute.status);
                const statusLabel = dispute.status.replaceAll("_", " ");
                return (
                  <article key={dispute.id}>
                    <div>
                      <strong>{dispute.serviceName}</strong>
                      <small>
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Europe/London",
                        }).format(new Date(dispute.startsAt))}
                      </small>
                    </div>
                    <div>
                      <span className={open ? "pro-dispute-open" : "pro-dispute-closed"}>
                        {statusLabel}
                      </span>
                      <strong>{money(dispute.reservedPence)} held</strong>
                    </div>
                    <p>
                      Disputed payment: {money(dispute.amountPence)}
                      {dispute.reason ? ` · Reason: ${dispute.reason.replaceAll("_", " ")}` : ""}
                    </p>
                    {dispute.reserveShortfallPence > 0 && (
                      <p className="pro-dispute-warning">
                        {money(dispute.reserveShortfallPence)} could not be
                        fully ring-fenced, so wider withdrawal controls may
                        apply.
                      </p>
                    )}
                    {open && dispute.evidenceDueAt && (
                      <small>
                        Evidence deadline:{" "}
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Europe/London",
                        }).format(new Date(dispute.evidenceDueAt))}
                      </small>
                    )}
                    <Link href={`/professional/bookings/${dispute.bookingId}`}>
                      View booking <ArrowUpRight size={15} aria-hidden />
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        )}

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

        {hasStripeAccount && access.verified && (
          <section className="pro-panel">
            <div className="pro-panel-title">
              <h2>Withdraw earnings</h2>
              <span className="pro-status pro-status-confirmed">
                Standard free · Instant 4%
              </span>
            </div>
            <p>
              Choose how much of your released balance to withdraw. The exact
              Instant fee is shown before you submit and is never allowed to
              push your GLOHAUS wallet below zero.
            </p>
            <WithdrawalForm
              availablePence={wallet.availablePence}
              instantBlocked={wallet.instantPayoutBlocked}
              instantConfigured={
                process.env.STRIPE_INSTANT_PAYOUT_FEE_CONFIGURED === "true"
              }
            />
          </section>
        )}

        <section className="pro-panel">
          <div className="pro-panel-title">
            <h2>Payout setup</h2>
            <span className="pro-status pro-status-confirmed">
              {access.verified
                ? "Verified"
                : access.status === "pending"
                  ? "Verification pending"
                  : access.status === "restricted"
                    ? "Restricted"
                    : "Verification required"}
            </span>
          </div>
          <p>
            {access.verified
              ? "Your identity is verified. Manage your Stripe payout account or request withdrawals from your released balance."
              : "Your earnings records remain protected in GLOHAUS, but withdrawals stay locked until identity verification is complete."}
          </p>
          {access.verified && hasStripeAccount ? (
            <PayoutDashboardButton />
          ) : (
            <ConnectButton status={access.status} />
          )}
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
              by the customer, then become eligible after 48 hours. A booking
              dispute ring-fences the amount connected to that booking in your
              disputed balance; unrelated available earnings stay available
              unless a wider account review is required.
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
