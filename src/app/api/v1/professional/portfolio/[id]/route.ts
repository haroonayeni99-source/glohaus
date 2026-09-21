import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const parsed = z
      .object({ status: z.enum(["draft", "published", "hidden"]) })
      .strict()
      .safeParse(await smallJson(request));
    if (!parsed.success || !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, account) => {
      const result = await db.query(
        "UPDATE beauty.portfolio_assets SET publication_status=$3 WHERE id=$1 AND professional_id=$2 RETURNING id",
        [id, account.professionalId, parsed.data.status],
      );
      if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
