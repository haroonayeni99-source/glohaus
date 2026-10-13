// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { CartManager } from "@/components/cart-manager";
import { cartErrorMessage } from "@/modules/shop/cart-feedback";
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it.each([
  "PRODUCT_UNAVAILABLE",
  "INSUFFICIENT_STOCK",
  "INVALID_QUANTITY",
  "SELF_PURCHASE_NOT_ALLOWED",
])("explains %s and allows another add attempt", async (code) => {
  await act(async () =>
    root.render(
      React.createElement(AddToCartButton, { productId: "test-product" }),
    ),
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code } }, { status: 409 }),
  );
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain(cartErrorMessage(code));
  expect(container.textContent).not.toContain("temporarily unavailable");
  expect(container.querySelector("button")!.disabled).toBe(false);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ cart: { itemCount: 1 } }, { status: 201 }),
  );
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("Added · 1 item in cart");
});
it("shows an actionable stock message without discarding cart items", async () => {
  await act(async () =>
    root.render(
      React.createElement(CartManager, {
        initialCart: {
          items: [
            {
              productId: "test-product",
              professionalId: "pro",
              professionalSlug: "studio",
              professionalName: "Test studio",
              name: "Hair oil",
              imageAssetId: null,
              pricePence: 1000,
              quantity: 2,
              available: true,
              inStockForQuantity: true,
            },
          ],
          totalPence: 2000,
          itemCount: 2,
        },
      }),
    ),
  );
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: "INSUFFICIENT_STOCK" } }, { status: 409 }),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Increase quantity"]')!
      .click(),
  );
  expect(container.textContent).toContain(
    cartErrorMessage("INSUFFICIENT_STOCK"),
  );
  expect(container.textContent).toContain("Hair oil");
  expect(container.textContent).toContain("£20.00");
  expect(
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Increase quantity"]',
    )!.disabled,
  ).toBe(false);
});
it("does not interpret inherited keys as cart errors", () => {
  expect(cartErrorMessage("toString")).toBeUndefined();
  expect(cartErrorMessage("UNAVAILABLE")).toBeUndefined();
});
