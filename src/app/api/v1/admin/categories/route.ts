import { z } from "zod";
import { withAdmin } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  id: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
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
    return json({ saved: true, id });
  } catch (error) {
    return apiError(error);
  }
}
