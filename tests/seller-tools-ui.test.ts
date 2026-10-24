// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SellerAwaySettings } from "@/components/seller-away-settings";
import { ProductDescriptionHelper } from "@/components/product-description-helper";
import { ProductOrderReplyHelper } from "@/components/product-order-reply-helper";
import { orderReplyDraft } from "@/modules/shop/seller";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
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
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("pauses a shop only after a successful save and permits retry after failure", async () => {
  await act(async () =>
    root.render(
      React.createElement(SellerAwaySettings, {
        initialSettings: { away: false, awayUntil: null },
      }),
    ),
  );
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .click(),
  );
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 503 }));
  await submit();
  expect(container.querySelector(".seller-badge")!.textContent).toBe(
    "Accepting orders",
  );
  expect(container.textContent).toContain("could not be saved");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ settings: { away: true, awayUntil: null } }),
  );
  await submit();
  expect(container.querySelector(".seller-badge")!.textContent).toBe(
    "New orders paused",
  );
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toEqual(
    { away: true, awayUntil: null },
  );
});
it("does not present an expired pause as an active setting", async () => {
  await act(async () =>
    root.render(
      React.createElement(SellerAwaySettings, {
        initialSettings: { away: true, awayUntil: "2020-01-01T00:00:00Z" },
      }),
    ),
  );
  expect(
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      .checked,
  ).toBe(false);
  expect(container.querySelector(".seller-badge")!.textContent).toBe(
    "Accepting orders",
  );
});
it("never auto-applies or auto-publishes a product description", async () => {
  const apply = vi.fn();
  await act(async () =>
    root.render(
      React.createElement(ProductDescriptionHelper, {
        name: "Hair oil",
        onApply: apply,
      }),
    ),
  );
  expect(container.querySelector<HTMLButtonElement>("button")!.disabled).toBe(
    true,
  );
  expect(apply).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain("confirmed facts");
});
it("prepares buyer replies locally without sending a message", async () => {
  const order = {
    status: "shipped" as const,
    trackingCarrier: "Royal Mail",
    trackingNumber: "FIXTURE123",
  };
  await act(async () =>
    root.render(React.createElement(ProductOrderReplyHelper, { order })),
  );
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("textarea")!.value).toContain("Royal Mail");
  expect(container.querySelector("textarea")!.value).toContain("FIXTURE123");
  expect(container.textContent).toContain("has not been sent");
  expect(fetch).not.toHaveBeenCalled();
  expect(
    orderReplyDraft({ ...order, status: "refund_pending" }, "status"),
  ).not.toContain("confirmed your refund");
  expect(orderReplyDraft(order, "issue")).not.toContain("approved");
});
