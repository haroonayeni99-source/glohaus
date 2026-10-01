import { z } from "zod";
import { get } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
import { withAccount } from "@/lib/api-account";

type MediaPath = { blob_path: string; mime_type: string };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });

  try {
    let media = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<MediaPath>(
            `SELECT blob_path,mime_type
             FROM beauty.published_media_paths
             WHERE id=$1
             UNION ALL
             SELECT blob_path,'image/webp'::text AS mime_type
             FROM beauty.published_profile_photo_paths
             WHERE id=$1`,
            [id],
          )
        ).rows[0],
    );

    if (!media)
      try {
        media = await withAccount(
          "professional",
          async (db) =>
            (
              await db.query<MediaPath>(
                `SELECT blob_path,mime_type
                 FROM beauty.portfolio_assets
                 WHERE id=$1
                 UNION ALL
                 SELECT blob_path,'image/webp'::text AS mime_type
                 FROM beauty.profile_photos
                 WHERE id=$1`,
                [id],
              )
            ).rows[0],
        );
      } catch {}

    if (!media) return new Response("Not found", { status: 404 });

    const result = await get(media.blob_path, {
      access: "private",
      abortSignal: AbortSignal.timeout(10000),
    });
    if (result?.statusCode !== 200)
      return new Response("Not found", { status: 404 });

    return new Response(result.stream, {
      headers: {
        "Content-Type": media.mime_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
