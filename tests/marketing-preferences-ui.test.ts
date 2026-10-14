// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketingPreferencesForm } from "@/components/marketing-preferences-form";
import { POST } from "@/app/api/v1/account/marketing-preferences/route";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/api-account", () => ({
  withAccount: async (_: unknown, work: (db: object) => unknown) =>
    work({ query: mocks.query }),
}));
const stored = {
  customer_offers: true,
  new_professionals: false,
  availability: false,
  discover: false,
  shop: false,
  rebooking: false,
  professional_growth: true,
  marketplace_features: false,
  professional_promotions: false,
  academy: false,
  milestones: false,
  shop_selling: false,
  updated_at: "2026-10-14T12:00:00Z",
  unsubscribe_token: "private-token",
};
let root: Root;
let container: HTMLDivElement;
const checkbox = (index = 0) =>
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index];
async function render(professional = true) {
  await act(async () =>
    root.render(
      React.createElement(MarketingPreferencesForm, {
        initial: stored,
        professional,
      }),
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mocks.query.mockImplementation(async (_sql, [payload]) => {
    const p = JSON.parse(payload);
    return {
      rows: [
        {
          data: {
            ...stored,
            customer_offers: p.customerOffers,
            professional_growth: p.professionalGrowth,
          },
        },
      ],
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      POST(
        new Request(
          "https://glohaus.test/api/v1/account/marketing-preferences",
          {
            ...init,
            headers: {
              origin: "https://glohaus.test",
              "content-type": "application/json",
            },
          },
        ),
      ),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("loads saved database choices and saves toggles through the real strict route without metadata", async () => {
  await render();
  expect(checkbox().checked).toBe(true);
  expect(checkbox(6).checked).toBe(true);
  await act(async () => checkbox().click());
  expect(mocks.query).toHaveBeenCalledOnce();
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body.customerOffers).toBe(false);
  expect(body.professionalGrowth).toBe(true);
  expect(body).not.toHaveProperty("customer_offers");
  expect(body).not.toHaveProperty("updated_at");
  expect(body).not.toHaveProperty("unsubscribe_token");
  expect(checkbox().checked).toBe(false);
  expect(container.textContent).toContain("Marketing preferences saved.");
  await act(async () => checkbox().click());
  expect(checkbox().checked).toBe(true);
});
it("updates immediately, shows saving feedback and restores the persisted choice on failure", async () => {
  await render();
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => checkbox().click());
  expect(checkbox().checked).toBe(false);
  expect(checkbox().disabled).toBe(true);
  expect(container.textContent).toContain("Saving preferences");
  await act(async () =>
    finish(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 })),
  );
  expect(checkbox().checked).toBe(true);
  expect(checkbox().disabled).toBe(false);
  expect(container.textContent).toContain("could not be saved");
  await act(async () => checkbox().click());
  expect(checkbox().checked).toBe(false);
});
it("unsubscribes every category, including professional choices on a customer view", async () => {
  await render(false);
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
  await act(async () => container.querySelector("button")!.click());
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(Object.keys(body)).toHaveLength(12);
  expect(Object.values(body).every((value) => value === false)).toBe(true);
  expect(container.textContent).toContain("Marketing preferences saved.");
});
