import { getIdentity } from "@/lib/identity";
import { viewerEngagement } from "@/modules/engagement/repository";
import { publicPostPage } from "@/modules/posts/repository";
import { parsePostCursor } from "@/modules/posts/pagination";
import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { apiError, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import type { PublicPost } from "@/modules/posts/domain";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has("ids")) {
      let after;
      try {
        after = parsePostCursor(params.get("after"));
      } catch {
        throw new AccessError("INVALID_REQUEST", 400);
      }
      let authId = "";
      try {
        authId = (await getIdentity()).authId;
      } catch {}
      const result = await withIdentity(authId, async (db) => {
        const page = await publicPostPage(db, after);
        return {
          ...page,
          engagement: authId
            ? await viewerEngagement(
                db,
                page.posts.map((post) => post.id),
              )
            : {},
        };
      });
      return json(result);
    }
    const raw = params.get("ids") || "";
    if (raw.length > 1500) throw new AccessError("INVALID_REQUEST", 400);
    const parsed = z.array(z.uuid()).min(1).max(40).safeParse(raw.split(","));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const posts = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<PublicPost>(
            "SELECT * FROM beauty.public_posts WHERE id=ANY($1::uuid[]) ORDER BY created_at DESC,id DESC",
            [parsed.data],
          )
        ).rows,
    );
    return json({ posts });
  } catch (error) {
    return apiError(error);
  }
}
