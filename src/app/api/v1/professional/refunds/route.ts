import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
const schema = z
  .object({
    bookingId: z.uuid(),
    accepted: z.boolean(),
    percentage: z.number().int().min(0).max(100),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
type Decision = {
  id: string;
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
    const decision = await withAccount(
      "professional",
      async (db) =>
        (
          await db.query<{ decision: Decision }>(
            "SELECT beauty.decide_refund($1,$2,$3,$4) AS decision",
            [input.bookingId, input.accepted, input.percentage, input.reason],
          )
        ).rows[0].decision,
    );
    if (decision.amountPence > 0 && decision.status === "queued") {
      const refund = await stripe().refunds.create(
        {
          payment_intent: decision.paymentIntentId,
          amount: decision.amountPence,
          reverse_transfer: true,
          metadata: { refund_decision_id: decision.id },
        },
        { idempotencyKey: `glohaus-refund-${decision.id}` },
      );
      await withPaymentWorker((db) =>
        db.query("SELECT beauty.apply_refund_result($1,$2,$3,$4,$5)", [
          decision.id,
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
