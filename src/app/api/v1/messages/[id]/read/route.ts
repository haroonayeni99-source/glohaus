import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { assertSameOrigin, apiError, json } from "@/lib/http";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";

function assertMessagingAccount(roles: string[]) {
  if (!roles.includes("customer") && !roles.includes("professional"))
    throw new AccessError("FORBIDDEN", 403);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      assertMessagingAccount(account.roles);
      await db.query("SELECT beauty.mark_conversation_read($1)", [id]);
    });

    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
