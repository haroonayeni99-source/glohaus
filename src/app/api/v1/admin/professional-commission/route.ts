import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
// Validate the old request shape to preserve its origin/input boundary, then
// require callers to use the confirmed, scheduled Commission Control Centre.
const schema = z
  .object({
    professionalId: z.uuid(),
    percentage: z.number().min(0).max(50).nullable(),
    expiresAt: z.string().datetime().nullable(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!schema.safeParse(await smallJson(request, 4096)).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withOwner(async () => true);
    return json({ error: { code: "USE_COMMISSION_CONTROL_CENTRE" } }, 409);
  } catch (e) {
    return apiError(e);
  }
}
