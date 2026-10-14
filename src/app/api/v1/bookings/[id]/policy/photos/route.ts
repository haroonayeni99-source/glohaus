import sharp from "sharp";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { readImageUpload } from "@/modules/media/upload";
import { policyError } from "@/modules/policies/http";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.booking_policy_overview($1)", [id]),
    );
    const { image } = await readImageUpload(request);
    const photo = await sharp(image)
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.add_booking_reference_photo($1,$2)", [id, photo]),
    );
    return json({ saved: true }, 201);
  } catch (e) {
    return policyError(e);
  }
}
export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const photo = new URL(request.url).searchParams.get("photoId");
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(photo).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const image = await withAccount(
      undefined,
      async (db) =>
        (
          await db.query<{ image: Buffer }>(
            "SELECT beauty.read_booking_reference_photo($1,$2) AS image",
            [id, photo],
          )
        ).rows[0]?.image,
    );
    if (!image)
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return policyError(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const photo = new URL(request.url).searchParams.get("photoId");
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(photo).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.delete_booking_reference_photo($1,$2)", [
        id,
        photo,
      ]),
    );
    return json({ removed: true });
  } catch (e) {
    return policyError(e);
  }
}
