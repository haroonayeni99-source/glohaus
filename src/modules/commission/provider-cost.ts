import "server-only";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
/** Read Stripe's settled fee; no estimates enter accounting and no provider mutation occurs. */
export async function reconcileBookingProviderCost(
  bookingId: string,
  intentId: string,
) {
  const intent = await stripe().paymentIntents.retrieve(intentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge = intent.latest_charge;
  if (
    !charge ||
    typeof charge === "string" ||
    !charge.balance_transaction ||
    typeof charge.balance_transaction === "string"
  )
    return false;
  const transaction = charge.balance_transaction;
  if (
    intent.metadata.booking_id !== bookingId ||
    intent.currency !== "gbp" ||
    charge.currency !== "gbp" ||
    transaction.currency !== "gbp" ||
    charge.payment_intent !== intentId ||
    transaction.amount !== charge.amount
  )
    throw new Error("PAYMENT_MISMATCH");
  await withPaymentWorker((db) =>
    db.query(
      "SELECT beauty.reconcile_booking_provider_cost($1,$2,$3,$4,$5,$6)",
      [
        bookingId,
        intentId,
        transaction.id,
        charge.amount,
        transaction.fee,
        transaction.currency,
      ],
    ),
  );
  return true;
}
export async function retryBookingProviderCosts() {
  const rows = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{ booking_id: string; intent_id: string }>(
          "SELECT * FROM beauty.pending_booking_provider_costs()",
        )
      ).rows,
  );
  let recorded = 0;
  for (const row of rows) {
    try {
      if (await reconcileBookingProviderCost(row.booking_id, row.intent_id))
        recorded++;
    } catch {
      console.error("Booking provider fee reconciliation pending");
    }
  }
  return { pending: rows.length, recorded };
}
