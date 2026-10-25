import { Resend } from "resend";
import { after } from "next/server";
import { withPaymentWorker } from "@/modules/payments/worker";
import {
  supportMailEvent,
  supportDeliveryEvent,
} from "@/modules/support-mail/domain";
import { deliverSupportForwarding } from "@/modules/support-mail/worker";
export const maxDuration = 60;
export async function POST(request: Request) {
  const key = process.env.RESEND_API_KEY,
    secret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET;
  if (!key || !secret || !process.env.PAYMENT_DATABASE_URL)
    return new Response("Unavailable", { status: 503 });
  const id = request.headers.get("svix-id"),
    timestamp = request.headers.get("svix-timestamp"),
    signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature)
    return new Response("Invalid webhook", { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Invalid webhook", { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 524288) {
        await reader.cancel();
        return new Response("Too large", { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let verified: unknown;
  try {
    verified = new Resend(key).webhooks.verify({
      payload: Buffer.concat(chunks).toString("utf8"),
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  const event = supportMailEvent(verified);
  const delivery = supportDeliveryEvent(verified);
  try {
    if (event) {
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.queue_support_mail($1,$2,$3)", [
          event.emailId,
          event.kind,
          event.threadId,
        ]),
      );
      after(async () => {
        try {
          await deliverSupportForwarding();
        } catch {
          console.error("Support email queued for retry");
        }
      });
    } else if (
      delivery &&
      delivery.providerEventAt &&
      Number.isFinite(Date.parse(delivery.providerEventAt))
    )
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.record_support_mail_delivery($1,$2,$3)", [
          delivery.providerEmailId,
          delivery.providerEventType,
          delivery.providerEventAt,
        ]),
      );
    return new Response("OK", { status: 200 });
  } catch {
    console.error("Support email webhook unavailable");
    return new Response("Retry later", { status: 503 });
  }
}
