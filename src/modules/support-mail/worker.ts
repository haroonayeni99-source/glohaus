import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { withPaymentWorker } from "@/modules/payments/worker";
import {
  SUPPORT_ADDRESS,
  SUPPORT_DESTINATION,
  caseReference,
  inboundDecision,
  mailbox,
  safeSubject,
} from "./domain";
const MAX_RAW = 24 * 1024 * 1024;
type Job = {
  id: string;
  provider_email_id: string;
  kind: "received" | "sent";
  thread_id: string | null;
  lease: string;
};
class Quarantine extends Error {}
// Fetch only provider-issued raw URLs, never URLs taken from email content or headers.
export async function originalEmail(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !(u.hostname === "cdn.resend.app" || u.hostname.endsWith(".cloudfront.net"))
  )
    throw new Quarantine("unsafe_original_location");
  const response = await fetch(u, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.body) throw Error("PROVIDER_UNAVAILABLE");
  if (Number(response.headers.get("content-length")) > MAX_RAW) {
    await response.body.cancel();
    throw new Quarantine("original_too_large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RAW) {
        await reader.cancel();
        throw new Quarantine("original_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function deliverSupportForwarding(client?: Resend) {
  if (
    process.env.SUPPORT_EMAIL_FORWARDING_ENABLED !== "true" ||
    !process.env.RESEND_API_KEY
  )
    return { enabled: false, processed: 0 };
  const resend = client ?? new Resend(process.env.RESEND_API_KEY);
  const jobs = await withPaymentWorker(
    async (db) =>
      (await db.query<Job>("SELECT * FROM beauty.claim_support_mail()")).rows,
  );
  const finish = async (
    job: Job,
    state: string,
    code: string,
    provider: string | null = null,
  ) =>
    withPaymentWorker((db) =>
      db.query("SELECT beauty.finish_support_mail($1,$2,$3,$4,$5)", [
        job.id,
        job.lease,
        state,
        code,
        provider,
      ]),
    );
  for (const job of jobs) {
    try {
      if (job.kind === "sent") {
        const { data: email, error } = await resend.emails.get(
          job.provider_email_id,
        );
        if (error || !email) throw Error("PROVIDER_UNAVAILABLE");
        const peer = email.to.length === 1 ? mailbox(email.to[0]) : null;
        if (
          mailbox(email.from) !== SUPPORT_ADDRESS ||
          !peer ||
          peer === SUPPORT_DESTINATION
        ) {
          await finish(job, "ignored", "not_customer_reply");
          continue;
        }
        const linked = await withPaymentWorker(
          async (db) =>
            (
              await db.query<{ data: { caseId: string | null } }>(
                "SELECT beauty.identify_support_mail($1,$2,NULL,$3,$4) AS data",
                [job.id, job.lease, caseReference(email.subject), peer],
              )
            ).rows[0].data,
        );
        await finish(
          job,
          linked.caseId ? "linked" : "ignored",
          linked.caseId ? "outgoing_metadata_recorded" : "outgoing_unmatched",
        );
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.record_support_mail_delivery($1,$2,now())", [
            job.provider_email_id,
            `email.${email.last_event}`,
          ]),
        );
        continue;
      }
      const result = await resend.emails.receiving.get(job.provider_email_id, {
        html_format: "cid",
      });
      if (result.error || !result.data) throw Error("PROVIDER_UNAVAILABLE");
      const email = result.data as typeof result.data & {
        authentication?: { dmarc?: string; dkim?: string } | null;
      };
      const decision = inboundDecision(email);
      if (decision.state !== "process") {
        await finish(job, decision.state, decision.reason);
        continue;
      }
      if (!email.message_id || !email.raw?.download_url)
        throw new Quarantine("original_unavailable");
      const fingerprint = createHash("sha256")
        .update(`${email.message_id}\n${decision.sender}\n${SUPPORT_ADDRESS}`)
        .digest("hex");
      const match = await withPaymentWorker(
        async (db) =>
          (
            await db.query<{
              data: {
                duplicate: boolean;
                held?: boolean;
                caseId: string | null;
              };
            }>("SELECT beauty.identify_support_mail($1,$2,$3,$4,$5) AS data", [
              job.id,
              job.lease,
              fingerprint,
              caseReference(email.subject),
              decision.sender,
            ])
          ).rows[0].data,
      );
      if (match.duplicate || ("held" in match && match.held)) continue;
      const raw = await originalEmail(email.raw.download_url);
      // Text preview is convenience only; the original MIME, formatting and every attachment are preserved intact.
      const preview =
        email.text?.slice(0, 60000) ??
        "This message uses HTML. Open original-message.eml to read the complete original message and its attachments.";
      const response = await resend.emails.send(
        {
          from: `GLOHAUS Support <${SUPPORT_ADDRESS}>`,
          to: SUPPORT_DESTINATION,
          replyTo: decision.sender!,
          subject: `${match.caseId ? `[GLOHAUS ${match.caseId}] ` : ""}${safeSubject(email.subject)}`,
          text: `Customer email received by ${SUPPORT_ADDRESS}\nOriginal sender: ${email.from}\nOriginal subject: ${safeSubject(email.subject)}\n${match.caseId ? `Support ticket: ${match.caseId}` : "No verified existing ticket match. Review before associating this message with a customer record."}\n\n${preview}\n\nThe complete original email and attachments are inside original-message.eml. Reply-To is the original sender. Check your Gmail From address is support@glohaus.shop before replying. Email sender authentication does not prove identity for account or data-rights decisions.`,
          attachments: [
            {
              filename: "original-message.eml",
              content: raw,
              contentType: "message/rfc822",
            },
          ],
          headers: {
            "X-GLOHAUS-Support-Forward": "1",
            "X-Loop": SUPPORT_ADDRESS,
            "Auto-Submitted": "auto-generated",
          },
        },
        { idempotencyKey: `glohaus-support-forward-${job.id}` },
      );
      if (response.error || !response.data?.id)
        throw Error("DELIVERY_NOT_CONFIRMED");
      await finish(job, "forwarded", "provider_accepted", response.data.id);
    } catch (error) {
      if (error instanceof Quarantine)
        await finish(job, "quarantined", error.message);
      else {
        await finish(job, "retry", "provider_retry_required");
        console.error("Support email processing deferred", {
          stage: "supportForwarding",
        });
      }
    }
  }
  return { enabled: true, processed: jobs.length };
}
