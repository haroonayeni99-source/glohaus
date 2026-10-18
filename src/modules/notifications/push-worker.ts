import "server-only";
import webPush from "web-push";
import { withPaymentWorker } from "@/modules/payments/worker";
import { isPushEndpoint, safeNotificationHref } from "./preferences";
export type PushJob = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notification_id: string;
  href: string;
  reminder_title?: string | null;
};
export function pushFailure(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : 0;
  return status === 404 || status === 410
    ? "expired"
    : !status || status === 429 || status >= 500
      ? "retry"
      : "failed";
}
export async function deliverPushNotifications() {
  const publicKey = process.env.VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject)
    return { configured: false, processed: 0, accepted: 0 };
  const jobs = await withPaymentWorker(
    async (db) =>
      (
        await db.query<PushJob>(
          "SELECT d.*,beauty.push_departure_heading(d.notification_id) AS reminder_title FROM beauty.claim_push_deliveries() d",
        )
      ).rows,
  );
  let accepted = 0;
  // Bounded concurrency keeps slow push providers from consuming the cron budget.
  for (let start = 0; start < jobs.length; start += 5) {
    await Promise.all(
      jobs.slice(start, start + 5).map(async (job) => {
        let result = "failed";
        try {
          if (!isPushEndpoint(job.endpoint))
            throw new Error("INVALID_ENDPOINT");
          await webPush.sendNotification(
            {
              endpoint: job.endpoint,
              keys: { p256dh: job.p256dh, auth: job.auth },
            },
            JSON.stringify({
              title: job.href.startsWith("/account/bookings/")
                ? "GLOHAUS appointment update"
                : "GLOHAUS professional update",
              body: "You have a new update. Open your dashboard to view it securely.",
              departureReminder: [
                "Leave in approximately 15 minutes",
                "Leave in approximately 5 minutes",
                "It’s time to leave for your appointment",
              ].includes(job.reminder_title || "")
                ? job.reminder_title
                : undefined,
              tag: `glohaus-${job.notification_id}`,
              href: safeNotificationHref(job.href),
            }),
            {
              vapidDetails: { subject, publicKey, privateKey },
              TTL: 3600,
              timeout: 5000,
              urgency: "normal",
            },
          );
          result = "accepted";
          accepted++;
        } catch (error) {
          result = isPushEndpoint(job.endpoint) ? pushFailure(error) : "failed";
        }
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.finish_push_delivery($1,$2)", [
            job.id,
            result,
          ]),
        );
      }),
    );
  }
  return { configured: true, processed: jobs.length, accepted };
}
