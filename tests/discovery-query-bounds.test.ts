import { expect, it, vi } from "vitest";
import {
  discoveryPage,
  publicProfessionals,
} from "@/modules/professionals/repository";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";

const near = {
  latitude: 51.5,
  longitude: -0.1,
  radiusMiles: 10,
  query: "",
  filters: defaultDiscoveryFilters,
};

it("fetches only one visible page and a lookahead for postcode results", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await discoveryPage({ query }, "", undefined, defaultDiscoveryFilters, near);
  const listingQuery = query.mock.calls.find(([sql]) =>
    sql.includes("FROM beauty.public_professionals"),
  );
  expect(listingQuery?.[1][15]).toBe(25);
});

it("retains the existing separate nearby-map coverage limit", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  await publicProfessionals(
    { query },
    "",
    undefined,
    defaultDiscoveryFilters,
    near,
  );
  expect(query.mock.calls[0][1][15]).toBe(101);
});
