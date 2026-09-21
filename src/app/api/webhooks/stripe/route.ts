import type Stripe from "stripe";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (
        session.payment_status === "paid" &&
        session.mode === "payment" &&
        session.metadata?.booking_id
      ) {
        const intent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.apply_checkout_payment($1,$2,$3,$4,$5,$6)", [
            event!.id,
            session.metadata!.booking_id,
            session.id,
            intent,
            session.amount_total,
            session.currency,
          ]),
        );
      }
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
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.sync_connect_account($1,$2)", [
          account.id,
          Boolean(account.charges_enabled && account.payouts_enabled),
        ]),
      );
    }
    return Response.json({ received: true });
  } catch {
    console.error("Stripe webhook processing failed");
    return new Response("Retry later", { status: 503 });
  }
}
