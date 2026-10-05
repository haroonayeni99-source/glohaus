import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withOwner((db) =>
      db.query("SELECT beauty.owner_set_public_site_enabled($1,$2)", [
        parsed.data.enabled,
        parsed.data.reason,
      ]),
    );

    return json({ saved: true, enabled: parsed.data.enabled });
  } catch (error) {
    return apiError(error);
  }
}
