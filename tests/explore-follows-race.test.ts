// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ExploreMapExperience } from "@/components/explore-map-experience";
import { defaultDiscoveryFilters } from "@/modules/professionals/discovery";
import type { PublicProfessional } from "@/modules/professionals/domain";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/professional-locator-map", () => ({
  ProfessionalLocatorMap: () => null,
}));
vi.mock("@/components/taxonomy-filters", () => ({
  TaxonomyFilters: () => null,
}));
vi.mock("@/components/professional-directions", () => ({
  ProfessionalDirections: () => null,
}));
const pro = (id: string): PublicProfessional => ({
  id,
  slug: id,
  business_name: id,
  bio: "",
  city: "London",
  category: "Hair",
  verification_status: "unverified",
  rating: null,
  review_count: 0,
  from_price_pence: 1000,
});
it("does not let a cancelled follow response overwrite newer map results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let resolveOld: (x: unknown) => void = () => {};
  const oldJson = new Promise((r) => (resolveOld = r));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => oldJson })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ states: { new: { following: true } } }),
    });
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    const render = (id: string) =>
      React.createElement(ExploreMapExperience, {
        professionals: [pro(id)],
        query: "",
        filters: defaultDiscoveryFilters,
        signedIn: true,
      });
    await act(async () => root.render(render("old")));
    await act(async () => root.render(render("new")));
    expect(
      container
        .querySelector('[aria-label="Unsave new"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    await act(async () =>
      resolveOld({ states: { old: { following: false } } }),
    );
    expect(
      container
        .querySelector('[aria-label="Unsave new"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
