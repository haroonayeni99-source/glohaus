import { revalidateTag } from "next/cache";
import { publicTaxonomyTag } from "@/modules/taxonomy/public-catalog";
import { categorySchema } from "@/modules/platform/category";
import { withAdmin } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = categorySchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const id = await withAdmin(async (db) => {
      const row = (
        await db.query<{ id: string }>(
          "SELECT beauty.admin_upsert_category($1,$2,$3,$4,$5,$6) AS id",
          [
            parsed.data.id ?? null,
            parsed.data.name,
            parsed.data.slug,
            parsed.data.active,
            parsed.data.sortOrder,
            parsed.data.reason,
          ],
        )
      ).rows[0];
      return row.id;
    });
    revalidateTag(publicTaxonomyTag, { expire: 0 });
    return json({ saved: true, id });
  } catch (error) {
    return apiError(error);
  }
}
