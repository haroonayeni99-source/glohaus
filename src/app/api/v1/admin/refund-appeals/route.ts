import { z } from "zod";
import { withAdmin } from "@/modules/admin/repository";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema = z
  .object({
    appealId: z.uuid(),
    approved: z.boolean(),
    percentage: z.number().int().min(0).max(100),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
type Resolution = {
  decisionId: string;
  amountPence: number;
  paymentIntentId: string;
  status: string;
};
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const input = parsed.data;
    const resolution = await withAdmin(
      async (db) =>
        (
          await db.query<{ resolution: Resolution }>(
            "SELECT beauty.resolve_refund_appeal($1,$2,$3,$4) AS resolution",
            [input.appealId, input.approved, input.percentage, input.reason],
          )
        ).rows[0].resolution,
    );
    if (resolution.amountPence > 0 && resolution.status === "queued") {
      const refund = await stripe().refunds.create(
        {
          payment_intent: resolution.paymentIntentId,
          amount: resolution.amountPence,
          reverse_transfer: true,
          metadata: { refund_decision_id: resolution.decisionId },
        },
        { idempotencyKey: `glohaus-refund-${resolution.decisionId}` },
      );
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)", [
          resolution.decisionId,
          refund.id,
          refund.amount,
          refund.status,
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id,
        ]),
      );
    }
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
