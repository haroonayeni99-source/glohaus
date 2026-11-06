import { afterEach, expect, it, vi } from "vitest";
import { emptyTaxonomy } from "@/modules/taxonomy/domain";
const m = vi.hoisted(() => ({
  viewer: vi.fn(),
  postcode: vi.fn(),
  catalog: vi.fn(),
  discovery: vi.fn(),
  db: vi.fn(),
}));
vi.mock("@/lib/public-viewer", () => ({ publicViewerSignedIn: m.viewer }));
vi.mock("@/modules/professionals/postcode-search", () => ({
  resolvePostcodeLocation: m.postcode,
}));
vi.mock("@/modules/taxonomy/public-catalog", () => ({
  publicTaxonomyCatalog: m.catalog,
}));
vi.mock("@/modules/professionals/repository", () => ({
  discoveryPage: m.discovery,
}));
vi.mock("@/lib/db", () => ({
  withIdentity: async (_id: string, work: (db: object) => unknown) => {
    m.db();
    return work({});
  },
}));
vi.mock("@/modules/professionals/example-visibility-repository", () => ({
  readExampleVisibility: async () => ({ enabled: false, hiddenSlugs: [] }),
}));
import Explore from "@/app/explore/page";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("starts independent discovery lookups together instead of waiting for identity first", async () => {
  vi.stubEnv("DATABASE_URL", "test-connection-not-used");
  let viewer: (x: boolean) => void = () => {};
  let postcode: (x: null) => void = () => {};
  let catalog: (x: typeof emptyTaxonomy) => void = () => {};
  m.viewer.mockImplementationOnce(() => new Promise((r) => (viewer = r)));
  m.postcode.mockImplementationOnce(() => new Promise((r) => (postcode = r)));
  m.catalog.mockImplementationOnce(() => new Promise((r) => (catalog = r)));
  m.discovery.mockResolvedValueOnce({ professionals: [], next: null });
  const result = Explore({
    searchParams: Promise.resolve({ location: "SE15" }),
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(m.viewer).toHaveBeenCalledOnce();
  expect(m.postcode).toHaveBeenCalledOnce();
  expect(m.catalog).toHaveBeenCalledOnce();
  expect(m.db).not.toHaveBeenCalled();
  viewer(false);
  postcode(null);
  catalog(emptyTaxonomy);
  await result;
  expect(m.db).toHaveBeenCalledOnce();
  expect(m.discovery).toHaveBeenCalledOnce();
});
it("keeps catalogue outages inside the existing unavailable/retry path", async () => {
  vi.stubEnv("DATABASE_URL", "test-connection-not-used");
  m.viewer.mockResolvedValueOnce(false);
  m.postcode.mockResolvedValueOnce(null);
  m.catalog.mockRejectedValueOnce(new Error("Catalogue unavailable"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const tree = await Explore({ searchParams: Promise.resolve({}) });
    expect(tree).toBeTruthy();
    expect(m.db).not.toHaveBeenCalled();
    expect(m.discovery).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
