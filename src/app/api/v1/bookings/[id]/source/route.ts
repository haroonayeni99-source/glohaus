import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const parsed = z
      .union([
        z
          .object({
            action: z.literal("dispute"),
            reason: z.string().trim().min(10).max(1000),
          })
          .strict(),
        z
          .object({
            source: z.enum([
              "existing_professional",
              "new_professional",
              "glohaus",
              "unknown",
              "disputed",
            ]),
            confirmed: z.literal(true),
          })
          .strict(),
      ])
      .safeParse(await smallJson(request, 2048));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    if ("action" in parsed.data) {
      const reason = parsed.data.reason;
      await withAccount("professional", (db) =>
        db.query("SELECT beauty.dispute_customer_acquisition($1,$2)", [
          id,
          reason,
        ]),
      );
      return json({ saved: true });
    }
    const source = parsed.data.source;
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.confirm_customer_acquisition($1,$2)", [
        id,
        source,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
