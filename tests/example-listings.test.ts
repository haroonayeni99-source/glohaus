import { expect, it } from "vitest";
import {
  defaultExampleVisibility,
  exampleListings,
  exampleVisibilitySchema,
  visibleProfileExamples,
} from "@/modules/professionals/example-visibility";
import { defaultDiscoveryFilters as filters } from "@/modules/professionals/discovery";
import { emptyTaxonomy, type TaxonomyCatalog } from "@/modules/taxonomy/domain";
it("publishes only the selected examples and supports hiding and restoring all", () => {
  expect(
    exampleListings(defaultExampleVisibility, "", filters, emptyTaxonomy),
  ).toHaveLength(10);
  const hidden = { enabled: true, hiddenSlugs: ["gloss-house"] };
  expect(exampleListings(hidden, "", filters, emptyTaxonomy)).toHaveLength(9);
  expect(visibleProfileExamples({ ...hidden, enabled: false })).toHaveLength(0);
  expect(visibleProfileExamples(defaultExampleVisibility)).toHaveLength(10);
  expect(
    exampleVisibilitySchema.safeParse({
      enabled: true,
      hiddenSlugs: ["not-an-example"],
    }).success,
  ).toBe(false);
});
it("filters illustrative listings by service text and category taxonomy without inventing live data", () => {
  expect(
    exampleListings(
      defaultExampleVisibility,
      "",
      { ...filters, category: "Hair" },
      emptyTaxonomy,
    ),
  ).toHaveLength(3);
  expect(
    exampleListings(
      defaultExampleVisibility,
      "Gloss House",
      filters,
      emptyTaxonomy,
    ).map((p) => p.slug),
  ).toEqual(["gloss-house"]);
  const catalog = {
    ...emptyTaxonomy,
    categories: [{ id: "nails-id", name: "Nails" }],
    specialities: [{ id: "art-id", name: "Nail Art" }],
  } as TaxonomyCatalog;
  expect(
    exampleListings(
      defaultExampleVisibility,
      "",
      { ...filters, categoryId: "nails-id", specialityId: "art-id" },
      catalog,
    ).map((p) => p.slug),
  ).toEqual(["gloss-house"]);
  expect(
    exampleListings(
      defaultExampleVisibility,
      "",
      { ...filters, categoryId: "missing" },
      catalog,
    ),
  ).toHaveLength(0);
});
it.each([
  { verified: true },
  { availableToday: true },
  { date: "2026-11-20" },
  { location: "Peckham" },
  { minRating: 4 },
  { under50: true },
  { topRated: true },
  { travels: true },
  { maxPricePence: 5000 },
])("does not offer examples as real matches for %j", (extra) => {
  expect(
    exampleListings(
      defaultExampleVisibility,
      "",
      { ...filters, ...extra },
      emptyTaxonomy,
    ),
  ).toHaveLength(0);
});
