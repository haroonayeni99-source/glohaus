import { scheduleNotificationDelivery } from "@/modules/notifications/schedule";
import { reconcileBookingProviderCost } from "@/modules/commission/provider-cost";
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

  if (session.metadata?.booking_id) {
    await withPaymentWorker(async (db) => {
      await db.query(
        "SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)",
        [
          eventId,
          session.metadata!.booking_id,
          session.id,
          intent,
          session.amount_total,
          session.currency,
        ],
      );
      if (intent)
        await db.query("SELECT beauty.record_booking_payment_finance($1,$2)", [
          session.metadata!.booking_id,
          intent,
        ]);
    });
    if (intent)
      await reconcileBookingProviderCost(
        session.metadata.booking_id,
        intent,
      ).catch(() => {
        // Pricing/payment already reconciled. Maintenance retries unavailable Stripe fees.
        console.error("Booking provider fee reconciliation pending");
      });
  }
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
  eventAccount?: string,
) {
  const targetId = rawPayout.metadata?.glohaus_payout_id;
  if (!targetId) return;
  if (!eventAccount) throw new Error("PAYOUT_ACCOUNT_MISSING");
  const expected = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{
          stripe_account_id: string;
          bank_amount_pence: number;
          requested_pence: number;
          kind: string;
          provider_payout_id: string | null;
          provider_transfer_id: string | null;
        }>(
          `SELECT coalesce(r.stripe_account_id,a.stripe_account_id) AS stripe_account_id,
       p.bank_amount_pence,p.requested_pence,p.kind,p.provider_payout_id,p.provider_transfer_id
       FROM beauty.financial_payouts p JOIN beauty.professional_payment_accounts a ON a.professional_id=p.professional_id
       LEFT JOIN beauty.financial_payout_requests r ON r.payout_id=p.id WHERE p.id::text=$1`,
          [targetId],
        )
      ).rows[0],
  );
  if (!expected || expected.stripe_account_id !== eventAccount)
    throw new Error("PAYOUT_ACCOUNT_MISMATCH");
  // Retrieve current state to prevent an older delayed event overwriting a
  // later bank failure or cancellation. No payout is created by this read.
  const payout = (await stripe().payouts.retrieve(
    rawPayout.id,
    {},
    { stripeAccount: eventAccount },
  )) as ConnectPayout;
  const transferId = payout.metadata?.glohaus_transfer_id;
  if (
    payout.metadata?.glohaus_payout_id !== targetId ||
    payout.currency !== "gbp" ||
    payout.amount !== expected.bank_amount_pence ||
    payout.method !== expected.kind ||
    !transferId ||
    (expected.provider_payout_id &&
      expected.provider_payout_id !== payout.id) ||
    (expected.provider_transfer_id &&
      expected.provider_transfer_id !== transferId)
  )
    throw new Error("PAYOUT_DETAILS_MISMATCH");
  if (!["paid", "failed", "canceled"].includes(payout.status)) return;
  nextStatus =
    payout.status === "canceled"
      ? "cancelled"
      : (payout.status as "paid" | "failed");
  const transfer = await stripe().transfers.retrieve(transferId);
  const destination =
    typeof transfer.destination === "string"
      ? transfer.destination
      : transfer.destination?.id;
  if (
    destination !== eventAccount ||
    transfer.currency !== "gbp" ||
    transfer.amount !== expected.requested_pence ||
    transfer.metadata?.glohaus_payout_id !== targetId
  )
    throw new Error("PAYOUT_TRANSFER_MISMATCH");

  const applicationFeeId =
    typeof payout.application_fee === "string"
      ? payout.application_fee
      : payout.application_fee?.id;

  if (transferId)
    await withPaymentWorker((db) =>
      db.query("SELECT beauty.record_payout_provider($1,$2,$3,$4,$5,$6)", [
        targetId,
        transferId,
        payout.id,
        applicationFeeId ?? null,
        payout.application_fee_amount ?? 0,
        new Date(payout.arrival_date * 1000),
      ]),
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
    if (details.transferId && transfer.amount_reversed < transfer.amount)
      await stripe().transfers.createReversal(
        details.transferId,
        { amount: transfer.amount - transfer.amount_reversed },
        {
          idempotencyKey: `payout-transfer-reversal-${payout.id}`,
        },
      );
  }

  await withPaymentWorker((db) =>
    db.query("SELECT beauty.apply_payout_result($1,$2)", [
      payout.id,
      nextStatus,
    ]),
  );
  await withPaymentWorker((db) =>
    db.query(
      "UPDATE beauty.financial_payout_requests SET issue_code=NULL WHERE payout_id::text=$1",
      [targetId],
    ),
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
        await withPaymentWorker(async (db) => {
          await db.query(
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
          );
          await db.query("SELECT beauty.notify_product_dispute($1,$2,$3)", [
            intentId,
            dispute.id,
            dispute.status,
          ]);
        });
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncProfessionalSubscription(event.data.object);
    } else if (event.type === "payout.paid") {
      await applyPayoutEvent(event.data.object, "paid", event.account);
    } else if (event.type === "payout.failed") {
      await applyPayoutEvent(event.data.object, "failed", event.account);
    } else if (event.type === "payout.canceled") {
      await applyPayoutEvent(event.data.object, "cancelled", event.account);
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      const ready = Boolean(
        account.capabilities?.transfers === "active" && account.payouts_enabled,
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

    scheduleNotificationDelivery();
    return Response.json({ received: true });
  } catch {
    console.error("Stripe webhook processing failed");
    return new Response("Retry later", { status: 503 });
  }
}
