import { encodePostCursor } from "./pagination";
import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
import type { PostInput, PublicPost } from "./domain";
export async function savePost(
  db: SqlClient,
  professionalId: string,
  input: PostInput,
  id?: string,
) {
  if (
    input.serviceId &&
    !(
      await db.query(
        "SELECT id FROM beauty.services WHERE id=$1 AND professional_id=$2",
        [input.serviceId, professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  if (
    input.assetId &&
    !(
      await db.query(
        "SELECT id FROM beauty.portfolio_assets WHERE id=$1 AND professional_id=$2",
        [input.assetId, professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  const values = [
    professionalId,
    input.serviceId,
    input.kind,
    input.title,
    input.body,
    input.publicationStatus,
  ];
  const result = id
    ? await db.query(
        "UPDATE beauty.posts SET service_id=$2,kind=$3,title=$4,body=$5,publication_status=$6 WHERE professional_id=$1 AND id=$7 RETURNING id",
        [...values, id],
      )
    : await db.query(
        "INSERT INTO beauty.posts(professional_id,service_id,kind,title,body,publication_status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        values,
      );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
  if (input.assetId !== undefined)
    await db.query("UPDATE beauty.posts SET asset_id=$2 WHERE id=$1", [
      result.rows[0].id,
      input.assetId,
    ]);
  return result.rows[0];
}
export async function publicPosts(db: SqlClient) {
  return (
    await db.query<PublicPost>(
      "SELECT id,title,body,kind,slug,business_name,category,city,service_id,service_name,price_pence,to_jsonb(feed)->>'asset_id' AS asset_id FROM beauty.public_posts feed ORDER BY created_at DESC,id DESC LIMIT 40",
    )
  ).rows;
}

export async function publicPostPage(
  db: SqlClient,
  after?: import("./pagination").PostCursor,
) {
  const rows = (
    await db.query<PublicPost & { cursor_created_at: string }>(
      `SELECT id,title,body,kind,slug,business_name,category,city,service_id,service_name,price_pence,to_jsonb(feed)->>'asset_id' AS asset_id,
   to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
   FROM beauty.public_posts feed
   WHERE ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid))
   ORDER BY created_at DESC,id DESC LIMIT 41`,
      [after?.createdAt ?? null, after?.id ?? null],
    )
  ).rows;
  const visible = rows.slice(0, 40);
  const last = visible.at(-1);
  return {
    posts: visible.map(({ cursor_created_at, ...post }) => {
      void cursor_created_at;
      return post;
    }),
    next:
      rows.length > 40 && last
        ? encodePostCursor({ id: last.id, createdAt: last.cursor_created_at })
        : null,
  };
}
