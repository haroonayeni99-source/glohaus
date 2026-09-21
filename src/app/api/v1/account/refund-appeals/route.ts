import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema = z
  .object({ bookingId: z.uuid(), reason: z.string().trim().min(5).max(500) })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.submit_refund_appeal($1,$2)", [
        parsed.data.bookingId,
        parsed.data.reason,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
