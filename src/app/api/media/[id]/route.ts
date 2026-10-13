import { z } from "zod";
import { get } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
import { withAccount } from "@/lib/api-account";

type MediaPath = { blob_path: string; mime_type: string };

export async function GET(
  request: Request,
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

    const video = media.mime_type.startsWith("video/");
    const range = video ? request.headers.get("range") : null;
    if (
      range &&
      (range.length > 128 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
    )
      return new Response("Invalid range", { status: 416 });
    // Bound the provider handshake, without cutting off a large video's stream.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let result;
    try {
      result = await get(media.blob_path, {
        access: "private",
        ...(range ? { headers: { Range: range } } : {}),
        abortSignal: AbortSignal.any([request.signal, controller.signal]),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (result?.statusCode !== 200)
      return new Response("Not found", { status: 404 });

    const contentRange = result.headers?.get("content-range");
    const contentLength = result.headers?.get("content-length");
    return new Response(result.stream, {
      status: contentRange ? 206 : 200,
      headers: {
        ...(video ? { "Accept-Ranges": "bytes" } : {}),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Content-Type": media.mime_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
