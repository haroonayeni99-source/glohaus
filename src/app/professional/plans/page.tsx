import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { AccessMessage } from "@/components/access-message";
import { ProfessionalNavigation } from "@/components/professional-navigation";
import { money } from "@/modules/professionals/domain";
import { ProfessionalPlanActions } from "@/components/professional-plan-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Professional pricing · GLOHAUS PRO" };

type Pricing = {
  planKey: "starter" | "pro" | "premium";
  planName: string;
  monthlyPricePence: number;
  serviceCommissionBasisPoints: number;
  productCommissionBasisPoints: number;
  standardWithdrawalBasisPoints: number;
  instantWithdrawalBasisPoints: number;
  customerBookingFeePence: number;
};

const plans = [
  { key: "starter", name: "Starter", monthly: 0, commission: 800 },
  { key: "pro", name: "Pro", monthly: 1999, commission: 600 },
  { key: "premium", name: "Premium", monthly: 3999, commission: 400 },
] as const;

const percent = (basisPoints: number) => (basisPoints / 100).toFixed(basisPoints % 100 ? 2 : 0) + "%";

export default async function ProfessionalPlansPage() {
  const result = await pageAccount("professional");
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );

  const finance = await withIdentity(result.account.authId, async (db) => {
    const pricing = (
      await db.query<{ data: Pricing }>(
        "SELECT beauty.my_professional_pricing() AS data",
      )
    ).rows[0].data;
    const subscription = (
      await db.query<{
        provider_customer_id: string | null;
        status: string;
        cancel_at_period_end: boolean;
      }>(
        `SELECT provider_customer_id,status,cancel_at_period_end
         FROM beauty.professional_subscriptions
         WHERE professional_id=$1`,
        [result.account!.professionalId],
      )
    ).rows[0];
    return { pricing, subscription };
  });
  const { pricing, subscription } = finance;

  return (
    <div className="pro-app">
      <ProfessionalNavigation active="more" displayName={result.account.displayName} />
      <main id="main" className="pro-main pro-management-page">
        <p className="pro-kicker">GLOHAUS PRO PRICING</p>
        <h1>Your fees, clearly explained.</h1>
        <p className="pro-page-lead">
          Customers do not see your GLOHAUS commission or payout amount. These
          commercial terms are shown to you so you can understand your costs
          before using paid GLOHAUS services.
        </p>

        <section className="analytics-grid" aria-label="Professional plans">
          {plans.map((plan) => (
            <article key={plan.key}>
              <strong>{plan.name}</strong>
              <span>{plan.monthly === 0 ? "£0/month" : money(plan.monthly) + "/month"}</span>
              <span>{percent(plan.commission)} GLOHAUS service commission</span>
              {pricing.planKey === plan.key && <small>Current plan</small>}
            </article>
          ))}
        </section>

        <ProfessionalPlanActions
          currentPlan={pricing.planKey}
          hasBillingCustomer={Boolean(subscription?.provider_customer_id)}
          proReady={Boolean(process.env.STRIPE_PRO_MONTHLY_PRICE_ID)}
          premiumReady={Boolean(process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID)}
        />

        {subscription?.cancel_at_period_end && (
          <section className="pro-finance-notice" role="status">
            Your paid plan is scheduled to end at the end of its Stripe billing
            period. GLOHAUS will return the account to Starter after Stripe
            confirms cancellation.
          </section>
        )}

        <section className="pro-panel">
          <h2>Your current commercial terms</h2>
          <div className="service-edit-list">
            <article className="service-edit-row">
              <div>
                <h3>{pricing.planName}</h3>
                <p>{percent(pricing.serviceCommissionBasisPoints)} service commission</p>
                <small>{pricing.monthlyPricePence ? money(pricing.monthlyPricePence) + " per month" : "No monthly subscription fee"}</small>
              </div>
            </article>
            <article className="service-edit-row">
              <div>
                <h3>Product sales</h3>
                <p>{percent(pricing.productCommissionBasisPoints)} GLOHAUS commission</p>
              </div>
            </article>
            <article className="service-edit-row">
              <div>
                <h3>Withdrawals</h3>
                <p>Standard withdrawal: Free</p>
                <small>Instant withdrawal: {percent(pricing.instantWithdrawalBasisPoints)}</small>
              </div>
            </article>
          </div>
        </section>

        <section className="pro-panel">
          <h2>How service earnings are shown</h2>
          <p>
            Example on Starter: a £100 service has an £8 GLOHAUS commission,
            leaving £92 professional earnings before any other applicable
            adjustments. The customer&apos;s separate £1 booking fee is not deducted
            from your service price and is not shown as your earnings.
          </p>
        </section>

        <section className="pro-panel">
          <h2>Customer pricing stays separate</h2>
          <p>
            Customers see the service price, the mandatory £1 GLOHAUS booking
            fee and the total they need to pay. They do not see your commission,
            subscription price, payout amount or GLOHAUS share of your earnings.
          </p>
        </section>

        <p className="lead">
          Paid plan commission changes only after verified Stripe subscription
          events. The pricing acknowledgement above does not replace GLOHAUS&apos;s
          final Professional Terms.
        </p>
        <Link className="button" href="/professional/setup">Back to setup</Link>
      </main>
    </div>
  );
}
