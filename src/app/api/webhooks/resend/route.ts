import { Resend } from "resend";
import { withPaymentWorker } from "@/modules/payments/worker";
import { providerEmailEvent } from "@/modules/notifications/provider-events";

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret || !process.env.PAYMENT_DATABASE_URL)
    return new Response("Email webhook not configured", { status: 503 });

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature)
    return new Response("Invalid webhook", { status: 400 });

  const payload = await request.text();
  const resend = new Resend(apiKey);

  let verified: unknown;
  try {
    verified = await resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }

  const event = providerEmailEvent(verified);
  if (!event) return new Response("Ignored", { status: 200 });

  try {
    await withPaymentWorker((db) =>
      db.query(
        "SELECT beauty.record_email_provider_event($1,$2,$3,$4,$5)",
        [
          id,
          event.providerEmailId,
          event.providerEventType,
          event.providerEventAt,
          event.recipientEmail,
        ],
      ),
    );
    return new Response("OK", { status: 200 });
  } catch {
    console.error("Email webhook processing failed");
    return new Response("Retry later", { status: 503 });
  }
}
