import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { exampleVisibilitySchema } from "@/modules/professionals/example-visibility";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = exampleVisibilitySchema.safeParse(
      await smallJson(request, 2048),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const { enabled, hiddenSlugs } = parsed.data;
    await withOwner((db) =>
      db.query("SELECT beauty.owner_set_profile_examples($1,$2::text[])", [
        enabled,
        [...new Set(hiddenSlugs)],
      ]),
    );
    return json({ saved: true, enabled, hiddenSlugs });
  } catch (error) {
    return apiError(error);
  }
}
