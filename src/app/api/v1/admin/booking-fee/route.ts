import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  amountPence: z.number().int().min(0).max(2500),
  promotionalFeePence: z.number().int().min(0).max(2500).optional(),
  promotionEnabled: z.boolean().optional(),
  reason: z.string().trim().min(5).max(500),
}).strict().refine(value => value.promotionalFeePence === undefined || value.promotionalFeePence <= value.amountPence);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withOwner((db) =>
      db.query(
        "SELECT beauty.owner_set_booking_fees($1,$2,$3,$4)",
        [
          parsed.data.amountPence,
          parsed.data.promotionalFeePence ?? null,
          parsed.data.reason,
          parsed.data.promotionEnabled ?? null,
        ],
      ),
    );

    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
