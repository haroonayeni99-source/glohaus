import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { sanitizeImage } from "@/modules/media/image";
const schema = z
  .object({
    base64: z.string().max(4194304),
    altText: z.string().trim().min(3).max(200),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw new AccessError("UNAVAILABLE", 503);
    const owner = await withAccount("professional", async (db, account) => {
      const count = (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.portfolio_assets WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0].count;
      if (count >= 100) throw new AccessError("INVALID_REQUEST", 400);
      return account.professionalId!;
    });
    const parsed = schema.safeParse(await smallJson(request, 4250000));
    if (!parsed.success || !/^[A-Za-z0-9+/]*={0,2}$/.test(parsed.data.base64))
      throw new AccessError("INVALID_REQUEST", 400);
    let image: Buffer;
    try {
      image = await sanitizeImage(Buffer.from(parsed.data.base64, "base64"));
    } catch {
      throw new AccessError("INVALID_REQUEST", 400);
    }
    const id = randomUUID();
    const blob = await put(`portfolio/${owner}/${id}.webp`, image, {
      access: "private",
      contentType: "image/webp",
      addRandomSuffix: true,
    });
    try {
      await withAccount("professional", async (db, account) => {
        if (account.professionalId !== owner)
          throw new AccessError("FORBIDDEN", 403);
        await db.query(
          "INSERT INTO beauty.portfolio_assets(id,professional_id,blob_path,alt_text) VALUES($1,$2,$3,$4)",
          [id, owner, blob.pathname, parsed.data.altText],
        );
      });
    } catch (error) {
      await del(blob.url).catch(() =>
        console.error("Orphaned upload requires cleanup"),
      );
      throw error;
    }
    return json({ id }, 201);
  } catch (error) {
    return apiError(error);
  }
}
