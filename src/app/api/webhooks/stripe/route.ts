import type Stripe from "stripe";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";

function paymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
}

async function applyPaidSession(
  eventId: string,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== "paid" || session.mode !== "payment") return;

  const intent = paymentIntentId(session);
  const shopCheckoutId = session.metadata?.glohaus_shop_checkout_id;

  if (shopCheckoutId) {
    const shipping = session.collected_information?.shipping_details;
    await withPaymentWorker((db) =>
      db.query(
        "SELECT beauty.apply_shop_checkout_payment($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          eventId,
          shopCheckoutId,
          session.id,
          intent,
          session.amount_total,
          session.currency,
          JSON.stringify(shipping ?? null),
        ],
      ),
    );
    return;
  }

  if (session.metadata?.booking_id)
    await withPaymentWorker(async (db) => {
      await db.query("SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)", [
        eventId,
        session.metadata!.booking_id,
        session.id,
        intent,
        session.amount_total,
        session.currency,
      ]);
      if (intent)
        await db.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
          session.metadata!.booking_id,
          intent,
        ]);
    });
}

async function releaseShopSession(
  session: Stripe.Checkout.Session,
  status: "expired" | "failed",
) {
  const shopCheckoutId = session.metadata?.glohaus_shop_checkout_id;
  if (!shopCheckoutId) return;
  await withPaymentWorker((db) =>
    db.query("SELECT beauty.release_shop_checkout($1,$2,$3)", [
      shopCheckoutId,
      session.id,
      status,
    ]),
  );
}


async function applyPayoutEvent(
  payout: Stripe.Payout,
  nextStatus: "paid" | "failed" | "cancelled",
) {
  if (!payout.metadata?.glohaus_payout_id) return;

  if (nextStatus !== "paid") {
    const details = await withPaymentWorker(async (db) => {
      const result = await db.query<{
        data: {
          transferId: string | null;
          applicationFeeId: string | null;
          withdrawalFeePence: number;
          status: string;
        } | null;
      }>("SELECT beauty.payout_reversal_details($1) AS data", [payout.id]);
      return result.rows[0]?.data;
    });

    if (!details || ["failed", "cancelled"].includes(details.status)) return;

    if (details.applicationFeeId && details.withdrawalFeePence > 0)
      await stripe().applicationFees.createRefund(
        details.applicationFeeId,
        { amount: details.withdrawalFeePence },
        { idempotencyKey: `payout-fee-refund-${payout.id}` },
      );

    if (details.transferId)
      await stripe().transfers.createReversal(
        details.transferId,
        undefined,
        { idempotencyKey: `payout-transfer-reversal-${payout.id}` },
      );
  }

  await withPaymentWorker((db) =>
    db.query("SELECT beauty.apply_payout_result($1,$2)", [
      payout.id,
      nextStatus,
    ]),
  );
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (!signature || !secrets.length)
    return new Response("Unavailable", { status: 503 });

  let body: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response("Invalid body", { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) {
          await reader.cancel();
          return new Response("Body too large", { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    body = Buffer.concat(chunks).toString("utf8");
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  let event: Stripe.Event | undefined;
  for (const secret of secrets)
    try {
      event = stripe().webhooks.constructEvent(body, signature, secret);
      break;
    } catch {}

  if (!event) return new Response("Invalid signature", { status: 400 });

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await applyPaidSession(event.id, event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await releaseShopSession(event.data.object, "expired");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await releaseShopSession(event.data.object, "failed");
    } else if (
      event.type === "refund.updated" ||
      event.type === "refund.created"
    ) {
      const refund = event.data.object;
      if (refund.metadata?.refund_decision_id)
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)", [
            refund.metadata!.refund_decision_id,
            refund.id,
            refund.amount,
            refund.status,
            typeof refund.payment_intent === "string"
              ? refund.payment_intent
              : refund.payment_intent?.id,
          ]),
        );
    } else if (event.type === "payout.paid") {
      await applyPayoutEvent(event.data.object, "paid");
    } else if (event.type === "payout.failed") {
      await applyPayoutEvent(event.data.object, "failed");
    } else if (event.type === "payout.canceled") {
      await applyPayoutEvent(event.data.object, "cancelled");
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.sync_connect_account($1,$2)", [
          account.id,
          Boolean(
            account.capabilities?.transfers === "active" &&
              account.payouts_enabled,
          ),
        ]),
      );
    }

    return Response.json({ received: true });
  } catch {
    console.error("Stripe webhook processing failed");
    return new Response("Retry later", { status: 503 });
  }
}
