import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";
import {
  releaseMatureBookingProceeds,
  releaseMatureProductProceeds,
} from "@/modules/finance/repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const account = await withAccount("professional", async (db, account) => {
      await releaseMatureProductProceeds(db);
      await releaseMatureBookingProceeds(db);

      const paymentAccount = (
        await db.query<{ stripe_account_id: string; charges_enabled: boolean }>(
          "SELECT stripe_account_id,charges_enabled FROM beauty.professional_payment_accounts WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0];

      if (!paymentAccount?.stripe_account_id)
        throw new AccessError("ONBOARDING_REQUIRED", 409);
      if (!paymentAccount.charges_enabled)
        throw new AccessError("UNAVAILABLE", 409);

      return { stripeAccountId: paymentAccount.stripe_account_id };
    });

    const link = await stripe().accounts.createLoginLink(
      account.stripeAccountId,
    );
    return json({ url: link.url });
  } catch (error) {
    return apiError(error);
  }
}
