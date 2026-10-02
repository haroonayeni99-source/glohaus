import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  amountPence: z.number().int().min(0).max(2500),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withOwner((db) =>
      db.query(
        "SELECT beauty.set_financial_fee_rule($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          "booking",
          null,
          "customer",
          0,
          parsed.data.amountPence,
          0,
          null,
          1,
          "platform",
          parsed.data.reason,
        ],
      ),
    );

    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
