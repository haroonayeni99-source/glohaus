import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { markInAppNotificationRead } from "@/modules/notifications/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({ id: z.uuid() }).strict();

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request));
    if (!parsed.success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const identity = await getIdentity();
    await withIdentity(identity.authId, async (db) => {
      authorize(await findAccount(db, identity.authId), identity);
      await markInAppNotificationRead(db, parsed.data.id);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
