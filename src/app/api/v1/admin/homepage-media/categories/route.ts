import { z } from "zod";
import { withOwner } from "@/modules/admin/repository";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const image = z
  .string()
  .trim()
  .max(2048)
  .url()
  .startsWith("https://")
  .nullable()
  .optional();
const schema = z
  .object({
    images: z
      .object({
        desktop: z
          .object({
            hair: image,
            nails: image,
            barber: image,
            waxing: image,
            injectables: image,
          })
          .strict(),
        mobile: z
          .object({
            hair: image,
            nails: image,
            lashes: image,
            skin: image,
            makeup: image,
          })
          .strict(),
      })
      .strict(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 24576));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const data = await withOwner(
      async (db) =>
        (
          await db.query<{ data: unknown }>(
            "SELECT beauty.owner_set_homepage_category_images($1::jsonb,$2) AS data",
            [JSON.stringify(parsed.data.images), parsed.data.reason],
          )
        ).rows[0].data,
    );
    return json({ images: data });
  } catch (error) {
    return apiError(error);
  }
}
