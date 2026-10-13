import { describe, expect, it } from "vitest";
import {
  catalogueProducts,
  shopCollection,
  shopHref,
} from "@/modules/shop/catalogue";
import type { PublicProduct } from "@/modules/shop/domain";
const product = (
  id: string,
  units: number,
  recent: number,
  previous: number | null = null,
): PublicProduct => ({
  id,
  professional_id: "pro",
  image_asset_id: null,
  name: "Oil",
  description: "",
  price_pence: 2000,
  compare_at_price_pence: previous,
  in_stock: true,
  professional_slug: "studio",
  professional_name: "Studio",
  updated_at: new Date("2026-10-01"),
  created_at: new Date(id === "b" ? "2026-10-02" : "2026-09-01"),
  sold_units: String(units),
  recent_sold_units: String(recent),
});
const products = [
  product("a", 10, 1),
  product("b", 2, 2, 3000),
  product("c", 0, 0),
];
describe("Shop collection semantics", () => {
  it("uses distinct lifetime, recent and discount signals", () => {
    expect(
      catalogueProducts(products, "", "bestsellers").map((p) => p.id),
    ).toEqual(["a", "b"]);
    expect(
      catalogueProducts(products, "", "trending").map((p) => p.id),
    ).toEqual(["b", "a"]);
    expect(catalogueProducts(products, "", "deals").map((p) => p.id)).toEqual([
      "b",
    ]);
    expect(catalogueProducts(products, "", "new")[0].id).toBe("b");
    expect(products.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("preserves user searches in links and rejects malformed collections", () => {
    const url = new URL(
      shopHref("deals", "Oil & care"),
      "https://www.glohaus.shop",
    );
    expect(url.searchParams.get("q")).toBe("Oil & care");
    expect(url.searchParams.get("collection")).toBe("deals");
    expect(shopCollection(["deals"])).toBeUndefined();
    expect(shopCollection("constructor")).toBeUndefined();
    expect(catalogueProducts(products, "nonexistent", "trending")).toEqual([]);
  });
});
