import type Stripe from "stripe";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
import { paymentWebhookSecrets } from "@/modules/payments/webhook-secrets";

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

function subscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled") return "cancelled";
  return "past_due";
}

async function syncProfessionalSubscription(subscription: Stripe.Subscription) {
  const professionalId = subscription.metadata?.glohaus_professional_id;
  const planKey = subscription.metadata?.glohaus_plan_key;
  const pricingAck =
    subscription.metadata?.glohaus_pricing_ack_version ??
    "professional-pricing-v1";
  const priceId =
    subscription.items.data[0]?.price.id ??
    subscription.metadata?.glohaus_price_id;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  if (!professionalId || !planKey || !priceId) return;

  await withPaymentWorker((db) =>
    db.query(
      "SELECT beauty.apply_professional_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        professionalId,
        planKey,
        customerId,
        subscription.id,
        priceId,
        subscriptionStatus(subscription.status),
        null,
        Boolean(subscription.cancel_at || subscription.cancel_at_period_end),
        pricingAck,
      ],
    ),
  );
}

async function applyProfessionalPlanCheckout(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription" || !session.subscription) return;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const subscription = await stripe().subscriptions.retrieve(subscriptionId);
  await syncProfessionalSubscription(subscription);
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


type ConnectPayout = Stripe.Payout & {
  application_fee?: string | Stripe.ApplicationFee | null;
  application_fee_amount?: number | null;
};

async function applyPayoutEvent(
  rawPayout: Stripe.Payout,
  nextStatus: "paid" | "failed" | "cancelled",
) {
  const payout = rawPayout as ConnectPayout;
  const targetId = payout.metadata?.glohaus_payout_id;
  const transferId = payout.metadata?.glohaus_transfer_id;
  if (!targetId) return;

  const applicationFeeId =
    typeof payout.application_fee === "string"
      ? payout.application_fee
      : payout.application_fee?.id;

  if (transferId)
    await withPaymentWorker((db) =>
      db.query(
        "SELECT beauty.record_payout_provider($1,$2,$3,$4,$5,$6)",
        [
          targetId,
          transferId,
          payout.id,
          applicationFeeId ?? null,
          payout.application_fee_amount ?? 0,
          new Date(payout.arrival_date * 1000),
        ],
      ),
    );

  if (nextStatus !== "paid") {
    const details = await withPaymentWorker(async (db) => {
      const result = await db.query<{
        data: {
          transferId: string | null;
          status: string;
        } | null;
      }>("SELECT beauty.payout_reversal_details($1) AS data", [payout.id]);
      return result.rows[0]?.data;
    });

    if (!details || ["failed", "cancelled"].includes(details.status)) return;

    // Stripe automatically refunds Instant Payout application fees when the
    // payout fails. Only reverse the GLOHAUS transfer back to the platform.
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
  const secrets = await paymentWebhookSecrets();
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
      await applyProfessionalPlanCheckout(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await releaseShopSession(event.data.object, "expired");
    } else if (event.type === "checkout.session.async_payment_failed") {
      await releaseShopSession(event.data.object, "failed");
    } else if (
      event.type === "refund.updated" ||
      event.type === "refund.created"
    ) {
      const refund = event.data.object;
      const intentId =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id;

      if (refund.metadata?.refund_decision_id)
        await withPaymentWorker(async (db) => {
          await db.query("SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)", [
            refund.metadata!.refund_decision_id,
            refund.id,
            refund.amount,
            refund.status,
            intentId,
          ]);
          await db.query("SELECT beauty.record_booking_refund_finance($1)", [
            refund.metadata!.refund_decision_id,
          ]);
        });
      else if (refund.metadata?.product_order_refund_id)
        await withPaymentWorker(async (db) => {
          await db.query(
            "SELECT beauty.apply_product_order_refund_result($1,$2,$3,$4,$5)",
            [
              refund.metadata!.product_order_refund_id,
              refund.id,
              refund.amount,
              refund.status,
              intentId,
            ],
          );
          await db.query(
            "SELECT beauty.record_product_order_refund_finance($1)",
            [refund.metadata!.product_order_refund_id],
          );
        });
      else if (intentId)
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.reconcile_external_booking_refund($1,$2,$3,$4,$5)",
            [event.id, refund.id, refund.amount, refund.status, intentId],
          ),
        );
    } else if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed"
    ) {
      const dispute = event.data.object;
      const intentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;

      if (intentId)
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.sync_booking_dispute($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              event.id,
              dispute.id,
              intentId,
              dispute.amount,
              dispute.currency,
              dispute.status,
              dispute.reason ?? null,
              dispute.evidence_details?.due_by ?? null,
            ],
          ),
        );
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncProfessionalSubscription(event.data.object);
    } else if (event.type === "payout.paid") {
      await applyPayoutEvent(event.data.object, "paid");
    } else if (event.type === "payout.failed") {
      await applyPayoutEvent(event.data.object, "failed");
    } else if (event.type === "payout.canceled") {
      await applyPayoutEvent(event.data.object, "cancelled");
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      const ready = Boolean(
        account.capabilities?.transfers === "active" &&
          account.payouts_enabled,
      );
      await withPaymentWorker(async (db) => {
        await db.query("SELECT beauty.sync_connect_account($1,$2)", [
          account.id,
          ready,
        ]);
        await db.query("SELECT beauty.sync_connect_verification($1,$2)", [
          account.id,
          ready,
        ]);
      });
    }

    return Response.json({ received: true });
  } catch {
    console.error("Stripe webhook processing failed");
    return new Response("Retry later", { status: 503 });
  }
}
