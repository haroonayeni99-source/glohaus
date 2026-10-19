import { z } from "zod";
import { profileExamples } from "./examples";
import type { DiscoveryFilters } from "./discovery";
import type { TaxonomyCatalog } from "@/modules/taxonomy/domain";

export const exampleVisibilitySchema = z
  .object({
    enabled: z.boolean(),
    hiddenSlugs: z
      .array(
        z
          .string()
          .refine((slug) => profileExamples.some((p) => p.slug === slug)),
      )
      .max(10),
  })
  .strict();
export type ExampleVisibility = z.infer<typeof exampleVisibilitySchema>;
export const defaultExampleVisibility: ExampleVisibility = {
  enabled: true,
  hiddenSlugs: [],
};
export function visibleProfileExamples(settings: ExampleVisibility) {
  return settings.enabled
    ? profileExamples.filter((p) => !settings.hiddenSlugs.includes(p.slug))
    : [];
}
export type ExampleListing = {
  slug: string;
  name: string;
  category: string;
  bio: string;
  image: string;
  specialities: string;
};
export function exampleListings(
  settings: ExampleVisibility,
  query: string,
  filters: DiscoveryFilters,
  taxonomy: TaxonomyCatalog,
): ExampleListing[] {
  // Examples cannot satisfy real availability, location, price or trust filters.
  if (
    filters.location ||
    filters.date ||
    filters.maxPricePence ||
    filters.minRating ||
    filters.verified ||
    filters.under50 ||
    filters.topRated ||
    filters.travels ||
    filters.availableToday
  )
    return [];
  const category = filters.categoryId
    ? taxonomy.categories.find((c) => c.id === filters.categoryId)?.name
    : filters.category;
  const speciality = filters.specialityId
    ? taxonomy.specialities.find((s) => s.id === filters.specialityId)?.name
    : undefined;
  const template = filters.templateId
    ? taxonomy.templates.find((t) => t.id === filters.templateId)?.name
    : undefined;
  if (
    (filters.categoryId && !category) ||
    (filters.specialityId && !speciality) ||
    (filters.templateId && !template)
  )
    return [];
  const normalized = (text: string) => text.toLocaleLowerCase("en-GB");
  return visibleProfileExamples(settings)
    .filter(
      (p) =>
        (!category || normalized(p.category) === normalized(category)) &&
        (!speciality ||
          p.specialities.some(
            (s) => normalized(s.name) === normalized(speciality),
          )) &&
        (!template ||
          p.services.some((s) =>
            normalized(s.name).includes(normalized(template)),
          )) &&
        (!query ||
          normalized(
            [
              p.name,
              p.category,
              p.bio,
              ...p.specialities.map((s) => s.name),
              ...p.services.map((s) => s.name),
            ].join(" "),
          ).includes(normalized(query))),
    )
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      bio: p.bio,
      image: p.mediaSources[`${p.professional.id}-portfolio`],
      specialities: p.specialities.map((s) => s.name).join(" · "),
    }));
}
