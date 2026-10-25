import { randomUUID } from "node:crypto";
import { z } from "zod";
import { put, del } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
import { supportTokenHash, type SupportCase } from "@/modules/support/cases";
import { readImageUpload } from "@/modules/media/upload";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let path: string | undefined;
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const hash = supportTokenHash(request);
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const ticket = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<{ data: SupportCase }>(
            "SELECT beauty.support_case($1,$2,false) AS data",
            [id, hash],
          )
        ).rows[0].data,
    );
    if (ticket.evidence.length >= 5)
      throw new AccessError("INVALID_REQUEST", 400);
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw new AccessError("UNAVAILABLE", 503);
    const { image, altText } = await readImageUpload(request);
    const blob = await put(
      `support-evidence/${id}/${randomUUID()}.webp`,
      image,
      { access: "private", contentType: "image/webp", addRandomSuffix: true },
    );
    path = blob.pathname;
    const file = await withIdentity(
      "",
      async (db) =>
        (
          await db.query<{ id: string }>(
            "SELECT beauty.attach_support_evidence($1,$2,$3,$4) AS id",
            [id, hash, blob.pathname, altText],
          )
        ).rows[0].id,
    );
    return json({ id: file }, 201);
  } catch (error) {
    if (path) await del(path).catch(() => {});
    return apiError(error);
  }
}
