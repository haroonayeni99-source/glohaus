import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { postSchema } from "@/modules/posts/domain";
import { savePost } from "@/modules/posts/repository";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = postSchema.safeParse(await smallJson(request, 12000));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const post = await withAccount("professional", (db, account) =>
      savePost(db, account.professionalId!, parsed.data),
    );
    return json({ post }, 201);
  } catch (error) {
    return apiError(error);
  }
}
