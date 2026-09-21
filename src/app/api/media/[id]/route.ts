import { z } from "zod";
import { get } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
import { withAccount } from "@/lib/api-account";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Not found", { status: 404 });
  try {
    let path = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<{ blob_path: string }>(
            "SELECT blob_path FROM beauty.published_asset_paths WHERE id=$1 UNION ALL SELECT blob_path FROM beauty.published_profile_photo_paths WHERE id=$1",
            [id],
          )
        ).rows[0]?.blob_path,
    );
    if (!path)
      try {
        path = await withAccount(
          "professional",
          async (db) =>
            (
              await db.query<{ blob_path: string }>(
                "SELECT blob_path FROM beauty.portfolio_assets WHERE id=$1 UNION ALL SELECT blob_path FROM beauty.profile_photos WHERE id=$1",
                [id],
              )
            ).rows[0]?.blob_path,
        );
      } catch {}
    if (!path) return new Response("Not found", { status: 404 });
    const result = await get(path, {
      access: "private",
      abortSignal: AbortSignal.timeout(10000),
    });
    if (result?.statusCode !== 200)
      return new Response("Not found", { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
}
