import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { stripe } from "@/modules/payments/stripe";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await withAccount("professional", async (db, account) => ({
      professionalId: account.professionalId!,
      stripeAccountId: (
        await db.query<{ stripe_account_id: string }>(
          "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0]?.stripe_account_id,
    }));
    let stripeAccountId = account.stripeAccountId;
    if (!stripeAccountId) {
      const created = await stripe().accounts.create(
        {
          type: "express",
          country: "GB",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { glohaus_professional_id: account.professionalId },
        },
        { idempotencyKey: `connect-${account.professionalId}` },
      );
      stripeAccountId = created.id;
      await withAccount("professional", (db) =>
        db.query(
          "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,$2) ON CONFLICT(professional_id) DO NOTHING",
          [account.professionalId, stripeAccountId],
        ),
      );
    }
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    const link = await stripe().accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      return_url: `${origin}/professional/profile?payments=returned`,
      refresh_url: `${origin}/professional/profile?payments=refresh`,
    });
    return json({ url: link.url });
  } catch (error) {
    return apiError(error);
  }
}
