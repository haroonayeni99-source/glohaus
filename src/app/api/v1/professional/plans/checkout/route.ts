import { randomBytes } from "node:crypto";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";
import { paymentReturnOrigin } from "@/modules/payments/return-url";
import {
  configuredPlanPrice,
  matchesMonthlyPlanPrice,
} from "@/modules/payments/plan-offers";

const PRICING_ACK_VERSION = "professional-pricing-v2";

const schema = z
  .object({
    plan: z.enum(["pro", "premium"]),
    pricingAccepted: z.literal(true),
    quotedPriceId: z.string().startsWith("price_").max(200),
    quotedMonthlyPricePence: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const parsed = schema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const body = parsed.data;

    const priceId = configuredPlanPrice(body.plan);
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

      const definition = (
        await db.query<{ monthly_price_pence: number }>(
          "SELECT monthly_price_pence FROM beauty.professional_plan_definitions WHERE plan_key=$1 AND active",
          [body.plan],
        )
      ).rows[0];
      if (!definition) throw new AccessError("UNAVAILABLE", 503);
      if (
        body.quotedPriceId !== priceId ||
        body.quotedMonthlyPricePence !== definition.monthly_price_pence
      )
        throw new AccessError("INVALID_REQUEST", 409);

      return {
        professionalId: account.professionalId!,
        email: account.email,
        customerId: existing?.provider_customer_id ?? undefined,
        monthlyPricePence: definition.monthly_price_pence,
      };
    });

    // Validate the current provider price again before opening checkout.
    // Never charge a different amount, currency or billing interval to the quote.
    const currentPrice = await stripe().prices.retrieve(priceId);
    if (!matchesMonthlyPlanPrice(currentPrice, account.monthlyPricePence))
      throw new AccessError("UNAVAILABLE", 503);

    const origin = paymentReturnOrigin(request);
    const metadata = {
      glohaus_professional_id: account.professionalId,
      glohaus_plan_key: body.plan,
      glohaus_pricing_ack_version: PRICING_ACK_VERSION,
      glohaus_price_id: priceId,
      glohaus_monthly_price_pence: String(account.monthlyPricePence),
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
