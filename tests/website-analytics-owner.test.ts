import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  owner: true,
  query: vi.fn(async () => ({ rows: [{ data: [] }] })),
}));
vi.mock("@/lib/page-access", () => ({
  pageAccount: vi.fn(async () => ({
    account: { roles: state.owner ? ["owner"] : ["admin"] },
    error: null,
  })),
}));
vi.mock("@/modules/admin/repository", () => ({
  withOwner: vi.fn(
    async (work: (db: { query: typeof state.query }) => unknown) =>
      work({ query: state.query }),
  ),
}));
import Page from "@/app/admin/engagement/page";
afterEach(() => {
  vi.unstubAllEnvs();
  state.owner = true;
  vi.clearAllMocks();
});
it("denies delegated Admin access before reading analytics", async () => {
  state.owner = false;
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Owner access required");
  expect(html).not.toContain("Page performance");
  expect(state.query).not.toHaveBeenCalled();
});
it("shows an honest disabled state without fabricated customer totals", async () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "");
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Tracking is not activated");
  expect(html).toContain("There are no historical engagement figures");
  expect(html).not.toContain("Page performance");
  expect(state.query).not.toHaveBeenCalled();
});
it("renders the actual report sections from authorised stored observations", async () => {
  vi.stubEnv("ENGAGEMENT_ANALYTICS_ENABLED", "true");
  vi.stubEnv(
    "ENGAGEMENT_ANALYTICS_SECRET",
    "test-only-analytics-secret-123456789012",
  );
  const html = renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ period: "week" }) }),
  );
  for (const text of [
    "Page performance",
    "Median engagement",
    "Mobile, tablet",
    "Conversion funnels",
    "Discover video performance",
    "Common customer journeys",
    "Worth investigating",
    "No consented page views",
  ])
    expect(html).toContain(text);
  expect(state.query).toHaveBeenCalledOnce();
});
