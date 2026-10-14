// Public preference keys map to the database's snake_case fields. Only booleans
// belong in the form/API contract; never round-trip row metadata or tokens.
export const marketingPreferenceFields = {
  customerOffers: "customer_offers",
  newProfessionals: "new_professionals",
  availability: "availability",
  discover: "discover",
  shop: "shop",
  rebooking: "rebooking",
  professionalGrowth: "professional_growth",
  marketplaceFeatures: "marketplace_features",
  professionalPromotions: "professional_promotions",
  academy: "academy",
  milestones: "milestones",
  shopSelling: "shop_selling",
} as const;
export type MarketingPreferences = Record<
  keyof typeof marketingPreferenceFields,
  boolean
>;

export function marketingPreferences(value: unknown): MarketingPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(marketingPreferenceFields).map(([key, column]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : source[column] === true,
    ]),
  ) as MarketingPreferences;
}
