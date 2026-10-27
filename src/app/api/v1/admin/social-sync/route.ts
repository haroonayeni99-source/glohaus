import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
const schema = z
  .object({
    professionalId: z.uuid().nullable(),
    enabled: z.boolean(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export async function GET() {
  try {
    return json(
      await withOwner(
        async (db) =>
          (
            await db.query<{ data: unknown }>(
              "SELECT beauty.owner_social_sync_overview() AS data",
            )
          ).rows[0].data,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.safeParse(await smallJson(request, 1500));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withOwner((db) =>
      db.query("SELECT beauty.owner_social_sync_settings($1,$2,$3)", [
        input.data.professionalId,
        input.data.enabled,
        input.data.reason,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
