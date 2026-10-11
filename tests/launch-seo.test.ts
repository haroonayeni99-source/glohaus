import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoveryCursor,
  discoveryHref,
  discoveryOptions,
} from "@/modules/professionals/discovery";
import { jsonLd, publicMetadata, publicPages } from "@/lib/public-seo";
import robots from "@/app/robots";
afterEach(() => vi.unstubAllEnvs());
describe("Launch indexing boundary", () => {
  it("indexes only the public allowlist in production, with one canonical domain", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    for (const [path, [title, description]] of Object.entries(publicPages)) {
      const metadata = publicMetadata(path, title, description);
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(metadata.alternates?.canonical).toBe(
        `https://www.glohaus.shop${path}`,
      );
    }
    expect(Object.keys(publicPages)).not.toContain("/professional-preview");
    expect(Object.keys(publicPages)).not.toContain("/admin");
    expect(robots().sitemap).toBe("https://www.glohaus.shop/sitemap.xml");
  });
  it("keeps preview deployments out of Google", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(publicMetadata("/", "Test", "Description").robots).toEqual({
      index: false,
      follow: true,
    });
  });
  it("safely escapes user content embedded in structured data", () => {
    expect(
      jsonLd({ name: "</script><script>alert(1)</script>" }),
    ).not.toContain("<");
  });
});
describe("Combined discovery filters", () => {
  it("preserves area, service, price and rating through pagination and rejects stale cursors", () => {
    const params = {
      q: "Studio",
      location: "Brixton",
      category: "Nails",
      price: "60",
      rating: "4",
      verified: "1",
    };
    const options = discoveryOptions(params);
    const cursor = discoveryCursor(
      { id: "11111111-1111-4111-8111-111111111111", business_name: "Studio" },
      options.query,
      options.filters,
    );
    expect(discoveryOptions({ ...params, after: cursor }).after).toBeDefined();
    expect(
      discoveryOptions({ ...params, location: "Soho", after: cursor }).after,
    ).toBeUndefined();
    const url = new URL(
      discoveryHref(options.query, options.filters, cursor),
      "https://www.glohaus.shop",
    );
    expect(url.searchParams.get("location")).toBe("Brixton");
    expect(url.searchParams.get("category")).toBe("Nails");
    expect(url.searchParams.get("price")).toBe("60");
    expect(url.searchParams.get("rating")).toBe("4");
    expect(url.searchParams.get("after")).toBe(cursor);
  });
  it("ignores malformed or out of range price and rating", () => {
    const { filters } = discoveryOptions({
      price: "Infinity",
      rating: "6",
      location: ["Brixton"],
    });
    expect(filters.maxPricePence).toBeUndefined();
    expect(filters.minRating).toBeUndefined();
    expect(filters.location).toBeUndefined();
  });
});
