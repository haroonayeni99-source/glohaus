import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";
import {
  releaseMatureBookingProceeds,
  releaseMatureProductProceeds,
} from "@/modules/finance/repository";
import { withPaymentWorker } from "@/modules/payments/worker";

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

      const productTransfers = (
        await db.query<{
          id: string;
          checkout_reference: string;
          provider_payment_intent_id: string;
          professional_proceeds_pence: number;
        }>(
          `SELECT
             id,checkout_reference,provider_payment_intent_id,
             professional_proceeds_pence
           FROM beauty.product_orders
           WHERE professional_id=$1
             AND status='delivered'
             AND delivered_at IS NOT NULL
             AND delivered_at<=now()-interval '48 hours'
             AND professional_proceeds_pence>0
             AND stripe_transfer_id IS NULL
           ORDER BY delivered_at,id
           LIMIT 20`,
          [account.professionalId],
        )
      ).rows;

      const bookingTransfers = (
        await db.query<{
          id: string;
          stripe_payment_intent_id: string;
          professional_proceeds_pence: number;
        }>(
          `SELECT
             b.id,p.stripe_payment_intent_id,
             q.professional_proceeds_pence
           FROM beauty.bookings b
           JOIN beauty.payments p ON p.booking_id=b.id
           JOIN beauty.financial_quotes q ON q.booking_id=b.id
           WHERE b.professional_id=$1
             AND b.status='completed'
             AND b.completed_at IS NOT NULL
             AND b.completed_at<=now()-interval '24 hours'
             AND p.status='paid'
             AND p.refunded_pence=0
             AND p.stripe_transfer_id IS NULL
             AND p.stripe_payment_intent_id IS NOT NULL
             AND q.professional_proceeds_pence>0
             AND EXISTS(
               SELECT 1 FROM beauty.financial_ledger_transactions t
               WHERE t.event_reference='booking-release:'||b.id::text
             )
           ORDER BY b.completed_at,b.id
           LIMIT 20`,
          [account.professionalId],
        )
      ).rows;

      return {
        stripeAccountId: paymentAccount.stripe_account_id,
        productTransfers,
        bookingTransfers,
      };
    });

    for (const candidate of account.productTransfers) {
      const intent = await stripe().paymentIntents.retrieve(
        candidate.provider_payment_intent_id,
      );
      const sourceTransaction =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : intent.latest_charge?.id;
      if (!sourceTransaction) throw new AccessError("UNAVAILABLE", 503);

      const transfer = await stripe().transfers.create(
        {
          amount: candidate.professional_proceeds_pence,
          currency: "gbp",
          destination: account.stripeAccountId,
          source_transaction: sourceTransaction,
          transfer_group: `shop_${candidate.checkout_reference}`,
          metadata: {
            glohaus_product_order_id: candidate.id,
          },
        },
        { idempotencyKey: `product-order-transfer-${candidate.id}` },
      );

      await withPaymentWorker((db) =>
        db.query("SELECT beauty.record_product_transfer($1,$2,$3)", [
          candidate.id,
          transfer.id,
          candidate.professional_proceeds_pence,
        ]),
      );
    }

    for (const candidate of account.bookingTransfers) {
      const intent = await stripe().paymentIntents.retrieve(
        candidate.stripe_payment_intent_id,
      );
      const sourceTransaction =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : intent.latest_charge?.id;
      if (!sourceTransaction) throw new AccessError("UNAVAILABLE", 503);

      const transfer = await stripe().transfers.create(
        {
          amount: candidate.professional_proceeds_pence,
          currency: "gbp",
          destination: account.stripeAccountId,
          source_transaction: sourceTransaction,
          transfer_group: `booking_${candidate.id}`,
          metadata: {
            glohaus_booking_id: candidate.id,
          },
        },
        { idempotencyKey: `booking-transfer-${candidate.id}` },
      );

      await withPaymentWorker((db) =>
        db.query("SELECT beauty.record_booking_transfer($1,$2,$3)", [
          candidate.id,
          transfer.id,
          candidate.professional_proceeds_pence,
        ]),
      );
    }

    const link = await stripe().accounts.createLoginLink(
      account.stripeAccountId,
    );
    return json({
      url: link.url,
      transfersCreated:
        account.productTransfers.length + account.bookingTransfers.length,
    });
  } catch (error) {
    return apiError(error);
  }
}
