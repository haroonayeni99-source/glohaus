import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { findAccount } from "@/modules/accounts/repository";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { deletePostComment } from "@/modules/comments/repository";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id, commentId } = await context.params;
    if (
      !z.uuid().safeParse(id).success ||
      !z.uuid().safeParse(commentId).success
    )
      throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    await withIdentity(identity.authId, async (db) => {
      authorize(await findAccount(db, identity.authId), identity);
      await deletePostComment(db, commentId);
    });

    return json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
