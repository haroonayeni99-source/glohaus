import { revalidateTag } from "next/cache";
import { publicTaxonomyTag } from "@/modules/taxonomy/public-catalog";
import { withAdmin } from "@/modules/admin/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { taxonomyAdminSchema } from "@/modules/taxonomy/domain";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = taxonomyAdminSchema.safeParse(
      await smallJson(request, 14000),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const result = await withAdmin(
      async (db) =>
        (
          await db.query(
            "SELECT beauty.admin_update_taxonomy($1::jsonb) AS id",
            [JSON.stringify(parsed.data)],
          )
        ).rows[0],
    );
    revalidateTag(publicTaxonomyTag, { expire: 0 });
    return json(result);
  } catch (e) {
    return apiError(e);
  }
}
