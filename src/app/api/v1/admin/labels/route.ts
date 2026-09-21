import { withAdmin } from "@/modules/admin/repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { labelKeys, labelsSchema } from "@/modules/platform/domain";
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const input = labelsSchema.safeParse(await smallJson(request, 4096));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAdmin(async (db) => {
      for (const key of labelKeys)
        await db.query("SELECT beauty.admin_set_label($1,$2,$3)", [
          key,
          input.data.labels[key],
          input.data.reason,
        ]);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
