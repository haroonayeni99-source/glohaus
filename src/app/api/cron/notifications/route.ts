import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { withPaymentWorker } from "@/modules/payments/worker";
import {
  notificationEmail,
  productOrderNotificationEmail,
  type Notification,
  type ProductOrderNotification,
} from "@/modules/notifications/domain";

const DEFAULT_APP_URL = "https://glohaus.shop";
const DEFAULT_EMAIL_FROM = "GLOHAUS <noreply@glohaus.shop>";

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

  if (!process.env.RESEND_API_KEY)
    return new Response("Email not configured", { status: 503 });

  const appUrl = process.env.GLOHAUS_PUBLIC_URL?.trim() || DEFAULT_APP_URL;
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;

  try {
    const jobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<Notification>(
            "SELECT * FROM beauty.claim_notifications()",
          )
        ).rows,
    );
    const productJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<ProductOrderNotification>(
            "SELECT * FROM beauty.claim_product_order_notifications()",
          )
        ).rows,
    );

    const marketingJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<{
            id: string;
            campaign_id: string;
            email: string;
            subject: string;
            body: string;
            cta_url: string;
            unsubscribe_token: string;
          }>("SELECT * FROM beauty.claim_marketing_notifications()")
        ).rows,
    );

    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;
    for (const job of jobs) {
      try {
        const message = notificationEmail(job, appUrl);
        const result = await resend.emails.send(
          { from, to: job.email, ...message },
          { idempotencyKey: `glohaus-notification-${job.id}` },
        );
        if (result.error || !result.data?.id) throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_notification($1,true,$2)", [
            job.id,
            result.data.id,
          ]),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_notification($1,false,$2)", [
            job.id,
            null,
          ]),
        );
      }
    }
    for (const job of productJobs) {
      try {
        const message = productOrderNotificationEmail(job, appUrl);
        const result = await resend.emails.send(
          { from, to: job.email, ...message },
          { idempotencyKey: `glohaus-product-notification-${job.id}` },
        );
        if (result.error || !result.data?.id) throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.finish_product_order_notification($1,true,$2)",
            [job.id, result.data.id],
          ),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.finish_product_order_notification($1,false,$2)",
            [job.id, null],
          ),
        );
      }
    }

    for (const job of marketingJobs) {
      try {
        const cta = new URL(job.cta_url, appUrl).href;
        const unsubscribe = new URL(
          `/marketing/unsubscribe?token=${encodeURIComponent(job.unsubscribe_token)}`,
          appUrl,
        ).href;
        const result = await resend.emails.send(
          {
            from,
            to: job.email,
            subject: job.subject,
            text: `${job.body}\n\nOpen GLOHAUS: ${cta}\n\nThis is optional GLOHAUS marketing. Unsubscribe: ${unsubscribe}`,
          },
          { idempotencyKey: `glohaus-marketing-${job.id}` },
        );
        if (result.error || !result.data?.id) throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.finish_marketing_notification($1,true,$2)",
            [job.id, result.data.id],
          ),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query(
            "SELECT beauty.finish_marketing_notification($1,false,$2)",
            [job.id, null],
          ),
        );
      }
    }

    const summary = {
      processed: jobs.length + productJobs.length + marketingJobs.length,
      bookingJobs: jobs.length,
      productJobs: productJobs.length,
      marketingJobs: marketingJobs.length,
      sent,
    };

    await withPaymentWorker((db) =>
      db.query(
        "SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)",
        ["notifications", true, JSON.stringify(summary)],
      ),
    ).catch(() => {});

    return Response.json(summary);
  } catch {
    console.error("Notification worker failed");
    await withPaymentWorker((db) =>
      db.query(
        "SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)",
        ["notifications", false, JSON.stringify({ code: "WORKER_FAILED" })],
      ),
    ).catch(() => {});
    return new Response("Retry later", { status: 503 });
  }
}
