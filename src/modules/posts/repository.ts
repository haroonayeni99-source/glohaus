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
    input.publicationStatus,input.specialityId??null,
  ];
  const result = id
    ? await db.query(
        "UPDATE beauty.posts SET service_id=$2,kind=$3,title=$4,body=$5,publication_status=$6,speciality_id=$7 WHERE professional_id=$1 AND id=$8 RETURNING id",
        [...values, id],
      )
    : await db.query(
        "INSERT INTO beauty.posts(professional_id,service_id,kind,title,body,publication_status,speciality_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        values,
      );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);

  if (input.assetId !== undefined)
    await db.query("UPDATE beauty.posts SET asset_id=$2 WHERE id=$1", [
      result.rows[0].id,
      input.assetId,
    ]);
  if (input.assetId && input.publicationStatus === "published")
    await db.query(
      "UPDATE beauty.portfolio_assets SET publication_status='published' WHERE id=$1 AND professional_id=$2 AND publication_status='draft'",
      [input.assetId, professionalId],
    );
  return result.rows[0];
}

const postSelect = `
  feed.id,feed.title,feed.body,feed.kind,feed.slug,feed.business_name,
  feed.category,feed.city,feed.service_id,feed.service_name,feed.price_pence,
  to_jsonb(feed)->>'asset_id' AS asset_id,
  media.media_type AS asset_media_type,
  media.mime_type AS asset_mime_type,
  feed.professional_id,feed.speciality_id,feed.speciality_name,feed.category_id
`;

export async function publicPosts(db: SqlClient) {
  return (
    await db.query<PublicPost>(
      `SELECT ${postSelect}
       FROM beauty.public_posts feed
       LEFT JOIN beauty.public_media_assets media
         ON media.id=(to_jsonb(feed)->>'asset_id')::uuid
       ORDER BY feed.created_at DESC,feed.id DESC
       LIMIT 40`,
    )
  ).rows;
}

export async function publicPostPage(
  db: SqlClient,
  after?: import("./pagination").PostCursor,
  taxonomy?:{categoryId?:string;specialityId?:string;templateId?:string},
) {
  const rows = (
    await db.query<PublicPost & { cursor_created_at: string }>(
      `SELECT ${postSelect},
       to_char(feed.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
       FROM beauty.public_posts feed
       LEFT JOIN beauty.public_media_assets media
         ON media.id=(to_jsonb(feed)->>'asset_id')::uuid
       WHERE ($1::timestamptz IS NULL OR (feed.created_at,feed.id)<($1::timestamptz,$2::uuid))
       AND ($3::uuid IS NULL OR feed.category_id=$3) AND ($4::uuid IS NULL OR feed.speciality_id=$4) AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM beauty.public_services s WHERE s.id=feed.service_id AND s.template_id=$5))
       ORDER BY feed.created_at DESC,feed.id DESC
       LIMIT 41`,
      [after?.createdAt ?? null, after?.id ?? null,taxonomy?.categoryId??null,taxonomy?.specialityId??null,taxonomy?.templateId??null],
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

export async function followedPostPage(
  db: SqlClient,
  customerId: string,
  after?: import("./pagination").PostCursor,
  taxonomy?:{categoryId?:string;specialityId?:string;templateId?:string},
) {
  const rows = (
    await db.query<PublicPost & { cursor_created_at: string }>(
      `SELECT ${postSelect},
       to_char(feed.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
       FROM beauty.public_posts feed
       LEFT JOIN beauty.public_media_assets media
         ON media.id=(to_jsonb(feed)->>'asset_id')::uuid
       WHERE EXISTS (
         SELECT 1
         FROM beauty.professional_follows f
         WHERE f.customer_id=$1 AND f.professional_id=feed.professional_id
       )
         AND ($2::timestamptz IS NULL OR (feed.created_at,feed.id)<($2::timestamptz,$3::uuid))
       AND ($4::uuid IS NULL OR feed.category_id=$4) AND ($5::uuid IS NULL OR feed.speciality_id=$5) AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM beauty.public_services s WHERE s.id=feed.service_id AND s.template_id=$6))
       ORDER BY feed.created_at DESC,feed.id DESC
       LIMIT 41`,
      [customerId, after?.createdAt ?? null, after?.id ?? null,taxonomy?.categoryId??null,taxonomy?.specialityId??null,taxonomy?.templateId??null],
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

export async function publicPost(db: SqlClient, id: string) {
  return (
    await db.query<PublicPost>(
      `SELECT ${postSelect} FROM beauty.public_posts feed
     LEFT JOIN beauty.public_media_assets media ON media.id=(to_jsonb(feed)->>'asset_id')::uuid
     WHERE feed.id=$1`,
      [id],
    )
  ).rows[0];
}
