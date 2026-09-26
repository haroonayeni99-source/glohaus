import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  attachShopCheckoutSession,
  prepareShopCheckout,
  releaseUnattachedShopCheckout,
} from "@/modules/shop/repository";
import { paymentReady, stripe } from "@/modules/payments/stripe";

export async function POST(request: Request) {
  let checkoutId: string | null = null;

  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const prepared = await withAccount("customer", async (db, account) => ({
      checkout: await prepareShopCheckout(db),
      email: account.email,
    }));
    checkoutId = prepared.checkout.id;

    if (prepared.checkout.stripeSessionId) {
      const existing = await stripe().checkout.sessions.retrieve(
        prepared.checkout.stripeSessionId,
      );
      if (existing.status === "open" && existing.url)
        return json({ url: existing.url });
      if (existing.status === "complete")
        return json({ url: "/account/orders?checkout=processing" });
      throw new AccessError("INVALID_REQUEST", 409);
    }

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: prepared.email,
        billing_address_collection: "auto",
        shipping_address_collection: { allowed_countries: ["GB"] },
        line_items: prepared.checkout.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "gbp",
            unit_amount: item.pricePence,
            product_data: {
              name: item.name,
              description: `Sold by ${item.professionalName}`,
            },
          },
        })),
        metadata: {
          glohaus_shop_checkout_id: prepared.checkout.id,
        },
        payment_intent_data: {
          transfer_group: `shop_${prepared.checkout.id}`,
          metadata: {
            glohaus_shop_checkout_id: prepared.checkout.id,
          },
        },
        integration_identifier: prepared.checkout.integrationIdentifier,
        expires_at: expiresAt,
        success_url: `${origin}/account/orders?checkout=success`,
        cancel_url: `${origin}/cart?checkout=cancelled`,
      },
      { idempotencyKey: `shop-checkout-${prepared.checkout.id}` },
    );

    if (!session.url) throw new AccessError("UNAVAILABLE", 503);

    await withAccount("customer", (db) =>
      attachShopCheckoutSession(db, prepared.checkout.id, session.id),
    );

    return json({ url: session.url }, 201);
  } catch (error) {
    if (checkoutId)
      try {
        await withAccount("customer", (db) =>
          releaseUnattachedShopCheckout(db, checkoutId!),
        );
      } catch {}
    return apiError(error);
  }
}