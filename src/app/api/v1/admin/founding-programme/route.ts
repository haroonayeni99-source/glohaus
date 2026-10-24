import { withOwner } from "@/modules/admin/repository";
import { programmeActionSchema } from "@/modules/commission/programme";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = programmeActionSchema.safeParse(
      await smallJson(request, 4096),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      db.query("SELECT beauty.owner_programme_action($1::jsonb)", [
        JSON.stringify(parsed.data),
      ]),
    );
    return json({ saved: true });
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "PROGRAMME_RETIRED",
        "TYPED_CONFIRMATION_REQUIRED",
        "CONFIRMATION_REQUIRED",
      ].includes(e.message)
    )
      return json({ error: { code: e.message } }, 409);
    return apiError(e);
  }
}
