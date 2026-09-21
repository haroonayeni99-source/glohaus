import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
const schema = z
  .object({
    status: z.enum(["cancelled", "completed", "no_show"]),
    reason: z.string().trim().max(500),
  })
  .strict();
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success || !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const identity = await getIdentity();
    await withIdentity(identity.authId, async (db) => {
      authorize(await findAccount(db, identity.authId), identity);
      await db.query("SELECT beauty.change_booking($1,$2,$3)", [
        id,
        parsed.data.status,
        parsed.data.reason,
      ]);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
