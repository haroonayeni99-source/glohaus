import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const account = await withAccount("professional", async (db, account) => {
      const row = (
        await db.query<{ stripe_account_id: string }>(
          "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0];
      if (!row?.stripe_account_id)
        throw new AccessError("ONBOARDING_REQUIRED", 409);
      return row.stripe_account_id;
    });

    const link = await stripe().accounts.createLoginLink(account);
    return json({ url: link.url });
  } catch (error) {
    return apiError(error);
  }
}
