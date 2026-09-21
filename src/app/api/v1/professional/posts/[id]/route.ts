import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { postSchema } from "@/modules/posts/domain";
import { savePost } from "@/modules/posts/repository";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = postSchema.safeParse(await smallJson(request, 12000));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      savePost(db, account.professionalId!, parsed.data, id),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
