import { z } from "zod";

export type DiscoveryFilters = {
  verified: boolean;
  under50: boolean;
  topRated: boolean;
  travels: boolean;
  availableToday: boolean;
};

const filtersSchema = z
  .object({
    verified: z.boolean(),
    under50: z.boolean(),
    topRated: z.boolean(),
    travels: z.boolean(),
    availableToday: z.boolean(),
  })
  .strict();

const cursorSchema = z
  .object({
    name: z.string().min(2).max(100),
    id: z.uuid(),
    query: z.string().max(100),
    filters: filtersSchema,
  })
  .strict();

export type DiscoveryCursor = z.infer<typeof cursorSchema>;

export function discoveryOptions(params: {
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

  let after: DiscoveryCursor | undefined;
  if (typeof params.after === "string" && params.after.length <= 1800) {
    try {
      const parsed = cursorSchema.safeParse(
        JSON.parse(Buffer.from(params.after, "base64url").toString("utf8")),
      );
      if (
        parsed.success &&
        parsed.data.query === query &&
        JSON.stringify(parsed.data.filters) === JSON.stringify(filters)
      )
        after = parsed.data;
    } catch {}
  }

  return { query, filters, after };
}

export function discoveryCursor(
  row: { id: string; business_name: string },
  query: string,
  filters: DiscoveryFilters,
) {
  return Buffer.from(
    JSON.stringify({ id: row.id, name: row.business_name, query, filters }),
  ).toString("base64url");
}
