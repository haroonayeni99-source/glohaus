import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError } from "@/lib/http";
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
    const row = await withAccount(
      "professional",
      async (db, account) =>
        (
          await db.query<{
            platform: "instagram" | "tiktok";
            thumbnail_url: string;
          }>(
            "SELECT platform,thumbnail_url FROM beauty.social_portfolio WHERE id=$1 AND professional_id=$2 AND source_available",
            [id, account.professionalId],
          )
        ).rows[0],
    );
    const url = row && socialThumbnailUrl(row.thumbnail_url, row.platform);
    if (!url)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    const bytes = await sanitizeImage(
      await fetchPublicBytes(new URL(url), request.signal),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
