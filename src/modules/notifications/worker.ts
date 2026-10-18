import "server-only";
import { refreshJourneyRoutes } from "@/modules/journey-routing/worker";
import { deliverPushNotifications } from "@/modules/notifications/push-worker";
import { safeNotificationHref } from "@/modules/notifications/preferences";
import {
  engagementEmail,
  type EngagementEmail,
} from "@/modules/professional-activity/repository";
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
export async function runNotificationWorker() {
  let push:
    Awaited<ReturnType<typeof deliverPushNotifications>> | { error: string };
  try {
    await refreshJourneyRoutes();
    await withPaymentWorker(async (db) => {
      await db.query("SELECT beauty.prepare_arrival_reminders()");
      await db.query("SELECT beauty.prepare_professional_notifications()");
      await db.query("SELECT beauty.prepare_professional_promotions()");
    });
    push = await deliverPushNotifications();
  } catch {
    push = { error: "PUSH_WORKER_FAILED" };
  }
  if (!process.env.RESEND_API_KEY) {
    await withPaymentWorker((db) =>
      db.query("SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)", [
        "notifications",
        false,
        JSON.stringify({ code: "EMAIL_NOT_CONFIGURED", push }),
      ]),
    ).catch(() => {});
    return Response.json({ emailConfigured: false, push }, { status: 503 });
  }

  const appUrl = process.env.GLOHAUS_PUBLIC_URL?.trim() || DEFAULT_APP_URL;
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;

  try {
    const jobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<Notification>(
            "SELECT n.*,beauty.notification_booking_policy(n.booking_id) AS accepted_policy FROM beauty.claim_notifications() n",
          )
        ).rows,
    );
    const productJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<ProductOrderNotification>(
            "SELECT n.*,beauty.notification_product_summary(n.product_order_id) AS product_summary FROM beauty.claim_product_order_notifications() n",
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

    const commissionJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<{ id: string; email: string; body: string }>(
            "SELECT * FROM beauty.claim_commission_notices()",
          )
        ).rows,
    );
    const activityJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<EngagementEmail>(
            "SELECT * FROM beauty.claim_professional_activity_emails()",
          )
        ).rows,
    );
    const professionalJobs = await withPaymentWorker(
      async (db) =>
        (
          await db.query<{
            id: string;
            email: string;
            title: string;
            body: string;
            href: string;
          }>("SELECT * FROM beauty.claim_professional_alert_emails()")
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
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
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
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
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
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_marketing_notification($1,true,$2)", [
            job.id,
            result.data.id,
          ]),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_marketing_notification($1,false,$2)", [
            job.id,
            null,
          ]),
        );
      }
    }

    for (const job of commissionJobs) {
      try {
        const result = await resend.emails.send(
          {
            from,
            to: job.email,
            subject: "Your GLOHAUS service commission notice",
            text: `${job.body}\n\nReview your commission: ${new URL("/professional/commission", appUrl).href}`,
          },
          { idempotencyKey: `glohaus-commission-notice-${job.id}` },
        );
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_commission_notice($1,$2)", [
            job.id,
            result.data!.id,
          ]),
        );
        sent++;
      } catch {
        console.error("Commission notice delivery pending");
      }
    }

    for (const job of activityJobs) {
      try {
        const result = await resend.emails.send(
          { from, to: job.email, ...engagementEmail(job, appUrl) },
          { idempotencyKey: `glohaus-activity-${job.id}` },
        );
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_professional_activity_email($1,$2)", [
            job.id,
            result.data!.id,
          ]),
        );
        sent++;
      } catch {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_professional_activity_email($1,$2)", [
            job.id,
            null,
          ]),
        );
      }
    }

    for (const job of professionalJobs) {
      try {
        const result = await resend.emails.send(
          {
            from,
            to: job.email,
            subject: `GLOHAUS · ${job.title}`,
            text: `${job.body}\n\nOpen securely: ${new URL(safeNotificationHref(job.href), appUrl).href}\n\nThe GLOHAUS team`,
          },
          { idempotencyKey: `glohaus-notification-${job.id}` },
        );
        if (result.error || !result.data?.id)
          throw new Error("DELIVERY_FAILED");
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_notification($1,true,$2)", [
            job.id,
            result.data!.id,
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
    const summary = {
      push,
      professionalJobs: professionalJobs.length,
      processed:
        jobs.length +
        productJobs.length +
        marketingJobs.length +
        commissionJobs.length +
        activityJobs.length +
        professionalJobs.length,
      activityJobs: activityJobs.length,
      commissionJobs: commissionJobs.length,
      bookingJobs: jobs.length,
      productJobs: productJobs.length,
      marketingJobs: marketingJobs.length,
      sent,
    };

    await withPaymentWorker((db) =>
      db.query("SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)", [
        "notifications",
        !("error" in push),
        JSON.stringify(summary),
      ]),
    ).catch((error) => {
      console.error("Failed to record notification worker health", error);
    });

    return Response.json(summary);
  } catch {
    console.error("Notification worker failed");
    await withPaymentWorker((db) =>
      db.query("SELECT beauty.record_backend_job_run($1,$2,$3::jsonb)", [
        "notifications",
        false,
        JSON.stringify({ code: "WORKER_FAILED" }),
      ]),
    ).catch((error) => {
      console.error(
        "Failed to record notification worker failure health",
        error,
      );
    });
    return new Response("Retry later", { status: 503 });
  }
}
