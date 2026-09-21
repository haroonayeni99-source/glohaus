import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import {
  engagementSchema,
  type Engagement,
  type EngagementMap,
} from "./domain";
import type { PublicPost } from "@/modules/posts/domain";
export async function saveEngagement(
  db: SqlClient,
  userId: string,
  postId: string,
  input: Engagement,
) {
  const value = engagementSchema.parse(input);
  if (
    !(
      await db.query("SELECT id FROM beauty.public_posts WHERE id=$1", [postId])
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  await db.query(
    "INSERT INTO beauty.post_engagement(user_id,post_id,liked,saved) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,post_id) DO UPDATE SET liked=excluded.liked,saved=excluded.saved",
    [userId, postId, value.liked, value.saved],
  );
  return value;
}
export async function viewerEngagement(
  db: SqlClient,
  ids: string[],
): Promise<EngagementMap> {
  if (!ids.length) return {};
  const rows = (
    await db.query<{ post_id: string; liked: boolean; saved: boolean }>(
      "SELECT post_id,liked,saved FROM beauty.post_engagement WHERE post_id=ANY($1::uuid[])",
      [ids],
    )
  ).rows;
  return Object.fromEntries(
    rows.map((row) => [row.post_id, { liked: row.liked, saved: row.saved }]),
  );
}
export async function savedPosts(db: SqlClient, page: number) {
  return (
    await db.query<PublicPost>(
      `SELECT p.* FROM beauty.public_posts p JOIN beauty.post_engagement e ON e.post_id=p.id WHERE e.saved ORDER BY e.created_at DESC,e.post_id DESC LIMIT 41 OFFSET $1`,
      [(page - 1) * 40],
    )
  ).rows;
}
