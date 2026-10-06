import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  desktopHero: z.string().trim().url().startsWith("https://").nullable(),
  mobileHero: z.string().trim().url().startsWith("https://").nullable(),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const data = await withOwner(async (db) => {
      const row = (
        await db.query<{ data: { desktopHero: string | null; mobileHero: string | null } }>(
          "SELECT beauty.owner_set_homepage_media($1,$2,$3) AS data",
          [
            parsed.data.desktopHero,
            parsed.data.mobileHero,
            parsed.data.reason,
          ],
        )
      ).rows[0];
      return row.data;
    });

    return json({ media: data });
  } catch (error) {
    return apiError(error);
  }
}
