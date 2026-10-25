import "server-only";
import type { Resend } from "resend";
import { withPaymentWorker } from "@/modules/payments/worker";
// Operational alerts only. Gmail is a recipient, not a synchronised inbound inbox.
export async function deliverSupportNotifications(
  resend: Resend,
  from: string,
) {
  const jobs = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{ id: string; request_id: string; kind: string }>(
          "SELECT * FROM beauty.claim_support_emails()",
        )
      ).rows,
  );
  let accepted = 0;
  for (const job of jobs) {
    let provider: string | null = null;
    try {
      const response = await resend.emails.send(
        {
          from,
          to: "glohausuk@gmail.com",
          subject: `GLOHAUS support: ${job.kind} · ${job.request_id}`,
          text: `Support ticket ${job.request_id} requires attention.

Review the private case in the Owner/Admin Support inbox:
https://www.glohaus.shop/admin#support

Customer messages and evidence are available after staff sign-in. Gmail replies are not synchronised with the dashboard.`,
        },
        { idempotencyKey: `glohaus-support-${job.id}` },
      );
      if (response.error || !response.data?.id) throw Error("DELIVERY_FAILED");
      provider = response.data.id;
    } catch {
      console.error("Support notification delivery pending", {
        stage: "supportEmail",
      });
    }
    await withPaymentWorker((db) =>
      db.query("SELECT beauty.finish_support_email($1,$2)", [job.id, provider]),
    );
    if (provider) accepted++;
  }
  const backlog = await withPaymentWorker(
    async (db) =>
      (
        await db.query<{ queued: number; retrying: number; exhausted: number }>(
          `SELECT count(*)::integer AS queued,
       count(*) FILTER(WHERE attempts BETWEEN 1 AND 7 AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes'))::integer AS retrying,
       count(*) FILTER(WHERE attempts>=8 AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes'))::integer AS exhausted
       FROM beauty.support_email_jobs WHERE accepted_at IS NULL`,
        )
      ).rows[0] ?? { queued: 0, retrying: 0, exhausted: 0 },
  );
  // Provider acceptance is not delivery. Counts contain no ticket/customer data.
  return { processed: jobs.length, accepted, ...backlog };
}
