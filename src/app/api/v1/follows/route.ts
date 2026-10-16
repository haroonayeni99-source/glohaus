import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { findAccount } from "@/modules/accounts/repository";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { followStates, setFollowing } from "@/modules/follows/repository";

const bodySchema = z
  .object({
    professionalId: z.uuid(),
    following: z.boolean(),
  })
  .strict();

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const input = bodySchema.safeParse(await smallJson(request));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const result = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      if (!account.roles.includes("customer"))
        throw new AccessError("FORBIDDEN", 403);
      return setFollowing(
        db,
        account.id,
        input.data.professionalId,
        input.data.following,
      );
    });
    return json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const parsed = z
      .array(z.uuid())
      .min(1)
      .max(100)
      .safeParse(new URL(request.url).searchParams.getAll("professionalId"));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const ids = parsed.data;
    const identity = await getIdentity();
    const states = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      if (!account.roles.includes("customer"))
        throw new AccessError("FORBIDDEN", 403);
      return followStates(db, account.id, ids);
    });
    return json({ states });
  } catch (error) {
    return apiError(error);
  }
}
