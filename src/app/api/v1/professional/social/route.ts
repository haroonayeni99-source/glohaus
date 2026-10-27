import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  socialInputSchema,
  socialUpdateSchema,
  socialPostLink,
} from "@/modules/business-tools/domain";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = socialInputSchema.safeParse(await smallJson(request, 10000));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    const post = socialPostLink(input.data.url);
    const result = await withAccount("professional", async (db, account) => {
      const count = (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.social_portfolio WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0].count;
      if (count >= 200) throw new AccessError("INVALID_REQUEST", 400);
      if (
        input.data.serviceId &&
        !(
          await db.query(
            "SELECT id FROM beauty.services WHERE id=$1 AND professional_id=$2",
            [input.data.serviceId, account.professionalId],
          )
        ).rows.length
      )
        throw new AccessError("FORBIDDEN", 403);
      return db.query(
        "INSERT INTO beauty.social_portfolio(professional_id,platform,external_id,original_url,caption,service_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(professional_id,platform,external_id) DO NOTHING RETURNING id",
        [
          account.professionalId,
          post.platform,
          post.externalId,
          post.url,
          input.data.caption,
          input.data.serviceId,
        ],
      );
    });
    return json({ saved: true, duplicate: !result.rows.length }, 201);
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const input = socialUpdateSchema.safeParse(await smallJson(request, 1500));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, a) => {
      if (
        input.data.serviceId &&
        !(
          await db.query(
            "SELECT id FROM beauty.services WHERE id=$1 AND professional_id=$2",
            [input.data.serviceId, a.professionalId],
          )
        ).rows.length
      )
        throw new AccessError("FORBIDDEN", 403);
      const changed = await db.query(
        "UPDATE beauty.social_portfolio SET publication_status=$3,service_id=$4,sort_order=$5 WHERE id=$1 AND professional_id=$2 AND publication_status<>'unavailable' RETURNING id",
        [
          input.data.id,
          a.professionalId,
          input.data.publicationStatus,
          input.data.serviceId,
          input.data.sortOrder,
        ],
      );
      if (!changed.rows.length) throw new AccessError("FORBIDDEN", 403);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const input = z
      .object({ id: z.uuid() })
      .strict()
      .safeParse(await smallJson(request));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, a) => {
      // Hide imported posts so a later sync cannot undo the professional's choice.
      const row = (
        await db.query<{ connection_id: string | null }>(
          "SELECT connection_id FROM beauty.social_portfolio WHERE id=$1 AND professional_id=$2",
          [input.data.id, a.professionalId],
        )
      ).rows[0];
      if (!row) throw new AccessError("FORBIDDEN", 403);
      await db.query(
        row.connection_id
          ? "UPDATE beauty.social_portfolio SET publication_status='hidden' WHERE id=$1"
          : "DELETE FROM beauty.social_portfolio WHERE id=$1",
        [input.data.id],
      );
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
