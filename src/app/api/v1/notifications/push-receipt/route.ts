import { z } from "zod";
import { json, smallJson } from "@/lib/http";
import { verifyPushReceiptToken } from "@/modules/notifications/device-receipts";
import { withPaymentWorker } from "@/modules/payments/worker";
const schema = z
  .object({
    token: z.string().max(500),
    kind: z.enum(["displayed", "clicked"]),
  })
  .strict();
export async function POST(request: Request) {
  // Scoped bearer capability, not a login cookie. No personal information is
  // returned and token contents cannot select another delivery or operation.
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: { code: "INVALID_REQUEST" } }, 415);
    const input = schema.safeParse(await smallJson(request, 1024));
    if (!input.success)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const id = verifyPushReceiptToken(input.data.token);
    if (!id) return json({ error: { code: "UNAUTHENTICATED" } }, 401);
    await withPaymentWorker((db) =>
      db.query("SELECT beauty.record_push_device_receipt($1,$2)", [
        id,
        input.data.kind,
      ]),
    );
    return json({ recorded: true });
  } catch {
    return json({ error: { code: "UNAVAILABLE" } }, 503);
  }
}
