import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { socialThumbnailUrl } from "@/modules/business-tools/domain";
import { fetchPublicBytes } from "@/modules/business-tools/public-fetch";
import { sanitizeImage } from "@/modules/media/image";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  try {
    const row = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<{
            platform: "instagram" | "tiktok";
            thumbnail_url: string;
          }>(
            "SELECT platform,thumbnail_url FROM beauty.public_social_thumbnails WHERE id=$1",
            [id],
          )
        ).rows[0],
    );
    const url = row && socialThumbnailUrl(row.thumbnail_url, row.platform);
    if (!url) return new Response(null, { status: 404 });
    const bytes = await sanitizeImage(
      await fetchPublicBytes(new URL(url), request.signal),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
