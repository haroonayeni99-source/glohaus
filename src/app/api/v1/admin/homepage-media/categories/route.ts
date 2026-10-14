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
const name = z.string().trim().min(2).max(60).nullable().optional();
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
    names: z
      .object({
        desktop: z
          .object({
            hair: name,
            nails: name,
            barber: name,
            waxing: name,
            injectables: name,
          })
          .strict(),
        mobile: z
          .object({
            hair: name,
            nails: name,
            lashes: name,
            skin: name,
            makeup: name,
          })
          .strict(),
      })
      .strict()
      .optional(),
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
            parsed.data.names
              ? "SELECT beauty.owner_set_homepage_categories($1::jsonb,$2::jsonb,$3) AS data"
              : "SELECT beauty.owner_set_homepage_category_images($1::jsonb,$2) AS data",
            parsed.data.names
              ? [
                  JSON.stringify(parsed.data.images),
                  JSON.stringify(parsed.data.names),
                  parsed.data.reason,
                ]
              : [JSON.stringify(parsed.data.images), parsed.data.reason],
          )
        ).rows[0].data,
    );
    return json({ images: data });
  } catch (error) {
    return apiError(error);
  }
}
