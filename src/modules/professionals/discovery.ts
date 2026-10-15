import { z } from "zod";

export type DiscoveryFilters = {
  location?: string;
  category?: string;
  categoryId?:string;specialityId?:string;templateId?:string;date?:string;
  maxPricePence?: number;
  minRating?: number;
  verified: boolean;
  under50: boolean;
  topRated: boolean;
  travels: boolean;
  availableToday: boolean;
};

export const defaultDiscoveryFilters: DiscoveryFilters = {
  verified: false,
  under50: false,
  topRated: false,
  travels: false,
  availableToday: false,
};

export const discoveryFiltersSchema = z
  .object({
    location: z.string().max(100).optional(),
    category: z.string().max(60).optional(),
    categoryId:z.uuid().optional(),specialityId:z.uuid().optional(),templateId:z.uuid().optional(),date:z.iso.date().optional(),
    maxPricePence: z.number().int().min(100).max(1000000).optional(),
    minRating: z.number().min(0).max(5).optional(),
    verified: z.boolean(),
    under50: z.boolean(),
    topRated: z.boolean(),
    travels: z.boolean(),
    availableToday: z.boolean(),
  })
  .strict();

const filtersSchema = discoveryFiltersSchema;

const cursorSchema = z
  .object({
    name: z.string().min(2).max(100),
    id: z.uuid(),
    score: z.number().min(1).max(6),
    query: z.string().max(100),
    filters: filtersSchema,
  })
  .strict();

export type DiscoveryCursor = z.infer<typeof cursorSchema>;

export function discoveryOptions(params: {
  location?: string | string[];
  category?: string | string[];
  price?: string | string[];
  rating?: string | string[];
  categoryId?:string|string[];specialityId?:string|string[];templateId?:string|string[];date?:string|string[];
  q?: string | string[];
  after?: string | string[];
  verified?: string | string[];
  under50?: string | string[];
  topRated?: string | string[];
  travels?: string | string[];
  today?: string | string[];
}) {
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const filters: DiscoveryFilters = {
    verified: params.verified === "1",
    under50: params.under50 === "1",
    topRated: params.topRated === "1",
    travels: params.travels === "1",
    availableToday: params.today === "1",
  };

  for(const key of ["categoryId","specialityId","templateId"] as const){if(z.uuid().safeParse(params[key]).success)filters[key]=params[key] as string;}
  if(typeof params.date==="string"&&z.iso.date().safeParse(params.date).success)filters.date=params.date;
  if (typeof params.location === "string" && params.location.trim())
    filters.location = params.location.trim().slice(0, 100);
  if (typeof params.category === "string" && params.category.trim())
    filters.category = params.category.trim().slice(0, 60);
  if (
    typeof params.price === "string" &&
    /^\d{1,5}$/.test(params.price) &&
    Number(params.price) >= 1 &&
    Number(params.price) <= 10000
  )
    filters.maxPricePence = Number(params.price) * 100;
  if (params.rating === "4" || params.rating === "4.5")
    filters.minRating = Number(params.rating);
  let after: DiscoveryCursor | undefined;
  if (typeof params.after === "string" && params.after.length <= 1800) {
    try {
      const parsed = cursorSchema.safeParse(
        JSON.parse(Buffer.from(params.after, "base64url").toString("utf8")),
      );
      if (
        parsed.success &&
        parsed.data.query === query &&
        JSON.stringify(filtersSchema.parse(parsed.data.filters)) ===
          JSON.stringify(filtersSchema.parse(filters))
      )
        after = parsed.data;
    } catch {}
  }

  return { query, filters, after };
}

export function discoveryCursor(
  row: { id: string; business_name: string; ranking_score?: number },
  query: string,
  filters: DiscoveryFilters = defaultDiscoveryFilters,
) {
  return Buffer.from(
    JSON.stringify({
      id: row.id,
      name: row.business_name,
      score: row.ranking_score ?? 4,
      query,
      filters,
    }),
  ).toString("base64url");
}

export function discoveryHref(
  query: string,
  filters: DiscoveryFilters,
  after?: string | null,
) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters.location) params.set("location", filters.location);
  if (filters.category) params.set("category", filters.category);
  for(const key of ["categoryId","specialityId","templateId","date"] as const)if(filters[key])params.set(key,filters[key]);
  if (filters.maxPricePence)
    params.set("price", String(filters.maxPricePence / 100));
  if (filters.minRating) params.set("rating", String(filters.minRating));
  for (const [key, value] of [
    ["verified", filters.verified],
    ["under50", filters.under50],
    ["topRated", filters.topRated],
    ["travels", filters.travels],
    ["today", filters.availableToday],
  ])
    if (value) params.set(String(key), "1");
  if (after) params.set("after", after);
  return params.size ? `/explore?${params}` : "/explore";
}
