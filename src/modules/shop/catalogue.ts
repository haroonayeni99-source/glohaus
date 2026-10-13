import type { PublicProduct } from "./domain";

export const shopCollections = {
  new: {
    label: "New arrivals",
    description: "Latest products added to GLOHAUS.",
  },
  bestsellers: {
    label: "Bestsellers",
    description:
      "Ranked by units sold through paid GLOHAUS orders, excluding cancelled and refunded orders.",
  },
  trending: {
    label: "Trending",
    description:
      "Most units sold through paid GLOHAUS orders in the last 30 days, excluding cancelled and refunded orders.",
  },
  deals: {
    label: "Deals & offers",
    description:
      "Products priced below the seller’s stated previous selling price.",
  },
} as const;
export type ShopCollection = keyof typeof shopCollections;

export function shopCollection(value: unknown): ShopCollection | undefined {
  return typeof value === "string" && Object.hasOwn(shopCollections, value)
    ? (value as ShopCollection)
    : undefined;
}

export function shopHref(collection?: ShopCollection, query = "") {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (collection) params.set("collection", collection);
  return `/shop${params.size ? `?${params}` : ""}#products`;
}

export function catalogueProducts(
  products: PublicProduct[],
  query: string,
  collection?: ShopCollection,
) {
  const search = query.trim().toLowerCase();
  let result = products.filter(
    (p) =>
      !search ||
      [p.name, p.description, p.professional_name]
        .join(" ")
        .toLowerCase()
        .includes(search),
  );
  if (collection === "deals")
    result = result.filter(
      (p) => (p.compare_at_price_pence ?? 0) > p.price_pence,
    );
  if (collection === "bestsellers")
    result = result.filter((p) => Number(p.sold_units ?? 0) > 0);
  if (collection === "trending")
    result = result.filter((p) => Number(p.recent_sold_units ?? 0) > 0);
  return [...result].sort((a, b) => {
    if (collection === "bestsellers" || collection === "trending") {
      const field =
        collection === "bestsellers" ? "sold_units" : "recent_sold_units";
      const difference = Number(b[field] ?? 0) - Number(a[field] ?? 0);
      if (difference) return difference;
    }
    const dateA = new Date(
      collection === "new" ? (a.created_at ?? a.updated_at) : a.updated_at,
    ).getTime();
    const dateB = new Date(
      collection === "new" ? (b.created_at ?? b.updated_at) : b.updated_at,
    ).getTime();
    return dateB - dateA || a.id.localeCompare(b.id);
  });
}
