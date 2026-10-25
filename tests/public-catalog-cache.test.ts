import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: vi.fn(),
  withIdentity: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ withIdentity: state.withIdentity }));
// Exercise cold fills without relying on a running Next cache server.
vi.mock("next/cache", () => ({ unstable_cache: (load: unknown) => load }));

import { publicTaxonomyCatalog } from "@/modules/taxonomy/public-catalog";
const catalog = {
  categories: [],
  specialities: [],
  templates: [],
  aliases: [],
};
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "isolated-fixture-only");
  state.query.mockReset();
  state.withIdentity.mockReset();
  state.withIdentity.mockImplementation((_id, load) =>
    load({ query: state.query }),
  );
});
afterEach(() => vi.unstubAllEnvs());

it("loads only the anonymous active catalogue, never account-specific data", async () => {
  state.query.mockResolvedValue({ rows: [{ data: catalog }] });
  expect(await publicTaxonomyCatalog()).toEqual(catalog);
  expect(state.withIdentity).toHaveBeenCalledWith("", expect.any(Function));
  expect(state.query).toHaveBeenCalledExactlyOnceWith(
    "SELECT beauty.taxonomy_catalog($1) AS data",
    [false],
  );
});

it("coalesces concurrent cold fills into one database request", async () => {
  let finish!: (value: unknown) => void;
  state.query.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const requests = Array.from({ length: 20 }, () => publicTaxonomyCatalog());
  expect(state.query).toHaveBeenCalledTimes(1);
  finish({ rows: [{ data: catalog }] });
  expect(await Promise.all(requests)).toHaveLength(20);
});

it("propagates a failed fill and permits a fresh retry instead of caching empty data", async () => {
  state.query.mockRejectedValueOnce(new Error("isolated unavailable"));
  await expect(publicTaxonomyCatalog()).rejects.toThrow("isolated unavailable");
  state.query.mockResolvedValueOnce({ rows: [{ data: catalog }] });
  expect(await publicTaxonomyCatalog()).toEqual(catalog);
  expect(state.query).toHaveBeenCalledTimes(2);
});

it("makes no database request in credential-free fixtures", async () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(await publicTaxonomyCatalog()).toEqual(catalog);
  expect(state.withIdentity).not.toHaveBeenCalled();
});
