import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import type { PostComment } from "./domain";

export async function postComments(
  db: SqlClient,
  postId: string,
  viewerUserId?: string | null,
) {
  return (
    await db.query<PostComment>(
      `SELECT id,post_id,user_id,author_name,body,created_at,
        (user_id=$2::uuid) AS mine
       FROM beauty.post_comments
       WHERE post_id=$1
       ORDER BY created_at ASC,id ASC
       LIMIT 100`,
      [postId, viewerUserId ?? null],
    )
  ).rows;
}

export async function addPostComment(
  db: SqlClient,
  input: {
    postId: string;
    userId: string;
    authorName: string;
    body: string;
  },
) {
  const recent = (
    await db.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM beauty.post_comments WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
      [input.userId],
    )
  ).rows[0]?.count ?? 0;

  if (recent >= 30) throw new AccessError("TOO_MANY_ATTEMPTS", 429);

  const row = (
    await db.query<PostComment>(
      `INSERT INTO beauty.post_comments(post_id,user_id,author_name,body)
       VALUES($1,$2,$3,$4)
       RETURNING id,post_id,user_id,author_name,body,created_at,true AS mine`,
      [input.postId, input.userId, input.authorName, input.body.trim()],
    )
  ).rows[0];

  if (!row) throw new AccessError("INVALID_REQUEST", 400);
  return row;
}

export async function deletePostComment(
  db: SqlClient,
  commentId: string,
) {
  const result = await db.query(
    "DELETE FROM beauty.post_comments WHERE id=$1 RETURNING id",
    [commentId],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
