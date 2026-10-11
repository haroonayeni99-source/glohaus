import { z } from "zod";
import { withAccount } from "@/lib/api-account";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    const photo = await withAccount(
      undefined,
      async (db) =>
        (
          await db.query<{ photo: Buffer }>(
            "SELECT photo FROM beauty.customer_profiles WHERE user_id=$1 AND photo IS NOT NULL",
            [id],
          )
        ).rows[0]?.photo,
    );
    if (!photo)
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
