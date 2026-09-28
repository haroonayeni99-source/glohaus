import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { stripe } from "@/modules/payments/stripe";

const complianceSchema = z
  .object({
    adultConfirmed: z.literal(true),
    professionalTermsAccepted: z.literal(true),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = complianceSchema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const account = await withAccount("professional", async (db, account) => ({
      professionalId: account.professionalId!,
      stripeAccountId: (
        await db.query<{ stripe_account_id: string }>(
          "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0]?.stripe_account_id,
    }));

    const complianceMetadata = {
      glohaus_professional_id: account.professionalId,
      glohaus_adult_attested: "true",
      glohaus_professional_terms: "professional-terms-v1",
      glohaus_compliance_acknowledged_at: new Date().toISOString(),
    };

    let stripeAccountId = account.stripeAccountId;
    if (!stripeAccountId) {
      const created = await stripe().accounts.create(
        {
          country: "GB",
          controller: {
            fees: { payer: "application" },
            losses: { payments: "application" },
            stripe_dashboard: { type: "express" },
          },
          capabilities: {
            transfers: { requested: true },
          },
          settings: {
            payouts: {
              schedule: { interval: "manual" },
            },
          },
          metadata: complianceMetadata,
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
    } else {
      await stripe().accounts.update(stripeAccountId, {
        metadata: complianceMetadata,
      });
    }

    if (!process.env.NEXT_PUBLIC_APP_URL)
      throw new AccessError("UNAVAILABLE", 503);
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
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
