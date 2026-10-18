import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withIdentity: vi.fn(),
  categories: vi.fn(),
  products: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ withIdentity: mocks.withIdentity }));
vi.mock("@/modules/shop/repository", () => ({
  productCategories: mocks.categories,
  publicProducts: mocks.products,
}));
vi.mock("@/lib/public-viewer", () => ({
  publicViewerSignedIn: async () => false,
}));
vi.mock("@/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("@/components/bottom-navigation", () => ({
  BottomNavigation: () => null,
}));
vi.mock("@/components/add-to-cart-button", () => ({
  AddToCartButton: () => null,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props, children),
}));
vi.mock("next/image", () => ({ default: () => null }));
import ShopPage from "@/app/shop/page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "test-only");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.withIdentity.mockImplementation(
    async (_identity: string, work: (db: unknown) => unknown) => work({}),
  );
  mocks.categories.mockResolvedValue([]);
  mocks.products.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function page(params = {}) {
  return new JSDOM(
    renderToStaticMarkup(
      await ShopPage({ searchParams: Promise.resolve(params) }),
    ),
  ).window.document;
}

it("keeps successful empty catalogues distinct from outages", async () => {
  const document = await page();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.body.textContent).toContain(
    "Marketplace products are coming in.",
  );
  expect(mocks.withIdentity).toHaveBeenCalledOnce();
});

it.each(["connection", "categories", "products"])(
  "shows an outage instead of an empty catalogue when %s fails",
  async (source) => {
    const error = Object.assign(new Error("private connection details"), {
      code: "08006",
    });
    if (source === "connection") mocks.withIdentity.mockRejectedValue(error);
    if (source === "categories") mocks.categories.mockRejectedValue(error);
    if (source === "products") mocks.products.mockRejectedValue(error);
    const categoryId = "11111111-1111-4111-8111-111111111111";
    const document = await page({
      q: "Oil & care",
      collection: "deals",
      categoryId,
    });
    const alert = document.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("The marketplace couldn’t load.");
    const retry = new URL(
      alert.querySelector("a")!.href,
      "https://www.glohaus.shop",
    );
    expect(retry.searchParams.get("q")).toBe("Oil & care");
    expect(retry.searchParams.get("collection")).toBe("deals");
    expect(retry.searchParams.get("categoryId")).toBe(categoryId);
    expect(document.body.textContent).not.toMatch(
      /No offers|No paid sales|coming in|fake listings|private connection/,
    );
    expect(document.body.textContent).toContain(
      "Featured products are temporarily unavailable.",
    );
    expect(console.error).toHaveBeenCalledWith("Shop catalogue unavailable", {
      type: "Error",
      code: "08006",
    });
  },
);

it("shows an outage when database configuration is missing", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const document = await page();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "temporarily unavailable",
  );
  expect(mocks.withIdentity).not.toHaveBeenCalled();
});

it("still renders real products and forwards the selected filters", async () => {
  mocks.products.mockResolvedValue([
    {
      id: "product",
      name: "Fixture Oil",
      description: "Hair oil",
      price_pence: 2000,
      in_stock: true,
      professional_slug: "fixture",
      professional_name: "Fixture Studio",
      compare_at_price_pence: 3000,
      sold_units: 2,
      recent_sold_units: 1,
    },
  ]);
  const document = await page({ q: "Oil", collection: "deals" });
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(
    document.querySelector('[aria-label="Published products"]')?.textContent,
  ).toContain("Fixture Oil");
  expect(mocks.products).toHaveBeenCalledWith(
    {},
    { query: "Oil", collection: "deals", categoryId: undefined },
  );
});
