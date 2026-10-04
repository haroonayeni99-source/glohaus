import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  publicSiteOpen: z.boolean(),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withOwner((db) =>
      db.query("SELECT beauty.owner_set_public_site_open($1,$2)", [
        parsed.data.publicSiteOpen,
        parsed.data.reason,
      ]),
    );

    return json({ saved: true, publicSiteOpen: parsed.data.publicSiteOpen });
  } catch (error) {
    return apiError(error);
  }
}
