import { z } from "zod";
import { AccessError } from "@/modules/accounts/domain";
export const selectionSchema = z
  .object({
    categoryIds: z.array(z.uuid()).min(1).max(20),
    specialityIds: z.array(z.uuid()).min(1).max(40),
    primarySpecialityId: z.uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.specialityIds.includes(value.primarySpecialityId))
      ctx.addIssue({
        code: "custom",
        path: ["primarySpecialityId"],
        message: "Choose a primary speciality from your selections.",
      });
    if (
      new Set(value.specialityIds).size !== value.specialityIds.length ||
      new Set(value.categoryIds).size !== value.categoryIds.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose each category and speciality once.",
      });
  });
export const serviceOptionSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(80),
    pricePence: z.number().int().min(0).max(1000000),
    durationMinutes: z.number().int().min(0).max(480).multipleOf(5),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10000),
    attributes: z
      .record(z.string().max(40), z.string().trim().max(100))
      .refine((v) => Object.keys(v).length <= 6),
  })
  .strict();
export type ServiceOptionInput = z.infer<typeof serviceOptionSchema>;
export type ServiceOption = ServiceOptionInput & {
  id: string;
  kind: "variation" | "extra";
  service_id: string;
};
export const bookingOptionsSchema = z
  .object({
    variationId: z.uuid().nullable().optional(),
    extraIds: z.array(z.uuid()).max(10).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.extraIds).size !== (value.extraIds ?? []).length)
      ctx.addIssue({ code: "custom", message: "Choose each extra once." });
  });
export type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
  description: string;
  image_url: string | null;
  canonical_category_id: string | null;
  legacy_only: boolean;
};
export type Speciality = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  sort_order: number;
  merged_into_id: string | null;
};
export type ServiceTemplate = {
  id: string;
  speciality_id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  sort_order: number;
  suggested_duration_minutes: number | null;
};
export type TaxonomyAlias = {
  id: string;
  term: string;
  target_kind: "category" | "speciality" | "template";
  target_id: string;
};
export type TaxonomyCatalog = {
  categories: Category[];
  specialities: Speciality[];
  templates: ServiceTemplate[];
  aliases: TaxonomyAlias[];
};
export const emptyTaxonomy: TaxonomyCatalog = {
  categories: [],
  specialities: [],
  templates: [],
  aliases: [],
};
export type ProfessionalSelection = {
  categoryIds: string[];
  specialityIds: string[];
  primarySpecialityId: string | null;
  confirmedAt: string | null;
  publishedBySpeciality: Record<string, number>;
  unclassifiedServices: number;
};
export type TaxonomyQuote = {
  serviceId: string;
  serviceName: string;
  professionalId: string;
  pricePence: number;
  depositPence: number;
  durationMinutes: number;
  variationId: string | null;
  extraIds: string[];
  variationName: string | null;
  extraNames: string[];
  categoryId: string | null;
  specialityId: string | null;
  templateId: string | null;
  categoryName: string;
  specialityName: string | null;
};
export const taxonomyAdminSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("category"),
      id: z.uuid().nullable(),
      name: z.string().trim().min(2).max(60),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
      description: z.string().trim().max(1000),
      imageUrl: z.url().startsWith("https://").max(2048).nullable(),
      active: z.boolean(),
      sortOrder: z.number().int().min(0).max(10000),
      aliases: z.array(z.string().trim().min(2).max(100)).max(40),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      operation: z.literal("speciality"),
      id: z.uuid().nullable(),
      categoryId: z.uuid(),
      name: z.string().trim().min(2).max(80),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
      description: z.string().trim().max(1000),
      active: z.boolean(),
      sortOrder: z.number().int().min(0).max(10000),
      aliases: z.array(z.string().trim().min(2).max(100)).max(40),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      operation: z.literal("template"),
      id: z.uuid().nullable(),
      specialityId: z.uuid(),
      name: z.string().trim().min(2).max(100),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
      description: z.string().trim().max(500),
      active: z.boolean(),
      sortOrder: z.number().int().min(0).max(10000),
      suggestedDurationMinutes: z
        .number()
        .int()
        .min(15)
        .max(480)
        .multipleOf(5)
        .nullable(),
      aliases: z.array(z.string().trim().min(2).max(100)).max(40),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      operation: z.literal("merge"),
      sourceId: z.uuid(),
      targetId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      operation: z.literal("review"),
      serviceId: z.uuid(),
      status: z.enum(["approved", "needs_review", "blocked"]),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
]);
export function specialityLabel(
  catalog: TaxonomyCatalog,
  id: string | null | undefined,
) {
  return (
    catalog.specialities.find((s) => s.id === id)?.name ??
    "Speciality to confirm"
  );
}
export function serviceDeepLink(
  slug: string,
  serviceId: string,
  specialityId?: string | null,
) {
  const q = new URLSearchParams({ service: serviceId });
  if (specialityId) q.set("speciality", specialityId);
  return `/p/${slug}?${q}#services`;
}

export function optionsFromSearch(params: URLSearchParams) {
  const result = bookingOptionsSchema.safeParse({
    variationId: params.get("variationId") || null,
    extraIds: params.getAll("extraId"),
  });
  if (!result.success) throw new AccessError("INVALID_REQUEST", 400);
  return result.data;
}
export function optionSearch(variationId: string | null, extraIds: string[]) {
  const q = new URLSearchParams();
  if (variationId) q.set("variationId", variationId);
  extraIds.forEach((id) => q.append("extraId", id));
  return q.toString();
}
