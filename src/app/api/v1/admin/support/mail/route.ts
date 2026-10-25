import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { Resend } from "resend";
import { after } from "next/server";
import { deliverSupportForwarding } from "@/modules/support-mail/worker";
import { inboundDecision } from "@/modules/support-mail/domain";
import { apiError, json, assertSameOrigin, smallJson } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("caseId");
    if (id && !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const data = await withOwner(
      async (db) =>
        (
          await db.query<{ data: Record<string, unknown> }>(
            "SELECT beauty.owner_support_mail_overview($1) AS data",
            [id || null],
          )
        ).rows[0].data,
    );
    return json({
      ...data,
      enabled: process.env.SUPPORT_EMAIL_FORWARDING_ENABLED === "true",
      configured: Boolean(
        process.env.SUPPORT_EMAIL_WEBHOOK_SECRET &&
        process.env.SUPPORT_EMAIL_API_KEY,
      ),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = z
      .object({ emailId: z.uuid() })
      .strict()
      .safeParse(await smallJson(request));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner(async () => true);
    if (
      process.env.SUPPORT_EMAIL_FORWARDING_ENABLED !== "true" ||
      !process.env.RESEND_API_KEY
    )
      throw new AccessError("UNAVAILABLE", 503);
    const result = await new Resend(
      process.env.SUPPORT_EMAIL_API_KEY ?? process.env.RESEND_API_KEY,
    ).emails.receiving.get(input.data.emailId, { html_format: "cid" });
    if (result.error || !result.data)
      throw new AccessError("INVALID_REQUEST", 400);
    const decision = inboundDecision(
      result.data as typeof result.data & {
        authentication?: { dmarc?: string; dkim?: string } | null;
      },
    );
    if (decision.state !== "process" || !result.data.raw?.download_url)
      return json(
        { queued: false, reviewRequired: true, reason: decision.reason },
        409,
      );
    await withOwner((db) =>
      db.query("SELECT beauty.owner_queue_support_mail($1)", [
        input.data.emailId,
      ]),
    );
    after(async () => {
      try {
        await deliverSupportForwarding();
      } catch {
        console.error("Existing support email queued for retry");
      }
    });
    return json({ queued: true }, 202);
  } catch (e) {
    return apiError(e);
  }
}
