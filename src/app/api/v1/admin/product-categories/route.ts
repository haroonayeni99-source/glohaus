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
    const p = parsed.data;
    const id = await withAdmin(
      async (db) =>
        (
          await db.query<{ id: string }>(
            "SELECT beauty.admin_upsert_product_category($1,$2,$3,$4,$5,$6) AS id",
            [p.id ?? null, p.name, p.slug, p.active, p.sortOrder, p.reason],
          )
        ).rows[0].id,
    );
    revalidateTag(publicTaxonomyTag, { expire: 0 });
    return json({ saved: true, id });
  } catch (error) {
    return apiError(error);
  }
}
