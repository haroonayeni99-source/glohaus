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

const slot=z.object({categoryId:z.uuid().nullable(),specialityId:z.uuid().nullable(),templateId:z.uuid().nullable(),description:z.string().trim().max(200),sortOrder:z.number().int().min(0).max(10000),visible:z.boolean()}).strict();
const key=z.union([z.enum(["hair","nails","barber","waxing","injectables","lashes","skin","makeup"]),z.uuid()]);
const record=<T extends z.ZodType>(value:T)=>z.record(key,value).refine(v=>Object.keys(v).length<=30);
const extendedSchema=z.object({images:z.object({desktop:record(image),mobile:record(image)}).strict(),names:z.object({desktop:record(name),mobile:record(name)}).strict(),metadata:z.object({desktop:record(slot),mobile:record(slot)}).strict(),reason:z.string().trim().min(5).max(500)}).strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body=await smallJson(request,80000);
    const extended=extendedSchema.safeParse(body);
    if(extended.success){const data=await withOwner(async db=>(await db.query<{data:unknown}>("SELECT beauty.owner_set_homepage_categories($1::jsonb,$2::jsonb,$3::jsonb,$4) AS data",[JSON.stringify(extended.data.images),JSON.stringify(extended.data.names),JSON.stringify(extended.data.metadata),extended.data.reason])).rows[0].data);return json({images:data});}
    const parsed = schema.safeParse(body);
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
