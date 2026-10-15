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
      .object({ status: z.enum(["draft", "published", "hidden"]).optional(),specialityIds:z.array(z.uuid()).max(40).optional() }).refine(v=>v.status!==undefined||v.specialityIds!==undefined)
      .strict()
      .safeParse(await smallJson(request,4000));
    if (!parsed.success || !z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", async (db, account) => {
      const result = await db.query(
        "UPDATE beauty.portfolio_assets SET publication_status=coalesce($3,publication_status) WHERE id=$1 AND professional_id=$2 RETURNING id",
        [id, account.professionalId, parsed.data.status??null],
      );
      if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
      if(parsed.data.specialityIds!==undefined)await db.query("SELECT beauty.save_my_portfolio_specialities($1,$2)",[id,parsed.data.specialityIds]);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
