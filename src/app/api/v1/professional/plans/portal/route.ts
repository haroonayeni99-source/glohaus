import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const customerId = await withAccount(
      "professional",
      async (db, account) => {
        const row = (
          await db.query<{ provider_customer_id: string | null }>(
            `SELECT provider_customer_id
             FROM beauty.professional_subscriptions
             WHERE professional_id=$1
               AND provider_customer_id IS NOT NULL`,
            [account.professionalId],
          )
        ).rows[0];

        if (!row?.provider_customer_id)
          throw new AccessError("ONBOARDING_REQUIRED", 409);
        return row.provider_customer_id;
      },
    );

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/professional/plans`,
    });

    return json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
