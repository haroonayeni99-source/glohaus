import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  professionalId: z.uuid(),
  percentage: z.number().min(0).max(40).nullable(),
  expiresAt: z.string().datetime().nullable(),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const basisPoints =
      parsed.data.percentage === null
        ? null
        : Math.round(parsed.data.percentage * 100);

    await withOwner((db) =>
      db.query(
        "SELECT beauty.owner_set_professional_commission_override($1,$2,$3,$4)",
        [
          parsed.data.professionalId,
          basisPoints,
          parsed.data.reason,
          parsed.data.expiresAt,
        ],
      ),
    );

    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
