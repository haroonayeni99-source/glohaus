import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { findAccount } from "@/modules/accounts/repository";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { engagementSchema } from "@/modules/engagement/domain";
import { saveEngagement } from "@/modules/engagement/repository";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = engagementSchema.safeParse(await smallJson(request));
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new AccessError("INVALID_REQUEST", 400);
    const identity = await getIdentity();
    const result = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      return saveEngagement(db, account.id, id, input.data);
    });
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}
