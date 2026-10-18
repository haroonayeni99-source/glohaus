import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  withIdentity: vi.fn(),
  discovery: vi.fn(),
  taxonomy: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ withIdentity: mocks.withIdentity }));
vi.mock("@/modules/professionals/repository", () => ({
  discoveryPage: mocks.discovery,
}));
vi.mock("@/modules/taxonomy/repository", () => ({
  taxonomyCatalog: mocks.taxonomy,
}));
vi.mock("@/lib/public-viewer", () => ({
  publicViewerSignedIn: async () => false,
}));
vi.mock("@/components/public-header", () => ({ PublicHeader: () => null }));
vi.mock("@/components/bottom-navigation", () => ({
  BottomNavigation: () => null,
}));
vi.mock("@/components/explore-map-experience", () => ({
  ExploreMapExperience: ({
    loadFailed,
    query,
  }: {
    loadFailed: boolean;
    query: string;
  }) =>
    React.createElement("div", {
      "data-failed": loadFailed,
      "data-query": query,
    }),
}));
import Explore from "@/app/explore/page";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "test-only");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.withIdentity.mockImplementation(
    async (_identity: string, work: (db: unknown) => unknown) => work({}),
  );
  mocks.discovery.mockResolvedValue({ professionals: [], next: null });
  mocks.taxonomy.mockResolvedValue({
    categories: [],
    specialities: [],
    templates: [],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function html() {
  return renderToStaticMarkup(
    await Explore({
      searchParams: Promise.resolve({ q: "nails", location: "Southwark" }),
    }),
  );
}
it("loads results and taxonomy with one connection and distinguishes successful zero results", async () => {
  expect(await html()).toContain('data-failed="false"');
  expect(mocks.withIdentity).toHaveBeenCalledOnce();
  expect(mocks.discovery).toHaveBeenCalledWith(
    {},
    "nails",
    undefined,
    expect.objectContaining({ location: "Southwark" }),
  );
});
it("marks a failed database read as unavailable while preserving the search", async () => {
  mocks.withIdentity.mockRejectedValue(new Error("offline"));
  const result = await html();
  expect(result).toContain('data-failed="true"');
  expect(result).toContain('data-query="nails"');
});
it("also exposes missing database configuration and taxonomy failures as unavailable", async () => {
  mocks.taxonomy.mockRejectedValue(new Error("catalogue offline"));
  expect(await html()).toContain('data-failed="true"');
  mocks.withIdentity.mockClear();
  vi.stubEnv("DATABASE_URL", "");
  expect(await html()).toContain('data-failed="true"');
  expect(mocks.withIdentity).not.toHaveBeenCalled();
});
