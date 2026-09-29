import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { findAccount } from "@/modules/accounts/repository";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { commentSchema } from "@/modules/comments/domain";
import {
  addPostComment,
  postComments,
} from "@/modules/comments/repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    let authId = "";
    try {
      authId = (await getIdentity()).authId;
    } catch {}

    const result = await withIdentity(authId, async (db) => {
      const account = authId ? await findAccount(db, authId) : null;
      return postComments(
        db,
        id,
        account?.status === "active" ? account.id : null,
      );
    });

    return json({ comments: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = commentSchema.safeParse(await smallJson(request, 2048));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const comment = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      return addPostComment(db, {
        postId: id,
        userId: account.id,
        authorName: account.displayName,
        body: parsed.data.body,
      });
    });

    return json({ comment }, 201);
  } catch (error) {
    return apiError(error);
  }
}
