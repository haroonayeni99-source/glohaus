import { randomBytes } from "node:crypto";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";

const PRICING_ACK_VERSION = "professional-pricing-v1";

const paidPlans = {
  pro: {
    priceId: () => process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  },
  premium: {
    priceId: () => process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  },
} as const;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const body = (await request.json()) as {
      plan?: keyof typeof paidPlans;
      pricingAccepted?: boolean;
    };
    if (!body.plan || !(body.plan in paidPlans) || body.pricingAccepted !== true)
      throw new AccessError("INVALID_REQUEST", 400);

    const priceId = paidPlans[body.plan].priceId();
    if (!priceId) throw new AccessError("UNAVAILABLE", 503);

    const account = await withAccount("professional", async (db, account) => {
      const existing = (
        await db.query<{
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          status: string;
        }>(
          `SELECT provider_customer_id,provider_subscription_id,status
           FROM beauty.professional_subscriptions
           WHERE professional_id=$1`,
          [account.professionalId],
        )
      ).rows[0];

      if (existing?.provider_subscription_id && existing.status === "active")
        throw new AccessError("INVALID_REQUEST", 409);

      return {
        professionalId: account.professionalId!,
        email: account.email,
        customerId: existing?.provider_customer_id ?? undefined,
      };
    });

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    const metadata = {
      glohaus_professional_id: account.professionalId,
      glohaus_plan_key: body.plan,
      glohaus_pricing_ack_version: PRICING_ACK_VERSION,
      glohaus_price_id: priceId,
    };

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      ...(account.customerId
        ? { customer: account.customerId }
        : { customer_email: account.email }),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        billing_mode: { type: "flexible" },
        metadata,
      },
      metadata,
      success_url: `${origin}/professional/plans?subscription=success`,
      cancel_url: `${origin}/professional/plans?subscription=cancelled`,
      integration_identifier: `glohaus_plan_${randomBytes(4)
        .toString("hex")
        .replace(/[0-9]/g, "a")
        .slice(0, 8)}`,
    });

    return json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
