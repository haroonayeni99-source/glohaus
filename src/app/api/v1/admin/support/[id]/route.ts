import { z } from "zod";
import { withAdmin } from "@/modules/admin/repository";
import { setSupportStatus } from "@/modules/support/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const parsed = z
      .object({
        status: z.enum([
          "open",
          "under_review",
          "awaiting_customer",
          "escalated",
          "resolved",
          "appealed",
        ]),
        note: z.string().trim().min(5).max(4000).optional(),
        public: z.boolean().default(false),
      })
      .strict()
      .safeParse(await smallJson(request));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAdmin(async (db) => {
      if (parsed.data.note)
        await db.query("SELECT beauty.admin_support_case_action($1,$2,$3,$4)", [
          id,
          parsed.data.status,
          parsed.data.note,
          parsed.data.public,
        ]);
      else await setSupportStatus(db, id, parsed.data.status);
    });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
