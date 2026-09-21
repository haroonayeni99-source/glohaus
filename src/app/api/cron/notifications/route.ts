import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { withPaymentWorker } from "@/modules/payments/worker";
import {
  notificationEmail,
  type Notification,
} from "@/modules/notifications/domain";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.NEXT_PUBLIC_APP_URL
  )
    return new Response("Email not configured", { status: 503 });
  try {
    const jobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<Notification>(
            "SELECT * FROM beauty.claim_notifications()",
          )
        ).rows,
    );
    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;
    for (const job of jobs) {
      try {
        const message = notificationEmail(job, process.env.NEXT_PUBLIC_APP_URL);
        const result = await resend.emails.send(
          { from: process.env.EMAIL_FROM, to: job.email, ...message },
          { idempotencyKey: `glohaus-notification-${job.id}` },
        );
        if (result.error) throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_notification($1,true)", [job.id]),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_notification($1,false)", [job.id]),
        );
      }
    }
    return Response.json({ processed: jobs.length, sent });
  } catch {
    console.error("Notification worker failed");
    return new Response("Retry later", { status: 503 });
  }
}
