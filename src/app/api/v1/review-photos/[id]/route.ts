import { z } from "zod";
import { get } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
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
          await db.query<{ blob_path: string }>(
            "SELECT blob_path FROM beauty.public_review_photos WHERE id=$1",
            [id],
          )
        ).rows[0],
    );
    if (!row) return new Response(null, { status: 404 });
    const result = await get(row.blob_path, {
      access: "private",
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(10000),
      ]),
    });
    if (result?.statusCode !== 200) return new Response(null, { status: 404 });
    return new Response(result.stream, {
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
